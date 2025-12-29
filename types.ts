
export type LogSender = 'USER' | 'JARVIS' | 'SYSTEM';

export interface ConsoleLog {
  id: string;
  sender: LogSender;
  message: string;
  timestamp: Date;
}

export enum SystemStatus {
  STANDBY = 'STANDBY',
  INITIALIZING = 'INITIALIZING',
  CONNECTING = 'CONNECTING',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR'
}

export interface TelemetryData {
  cpu: number;
  mem: number;
  temp: number;
  signal: number;
}
