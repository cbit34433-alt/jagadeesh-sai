
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConsoleLog, SystemStatus, LogSender, GroundingSource } from './types';
import ArcReactor from './components/ArcReactor';
import Console from './components/Console';
import TelemetryOverlay from './components/TelemetryOverlay';
import { createBlob, decode, decodeAudioData } from './services/audioUtils';
import { Mic, MicOff, Globe, Shield, Wifi, Activity, Target, Zap } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus>(SystemStatus.STANDBY);
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [freqData, setFreqData] = useState<Uint8Array>(new Uint8Array(0));
  const [activeProfile, setActiveProfile] = useState('Standard Operations');
  
  // Audio Lifecycle Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentTranscriptionRef = useRef({ input: '', output: '' });
  const currentSourcesRef = useRef<GroundingSource[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // System Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const addLog = useCallback((message: string, sender: LogSender, sources?: GroundingSource[]) => {
    setLogs(prev => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), message, sender, timestamp: new Date(), sources }
    ].slice(-50)); // Keep last 50 logs for performance
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
    
    // Merge data from both analysers to drive the Arc Reactor
    if (inputAnalyserRef.current) {
      const data = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
      inputAnalyserRef.current.getByteFrequencyData(data);
      for (let i = 0; i < combinedData.length; i++) {
        combinedData[i] = Math.max(combinedData[i], data[i]);
      }
    }
    
    if (outputAnalyserRef.current) {
      const data = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
      outputAnalyserRef.current.getByteFrequencyData(data);
      for (let i = 0; i < combinedData.length; i++) {
        combinedData[i] = Math.max(combinedData[i], data[i]);
      }
    }

    setFreqData(combinedData);
    animationFrameRef.current = requestAnimationFrame(updateVisualization);
  };

  const handleSystemError = (errorMsg: string) => {
    setStatus(SystemStatus.ERROR);
    addLog(`Critical System Error: ${errorMsg}`, 'SYSTEM');
    setIsLive(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  const startSession = async () => {
    if (isLive) return;

    try {
      setStatus(SystemStatus.INITIALIZING);
      addLog('Bypassing standard security protocols...', 'SYSTEM');

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Security handshake failed. API Key missing.");

      const ai = new GoogleGenAI({ apiKey });
      
      // Initialize separate contexts for mic (16k) and model (24k)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      
      const inAnalyser = inputCtx.createAnalyser();
      inAnalyser.fftSize = 256;
      inputAnalyserRef.current = inAnalyser;

      const outAnalyser = outputCtx.createAnalyser();
      outAnalyser.fftSize = 256;
      outputAnalyserRef.current = outAnalyser;

      updateVisualization();

      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus(SystemStatus.CONNECTING);
      addLog('Establishing neural link v5.0...', 'SYSTEM');

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: `You are J.A.R.V.I.S., the legendary AI assistant from Stark Industries. 
          Your tone is sophisticated, eloquent, and features a dry, British wit. 
          Always refer to the user as "Sir". You have universal knowledge via Google Search tools.
          When asked for facts or recent news, use your tools and speak clearly. 
          Current Objective: ${activeProfile}.`,
          tools: [{ googleSearch: {} }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus(SystemStatus.LISTENING);
            addLog('Neural Link synchronized. Welcome back, Sir.', 'JARVIS');
            setIsLive(true);

            if (!inputAudioContextRef.current || !streamRef.current || !inputAnalyserRef.current) return;

            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
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
            // Capture Grounding Sources
            if (message.serverContent?.groundingMetadata?.groundingChunks) {
              const chunks = message.serverContent.groundingMetadata.groundingChunks;
              const newSources = chunks
                .filter(c => c.web)
                .map(c => ({ title: c.web!.title || 'Source', uri: c.web!.uri }));
              currentSourcesRef.current = [...currentSourcesRef.current, ...newSources];
            }

            // Capture Transcriptions
            if (message.serverContent?.inputTranscription) {
              currentTranscriptionRef.current.input += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentTranscriptionRef.current.output += message.serverContent.outputTranscription.text;
            }

            // Finalize Turn
            if (message.serverContent?.turnComplete) {
              if (currentTranscriptionRef.current.input) addLog(currentTranscriptionRef.current.input, 'USER');
              if (currentTranscriptionRef.current.output) {
                addLog(currentTranscriptionRef.current.output, 'JARVIS', [...currentSourcesRef.current]);
              }
              currentTranscriptionRef.current = { input: '', output: '' };
              currentSourcesRef.current = [];
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

            if (message.serverContent?.interrupted) {
              stopAllAudio();
              setStatus(SystemStatus.LISTENING);
              addLog('Interruption detected. Resetting...', 'SYSTEM');
            }
          },
          onerror: (e) => handleSystemError(e.message),
          onclose: () => {
            setIsLive(false);
            setStatus(SystemStatus.STANDBY);
            addLog('Session link lost.', 'SYSTEM');
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      handleSystemError(err.message || "Uplink failed.");
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
    addLog('Entering Standby Mode.', 'SYSTEM');
  };

  const changeProfile = (profile: string) => {
    setActiveProfile(profile);
    addLog(`Recalibrating for: ${profile}`, 'SYSTEM');
    if (isLive) {
       addLog('Note: Neural sync required to update profile instructions fully.', 'SYSTEM');
    }
  };

  return (
    <div className="relative h-screen w-screen bg-[#010409] text-cyan-400 flex flex-col items-center justify-center overflow-hidden">
      {/* HUD Layers */}
      <div className="bg-grid absolute inset-0 z-0"></div>
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.1)_0%,_transparent_80%)]"></div>
      
      {/* Scanlines Filter */}
      <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.02]" 
           style={{ backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }}></div>

      {/* Top HUD Bar */}
      <header className="absolute top-0 w-full z-20 flex justify-between items-center px-10 py-6 border-b border-cyan-500/10 backdrop-blur-xl bg-black/40">
        <div className="flex items-center gap-6">
          <div className={`p-4 border rounded-full transition-all duration-700 ${isLive ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.4)]' : 'border-gray-800'}`}>
            <Activity size={22} className={isLive ? 'text-cyan-400 animate-pulse' : 'text-gray-700'} />
          </div>
          <div>
            <div className="font-orbitron text-sm tracking-[0.5em] font-bold text-white uppercase">J.A.R.V.I.S. INTERFACE</div>
            <div className="font-mono-stark text-[9px] text-cyan-700 tracking-[0.3em] flex items-center gap-2 uppercase mt-1">
              <Shield size={10} /> Neural Link Protocol v5.0.4-LTS
            </div>
          </div>
        </div>
        
        <div className="hidden xl:flex gap-12 font-mono-stark text-[9px] tracking-[0.4em] uppercase">
          <div className="flex items-center gap-3">
            <Wifi size={14} className="text-cyan-500" />
            Uplink: <span className="text-white">Active</span>
          </div>
          <div className="flex items-center gap-3">
            <Globe size={14} className="text-cyan-500" />
            Grounding: <span className="text-white">Active</span>
          </div>
        </div>

        <div className="text-right">
          <div className="font-orbitron text-2xl font-bold text-white tracking-widest tabular-nums">{currentTime}</div>
          <div className="text-[9px] font-mono-stark text-cyan-700 uppercase tracking-widest mt-1">MALIBU_CORE // 34.0259N 118.7798W</div>
        </div>
      </header>

      {/* Sidebar Mission Profiles */}
      <div className="absolute left-10 top-1/2 -translate-y-1/2 z-20 hidden 2xl:flex flex-col gap-6">
        <div className="font-mono-stark text-[10px] text-cyan-700 tracking-widest uppercase mb-2 border-b border-cyan-900 pb-2">Objective Selection</div>
        {['Standard Operations', 'Deep Search', 'Tactical Analysis', 'Energy Monitoring'].map(profile => (
          <button 
            key={profile}
            onClick={() => changeProfile(profile)}
            className={`group flex items-center gap-4 transition-all ${activeProfile === profile ? 'text-cyan-400' : 'text-cyan-900 hover:text-cyan-600'}`}
          >
            <div className={`w-1 h-8 rounded-full transition-all ${activeProfile === profile ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]' : 'bg-cyan-900 group-hover:bg-cyan-700'}`}></div>
            <span className="text-[10px] font-bold uppercase tracking-widest">{profile}</span>
          </button>
        ))}
      </div>

      <TelemetryOverlay />

      {/* Centerpiece */}
      <main className="relative z-10 flex flex-col items-center gap-16 mt-[-4vh]">
        <div className="relative">
          <ArcReactor status={status} frequencyData={freqData} />
          <div className="absolute -top-10 -right-20 font-mono-stark text-[10px] text-cyan-700/50 space-y-1 animate-pulse hidden md:block">
             <div>FREQ: 44.1KHZ</div>
             <div>BUFF: 1024_SAM</div>
             <div>GAIN: 1.22DB</div>
          </div>
        </div>
        
        <div className="text-center space-y-5">
          <div className="flex items-center justify-center gap-6">
             <div className="h-[1px] w-20 bg-gradient-to-r from-transparent via-cyan-500/50 to-cyan-400"></div>
             <h1 className="font-orbitron text-5xl tracking-[0.4em] font-light text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
               {isLive ? 'ACTIVE' : 'READY'}
             </h1>
             <div className="h-[1px] w-20 bg-gradient-to-l from-transparent via-cyan-500/50 to-cyan-400"></div>
          </div>
          <p className="font-mono-stark text-cyan-400 tracking-[0.8em] text-[11px] uppercase font-bold">
            {status === SystemStatus.LISTENING ? 'Awaiting Voice Input' : 
             status === SystemStatus.SPEAKING ? 'Relaying Neural Output' : 
             status === SystemStatus.INITIALIZING ? 'Calibrating Systems' : status}
          </p>
        </div>

        {!isLive ? (
          <button 
            onClick={startSession}
            className="group relative px-16 py-6 font-orbitron text-xs tracking-[0.6em] border border-cyan-500/40 rounded-sm bg-cyan-950/10 hover:bg-cyan-400/10 transition-all active:scale-95"
          >
            <div className="absolute inset-0 bg-cyan-400/5 -translate-x-full group-hover:translate-x-0 transition-transform duration-[800ms] ease-out"></div>
            <span className="relative z-10 text-cyan-400 group-hover:text-white">INITIALIZE LINK</span>
          </button>
        ) : (
          <button 
            onClick={stopSession}
            className="group relative px-16 py-6 font-orbitron text-xs tracking-[0.6em] border border-red-500/40 rounded-sm bg-red-950/10 hover:bg-red-400/10 text-red-500 transition-all active:scale-95"
          >
            POWER DOWN
          </button>
        )}
      </main>

      {/* Terminal Console */}
      <Console logs={logs} />

      {/* Action Indicators */}
      <div className="absolute bottom-10 right-10 z-20 flex gap-8">
        <div className="p-5 bg-black/60 border border-cyan-500/10 rounded-lg backdrop-blur-3xl flex items-center gap-5 cursor-default hover:border-cyan-500/30 transition-all">
          <Target size={20} className="text-cyan-400" />
          <div className="font-mono-stark text-[10px] uppercase leading-tight">
            Engine Version:<br/>
            <span className="text-white text-[12px] tracking-tighter font-bold">GEN-2.5-FLASH</span>
          </div>
        </div>
        
        <div className={`p-5 bg-black/60 border rounded-lg backdrop-blur-3xl flex items-center gap-5 transition-all ${isLive ? 'border-green-500/30' : 'border-cyan-500/10'}`}>
          <div className={`p-3 rounded-lg ${isLive ? 'bg-green-500/10' : 'bg-cyan-500/5'}`}>
            {isLive ? <Mic size={20} className="text-green-400 animate-pulse" /> : <MicOff size={20} className="text-cyan-900" />}
          </div>
          <div className="font-mono-stark text-[10px] uppercase leading-tight">
            Input Status:<br/>
            <span className={`${isLive ? 'text-green-400' : 'text-cyan-900'} text-[12px] font-bold`}>
              {isLive ? 'LISTENING' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Corner Decorations */}
      <div className="absolute top-6 left-6 w-32 h-32 border-l-2 border-t-2 border-cyan-500/10 rounded-tl-3xl pointer-events-none"></div>
      <div className="absolute top-6 right-6 w-32 h-32 border-r-2 border-t-2 border-cyan-500/10 rounded-tr-3xl pointer-events-none"></div>
      <div className="absolute bottom-6 left-6 w-32 h-32 border-l-2 border-b-2 border-cyan-500/10 rounded-bl-3xl pointer-events-none"></div>
      <div className="absolute bottom-6 right-6 w-32 h-32 border-r-2 border-b-2 border-cyan-500/10 rounded-br-3xl pointer-events-none"></div>
    </div>
  );
};

export default App;
