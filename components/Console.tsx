
import React, { useRef, useEffect } from 'react';
import { ConsoleLog } from '../types';

interface ConsoleProps {
  logs: ConsoleLog[];
}

const Console: React.FC<ConsoleProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // Keeping newest at top for this HUD style
    }
  }, [logs]);

  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl h-48 bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded-xl overflow-hidden flex flex-col p-4 font-mono-stark text-sm">
      <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2 mb-2">
        <span className="text-cyan-400 text-[10px] tracking-widest uppercase">System Interaction Log</span>
        <span className="text-cyan-600 text-[10px]">v5.0.4-LTS</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-2 scroll-smooth">
        {logs.slice().reverse().map((log) => (
          <div key={log.id} className="flex gap-2 animate-fadeIn border-l-2 border-transparent hover:border-cyan-500/50 pl-2 transition-all">
            <span className={`shrink-0 w-20 font-bold ${
              log.sender === 'JARVIS' ? 'text-cyan-400' : 
              log.sender === 'USER' ? 'text-gray-400' : 'text-yellow-500'
            }`}>
              [{log.sender}]
            </span>
            <span className={log.sender === 'JARVIS' ? 'text-cyan-100' : 'text-gray-300'}>
              {log.message}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-cyan-900/50 italic">Waiting for input stream...</div>
        )}
      </div>
    </div>
  );
};

export default Console;
