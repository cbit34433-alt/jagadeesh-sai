
import React, { useState, useEffect } from 'react';
import { TelemetryData } from '../types';

const TelemetryOverlay: React.FC = () => {
  const [data, setData] = useState<TelemetryData>({
    cpu: 12,
    mem: 45,
    temp: 32,
    signal: 98
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setData({
        cpu: Math.floor(10 + Math.random() * 15),
        mem: Math.floor(40 + Math.random() * 10),
        temp: Math.floor(30 + Math.random() * 5),
        signal: Math.floor(95 + Math.random() * 5)
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute top-24 left-10 z-20 font-mono-stark text-[10px] space-y-4 pointer-events-none hidden lg:block">
      <div className="space-y-1">
        <div className="flex justify-between w-32">
          <span>CPU LOAD</span>
          <span className="text-white">{data.cpu}%</span>
        </div>
        <div className="w-32 h-1 bg-cyan-900/30">
          <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${data.cpu}%` }}></div>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between w-32">
          <span>MEM USAGE</span>
          <span className="text-white">{data.mem}%</span>
        </div>
        <div className="w-32 h-1 bg-cyan-900/30">
          <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${data.mem}%` }}></div>
        </div>
      </div>

      <div className="space-y-1 border-t border-cyan-500/20 pt-2">
        <div className="flex justify-between">
          <span>CORE TEMP</span>
          <span className="text-white">{data.temp}°C</span>
        </div>
        <div className="flex justify-between">
          <span>SIGNAL</span>
          <span className="text-white">{data.signal}dBm</span>
        </div>
      </div>

      <div className="pt-2 text-[8px] text-cyan-700 animate-pulse">
        ENCRYPTION: AES-256-GCM<br/>
        PROTOCOL: NEURAL-LINK v2
      </div>
    </div>
  );
};

export default TelemetryOverlay;
