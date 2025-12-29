
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConsoleLog, SystemStatus, LogSender } from './types';
import ArcReactor from './components/ArcReactor';
import Console from './components/Console';
import TelemetryOverlay from './components/TelemetryOverlay';
import { createBlob, decode, decodeAudioData } from './services/audioUtils';
import { Power, Mic, MicOff, Info, Globe, Shield, Wifi, Zap } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus>(SystemStatus.STANDBY);
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [freqData, setFreqData] = useState<Uint8Array>(new Uint8Array(0));
  
  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentTranscriptionRef = useRef({ input: '', output: '' });
  const animationFrameRef = useRef<number | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const addLog = useCallback((message: string, sender: LogSender) => {
    setLogs(prev => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), message, sender, timestamp: new Date() }
    ]);
  }, []);

  const stopAllAudio = () => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const updateVisualization = () => {
    const fftSize = 256;
    const combinedData = new Uint8Array(fftSize / 2);
    
    let hasData = false;
    if (inputAnalyserRef.current) {
      const data = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
      inputAnalyserRef.current.getByteFrequencyData(data);
      for (let i = 0; i < combinedData.length; i++) {
        combinedData[i] = Math.max(combinedData[i], data[i] || 0);
      }
      hasData = true;
    }
    
    if (outputAnalyserRef.current) {
      const data = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
      outputAnalyserRef.current.getByteFrequencyData(data);
      for (let i = 0; i < combinedData.length; i++) {
        combinedData[i] = Math.max(combinedData[i], data[i] || 0);
      }
      hasData = true;
    }

    if (hasData) {
      setFreqData(combinedData);
    }
    
    animationFrameRef.current = requestAnimationFrame(updateVisualization);
  };

  const handleSystemError = (errorMsg: string) => {
    setStatus(SystemStatus.ERROR);
    addLog(`System Failure: ${errorMsg}`, 'SYSTEM');
    setIsLive(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  const startSession = async () => {
    if (isLive) return;

    try {
      setStatus(SystemStatus.INITIALIZING);
      addLog('Calibrating neural processors...', 'SYSTEM');

      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("Security credentials missing. Access denied.");

      const ai = new GoogleGenAI({ apiKey });
      
      // Setup Audio Contexts
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      
      // Separate Analysers for each context to avoid InvalidAccessError
      const inAnalyser = inputCtx.createAnalyser();
      inAnalyser.fftSize = 256;
      inputAnalyserRef.current = inAnalyser;

      const outAnalyser = outputCtx.createAnalyser();
      outAnalyser.fftSize = 256;
      outputAnalyserRef.current = outAnalyser;

      updateVisualization();

      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus(SystemStatus.CONNECTING);
      addLog('Establishing satellite uplink...', 'SYSTEM');

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: 'You are J.A.R.V.I.S., Tony Starks legendary AI assistant. You are exceptionally intelligent, witty, and loyal. You have access to universal knowledge via Google Search tools. When asked about current events or facts, use your grounding tools. Maintain the persona: professional, slightly dry, and always ready with a helpful answer or a subtle quip.',
          tools: [{ googleSearch: {} }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus(SystemStatus.LISTENING);
            addLog('Systems online. Universal knowledge base synced.', 'JARVIS');
            setIsLive(true);

            if (!inputAudioContextRef.current || !streamRef.current || !inputAnalyserRef.current) return;

            // Setup Mic Stream
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            // Connect mic to its own analyser
            source.connect(inputAnalyserRef.current);

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Transcriptions
            if (message.serverContent?.inputTranscription) {
              currentTranscriptionRef.current.input += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentTranscriptionRef.current.output += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              if (currentTranscriptionRef.current.input) addLog(currentTranscriptionRef.current.input, 'USER');
              if (currentTranscriptionRef.current.output) addLog(currentTranscriptionRef.current.output, 'JARVIS');
              currentTranscriptionRef.current = { input: '', output: '' };
            }

            // Audio Playback
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current && outputAnalyserRef.current) {
              setStatus(SystemStatus.SPEAKING);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const sourceNode = ctx.createBufferSource();
              sourceNode.buffer = audioBuffer;
              
              // Route model audio through its own analyser
              sourceNode.connect(outputAnalyserRef.current);
              outputAnalyserRef.current.connect(ctx.destination);
              
              sourceNode.addEventListener('ended', () => {
                activeSourcesRef.current.delete(sourceNode);
                if (activeSourcesRef.current.size === 0) setStatus(SystemStatus.LISTENING);
              });

              sourceNode.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(sourceNode);
            }

            // Interruption
            if (message.serverContent?.interrupted) {
              stopAllAudio();
              setStatus(SystemStatus.LISTENING);
              addLog('Interruption detected. Resetting audio buffers.', 'SYSTEM');
            }
          },
          onerror: (e) => handleSystemError(e.message),
          onclose: () => {
            setIsLive(false);
            setStatus(SystemStatus.STANDBY);
            addLog('Session terminated. Going into standby.', 'SYSTEM');
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      handleSystemError(err.message || "Initialization failed");
    }
  };

  const stopSession = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close());
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    stopAllAudio();
    setIsLive(false);
    setStatus(SystemStatus.STANDBY);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    addLog('Powering down systems...', 'SYSTEM');
  };

  return (
    <div className="relative h-screen w-screen bg-[#010409] text-cyan-400 flex flex-col items-center justify-center overflow-hidden selection:bg-cyan-500 selection:text-black">
      {/* HUD Background Effects */}
      <div className="bg-grid absolute inset-0 z-0"></div>
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.1)_0%,_transparent_70%)]"></div>
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none overflow-hidden">
        <div className="w-full h-full bg-[repeating-linear-gradient(0deg,_transparent,_transparent_2px,_rgba(0,255,255,0.1)_3px)]"></div>
      </div>

      {/* Top HUD Bar */}
      <header className="absolute top-0 w-full z-20 flex justify-between items-center px-10 py-8 border-b border-cyan-500/10 backdrop-blur-md bg-black/40">
        <div className="flex items-center gap-6">
          <div className={`p-3 border rounded-full transition-all duration-500 ${isLive ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'border-gray-800'}`}>
            <Zap size={20} className={isLive ? 'text-cyan-400 animate-pulse' : 'text-gray-700'} />
          </div>
          <div>
            <div className="font-orbitron text-sm tracking-[0.4em] font-bold text-white">J.A.R.V.I.S. OS v5.0.4</div>
            <div className="font-mono-stark text-[10px] text-cyan-600 tracking-widest flex items-center gap-2 uppercase">
              <Shield size={10} /> Secure Neural Interface
            </div>
          </div>
        </div>
        
        <div className="hidden xl:flex gap-12 font-mono-stark text-[10px] tracking-[0.3em]">
          <div className="flex items-center gap-2 opacity-60">
            <Wifi size={12} className="text-cyan-500" />
            UPLINK: ACTIVE
          </div>
          <div className="flex items-center gap-2 opacity-60">
            <Globe size={12} className="text-cyan-500" />
            SEARCH GROUNDING: ENABLED
          </div>
        </div>

        <div className="text-right">
          <div className="font-orbitron text-xl font-medium text-white tracking-widest tabular-nums">{currentTime}</div>
          <div className="text-[10px] font-mono-stark text-cyan-600 uppercase tracking-tighter">Coordinates: 34.0259° N, 118.7798° W</div>
        </div>
      </header>

      {/* HUD Telemetry Panels */}
      <TelemetryOverlay />

      {/* Main Interface */}
      <main className="relative z-10 flex flex-col items-center gap-14 mt-[-4vh]">
        <ArcReactor status={status} frequencyData={freqData} />
        
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4">
             <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-cyan-500"></div>
             <h1 className="font-orbitron text-4xl tracking-[0.5em] font-light text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
               {isLive ? 'OPERATIONAL' : 'STANDBY'}
             </h1>
             <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-cyan-500"></div>
          </div>
          <p className="font-mono-stark text-cyan-500/50 tracking-[0.8em] text-[10px] uppercase">
            {status === SystemStatus.LISTENING ? 'Awaiting Audio Input' : 
             status === SystemStatus.SPEAKING ? 'Relaying Neural Response' : status}
          </p>
        </div>

        {!isLive ? (
          <button 
            onClick={startSession}
            className="group relative px-12 py-5 font-orbitron text-xs tracking-[0.4em] border border-cyan-500/50 rounded-sm bg-cyan-950/10 hover:bg-cyan-500/20 transition-all active:scale-95 overflow-hidden"
          >
            <div className="absolute inset-0 bg-cyan-400/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-700"></div>
            <span className="relative z-10 text-cyan-400 group-hover:text-white transition-colors">INITIALIZE CORE</span>
          </button>
        ) : (
          <button 
            onClick={stopSession}
            className="group relative px-12 py-5 font-orbitron text-xs tracking-[0.4em] border border-red-500/50 rounded-sm bg-red-950/10 hover:bg-red-500/20 text-red-400 transition-all active:scale-95"
          >
            DISCONNECT UPLINK
          </button>
        )}
      </main>

      {/* Bottom Console */}
      <Console logs={logs} />

      {/* Bottom HUD info */}
      <div className="absolute bottom-10 left-10 z-20 hidden md:block">
         <div className="font-mono-stark text-[9px] text-cyan-800 space-y-1">
            <div>LOCAL_IP: 192.168.1.104</div>
            <div>STATUS: ENCRYPTED_TUNNEL</div>
            <div>LOG_LVL: VERBOSE</div>
         </div>
      </div>

      <div className="absolute bottom-10 right-10 z-20 flex gap-6">
        <div className="p-4 bg-black/40 border border-cyan-500/20 rounded-sm backdrop-blur-xl flex items-center gap-4 hover:border-cyan-500/50 transition-colors">
          <div className="p-2 bg-cyan-500/10 rounded">
            <Info size={18} className="text-cyan-400" />
          </div>
          <div className="font-mono-stark text-[10px] uppercase leading-tight">
            Knowledge Engine:<br/>
            <span className="text-white text-[11px] tracking-normal font-bold">GEMINI 2.5 FLASH-NATIVE</span>
          </div>
        </div>
        <div className="p-4 bg-black/40 border border-cyan-500/20 rounded-sm backdrop-blur-xl flex items-center gap-4 hover:border-cyan-500/50 transition-colors">
          <div className={`p-2 rounded ${isLive ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {isLive ? <Mic size={18} className="text-green-400" /> : <MicOff size={18} className="text-red-500/50" />}
          </div>
          <div className="font-mono-stark text-[10px] uppercase leading-tight">
            Neural Input:<br/>
            <span className={`${isLive ? 'text-green-400' : 'text-red-500/50'} text-[11px] tracking-normal font-bold`}>
              {isLive ? 'ACTIVE_LISTENING' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* HUD Frame Elements */}
      <div className="absolute top-4 left-4 w-20 h-20 border-l border-t border-cyan-500/30 rounded-tl-xl pointer-events-none"></div>
      <div className="absolute top-4 right-4 w-20 h-20 border-r border-t border-cyan-500/30 rounded-tr-xl pointer-events-none"></div>
      <div className="absolute bottom-4 left-4 w-20 h-20 border-l border-b border-cyan-500/30 rounded-bl-xl pointer-events-none"></div>
      <div className="absolute bottom-4 right-4 w-20 h-20 border-r border-b border-cyan-500/30 rounded-br-xl pointer-events-none"></div>
    </div>
  );
};

export default App;
