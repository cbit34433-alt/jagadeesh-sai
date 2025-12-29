
import React, { useRef, useEffect } from 'react';
import { ConsoleLog } from '../types';
import { ExternalLink } from 'lucide-react';

interface ConsoleProps {
  logs: ConsoleLog[];
}

const Console: React.FC<ConsoleProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl h-56 bg-black/80 backdrop-blur-xl border border-cyan-500/20 rounded-lg overflow-hidden flex flex-col p-5 font-mono-stark text-xs shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <div className="flex justify-between items-center border-b border-cyan-500/10 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
          <span className="text-cyan-400 text-[10px] tracking-[0.3em] uppercase font-bold">Neural Link Interface</span>
        </div>
        <span className="text-cyan-900 text-[9px] font-bold">STREAM_ID: STARK-7-MARK-LXXXV</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-4 scroll-smooth pr-2">
        {logs.slice().reverse().map((log) => (
          <div key={log.id} className="flex flex-col gap-1 animate-fadeIn group">
            <div className="flex gap-3">
              <span className={`shrink-0 w-20 font-bold tracking-tighter ${
                log.sender === 'JARVIS' ? 'text-cyan-400' : 
                log.sender === 'USER' ? 'text-white/60' : 'text-yellow-600'
              }`}>
                [{log.sender}]
              </span>
              <span className={`${log.sender === 'JARVIS' ? 'text-cyan-50' : 'text-gray-400'} leading-relaxed`}>
                {log.message}
              </span>
            </div>
            
            {log.sources && log.sources.length > 0 && (
              <div className="ml-24 mt-2 flex flex-wrap gap-2">
                {log.sources.map((source, idx) => (
                  <a 
                    key={idx} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 bg-cyan-950/40 border border-cyan-500/30 rounded text-[9px] text-cyan-400 hover:bg-cyan-500/20 hover:text-white transition-all"
                  >
                    <ExternalLink size={10} />
                    {source.title || 'Source'}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-cyan-900/40 italic py-4 text-center tracking-widest">AWAITING NEURAL SYNAPSE...</div>
        )}
      </div>
    </div>
  );
};

export default Console;
