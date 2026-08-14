export type PlatformType = 'native' | 'pwa' | 'web';

export interface HybridStorageContext {
  platform: PlatformType;
  writeData(key: string, data: any): Promise<void>;
  readData(key: string): Promise<any>;
  snapshotState(): Promise<{ [key: string]: any }>;
  getPlatformInfo(): Promise<PlatformInfo>;
}

export interface PlatformInfo {
  isNative: boolean;
  isPwa: boolean;
  hasNativeAPI: boolean;
}

export interface DeltaEntry {
  id: string;
  key: string;
  newValue: any;
  oldValue?: any;
  timestamp: string;
  deviceId?: string;
  isLocalOnly?: boolean;
}

export interface DeltaSyncEngine {
  trackChange(key: string, newValue: any, oldValue?: any): void;
  commitDeltas(): Promise<void>;
  pullFromSupabase(): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: string | null;
  pendingDeltas: number;
  conflicts: number;
}

export interface ViewportConfig {
  mobile: { width: number; height: number; device: string };
  tablet: { width: number; height: number; device: string };
  desktop: { width: number; height: number; device: string };
}