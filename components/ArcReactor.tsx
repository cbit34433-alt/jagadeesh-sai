
import React from 'react';
import { SystemStatus } from '../types';

interface ArcReactorProps {
  status: SystemStatus;
  frequencyData: Uint8Array;
}

const ArcReactor: React.FC<ArcReactorProps> = ({ status, frequencyData }) => {
  const getCoreColor = () => {
    switch (status) {
      case SystemStatus.LISTENING: return 'bg-white shadow-[0_0_40px_rgba(255,255,255,0.8)]';
      case SystemStatus.SPEAKING: return 'bg-cyan-200 shadow-[0_0_60px_rgba(34,211,238,1)] scale-110';
      case SystemStatus.ERROR: return 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)]';
      case SystemStatus.CONNECTING:
      case SystemStatus.INITIALIZING: return 'bg-cyan-500 animate-pulse';
      default: return 'bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.5)]';
    }
  };

  const getRingSpeed = () => {
    switch (status) {
      case SystemStatus.SPEAKING: return 'duration-[1s]';
      case SystemStatus.LISTENING: return 'duration-[4s]';
      default: return 'duration-[10s]';
    }
  };

  // We use the frequency data to determine bar heights
  const getBarHeight = (index: number) => {
    if (!frequencyData || frequencyData.length === 0) return 8;
    // Map the index to a frequency bin
    const bin = Math.floor((index / 24) * (frequencyData.length / 4));
    const value = frequencyData[bin] || 0;
    return 8 + (value / 255) * 35; // Base 8px + up to 35px dynamic
  };

  return (
    <div className="relative w-72 h-72 flex items-center justify-center">
      {/* Outer Spinning Ring */}
      <div className={`absolute inset-0 border-2 border-cyan-500/20 rounded-full animate-spin ${getRingSpeed()} border-t-4 border-t-cyan-400 border-b-4 border-b-cyan-400`}></div>
      
      {/* Middle Dotted Ring */}
      <div className="absolute inset-6 border-2 border-dotted border-cyan-500/40 rounded-full animate-spin duration-[15s] reverse"></div>
      
      {/* Dynamic Visualizer Bars */}
      <div className="absolute inset-0">
        {[...Array(36)].map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 left-1/2 w-[2px] bg-cyan-400/80 origin-[center_-125px] transition-[height] duration-75"
            style={{ 
              transform: `translate(-50%, -50%) rotate(${i * 10}deg)`,
              height: `${getBarHeight(i)}px`,
              opacity: status === SystemStatus.STANDBY ? 0.2 : 1
            }}
          />
        ))}
      </div>

      {/* Core Core */}
      <div className={`relative z-10 w-24 h-24 rounded-full transition-all duration-300 flex items-center justify-center ${getCoreColor()}`}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/30 to-transparent"></div>
        <div className="w-16 h-16 border-2 border-white/20 rounded-full flex items-center justify-center">
           <div className="w-8 h-8 border border-white/40 rounded-full"></div>
        </div>
      </div>
      
      {/* Scanning Light Effect */}
      <div className="absolute w-full h-[1px] bg-cyan-400/10 top-1/2 -translate-y-1/2 animate-pulse pointer-events-none"></div>
    </div>
  );
};

export default ArcReactor;
