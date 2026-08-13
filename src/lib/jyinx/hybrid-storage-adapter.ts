import { Database } from 'better-sqlite3';
import path from 'path';
import { PlatformInfo, PlatformType, HybridStorageContext, DeltaEntry, SyncStatus, ViewportConfig } from './hybrid-storage';

export class HybridStorageAdapter implements HybridStorageContext {
  private readonly db: Database;
  private indexedDB: IDBDatabase | null = null;
  private platform: PlatformType;
  private readonly viewportConfig: ViewportConfig;
  private readonly deviceId: string;
  private supabaseClient: any = null;
  private readonly isNativeRuntime: boolean;

  constructor() {
    this.deviceId = this.generateDeviceId();
    this.platform = this.detectPlatform();
    this.viewportConfig = this.getViewportConfig();
    this.isNativeRuntime = this.isNativeEnvironment();
    this.db = this.initializeSQLiteDB();
    this.initializeIndexedDB().catch(console.error);
    this.initializeSupabase();
  }

  private generateDeviceId(): string {
    return `device_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
  }

  private detectPlatform(): PlatformType {
    if (typeof window === 'undefined') {
      return 'native';
    }
    
    const isTauri = (window as any).__TAURI__ !== undefined;
    const isCapacitor = (window as any).Capacitor !== undefined;
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isPwa = isStandalone || (window.navigator as any).standalone === true;
    
    if (isTauri || isCapacitor) return 'native';
    if (isPwa) return 'pwa';
    return 'web';
  }

  private isNativeEnvironment(): boolean {
    return this.platform === 'native';
  }

  private getViewportConfig(): ViewportConfig {
    return {
      mobile: { width: 375, height: 667, device: 'iPhone 13' },
      tablet: { width: 810, height: 1080, device: 'iPad' },
      desktop: { width: 1920, height: 1080, device: 'desktop' }
    };
  }

  private initializeSQLiteDB(): Database {
    const sqlitePath = this.platform === 'native' ? 
      path.join(process.cwd(), 'jyinx-native.db') : 
      path.join(process.cwd(), 'jyinx-web.db');
    
    return new Database(sqlitePath, { readonly: false });
  }

  private async initializeIndexedDB(): Promise<void> {
    if (this.platform === 'native' || this.isNativeRuntime) return;
    
    const request = indexedDB.open('jyinx-pwa-store', 1);
    
    request.onsuccess = (event) => {
      this.indexedDB = (event.target as IDBOpenDBRequest).result;
    };
    
    request.onerror = (event) => {
      console.error('IndexedDB initialization failed:', event);
    };
  }

  private initializeSupabase(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseUrl && supabaseKey) {
      this.supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
  }

  async writeData(key: string, data: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const deltaEntry: DeltaEntry = {
      id: `${this.deviceId}_${Date.now()}_${key}`,
      key,
      newValue: data,
      timestamp,
      deviceId: this.deviceId,
      isLocalOnly: !this.isNativeRuntime
    };

    if (this.isNativeRuntime) {
      await this.writeToSQLite(key, data, deltaEntry);
    } else {
      await this.writeToIndexedDB(key, data);
    }
  }

  private async writeToSQLite(key: string, data: any, deltaEntry: DeltaEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('INSERT INTO jyinx_storage (key, value, timestamp, delta) VALUES (?, ?, ?, ?)');
        stmt.run(key, JSON.stringify(data), deltaEntry.timestamp, JSON.stringify(deltaEntry));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async writeToIndexedDB(key: string, data: any): Promise<void> {
    if (!this.indexedDB) throw new Error('IndexedDB not initialized');
    
    const transaction = this.indexedDB.transaction(['jyinx-store'], 'readwrite');
    const store = transaction.objectStore('jyinx-store');
    
    return new Promise((resolve, reject) => {
      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async readData(key: string): Promise<any> {
    if (this.isNativeRuntime) {
      return this.readFromSQLite(key);
    } else {
      return this.readFromIndexedDB(key);
    }
  }

  private async readFromSQLite(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('SELECT value FROM jyinx_storage WHERE key = ?');
        const result = stmt.get(key);
        resolve(result ? JSON.parse(result.value) : null);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async readFromIndexedDB(key: string): Promise<any> {
    if (!this.indexedDB) throw new Error('IndexedDB not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.indexedDB.transaction(['jyinx-store'], 'readonly');
      const store = transaction.objectStore('jyinx-store');
      
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async snapshotState(): Promise<{ [key: string]: any }> {
    const snapshot: { [key: string]: any } = {};
    
    if (this.isNativeRuntime) {
      const stmt = this.db.prepare('SELECT key, value FROM jyinx_storage');
      const results = stmt.all() as { key: string; value: string }[];
      results.forEach(item => {
        snapshot[item.key] = JSON.parse(item.value);
      });
    } else {
      if (!this.indexedDB) throw new Error('IndexedDB not initialized');
      
      const transaction = this.indexedDB.transaction(['jyinx-store'], 'readonly');
      const store = transaction.objectStore('jyinx-store');
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const allData = request.result as any[];
          allData.forEach(item => {
            const keys = Object.keys(item);
            if (keys.length > 0) {
              snapshot[keys[0]] = item[keys[0]];
            }
          });
          resolve(snapshot);
        };
        request.onerror = () => reject(request.error);
      });
    }
    
    return snapshot;
  }

  async getPlatformInfo(): Promise<PlatformInfo> {
    return {
      isNative: this.isNativeRuntime,
      isPwa: this.platform === 'pwa',
      hasNativeAPI: this.isNativeRuntime || this.platform === 'pwa'
    };
  }

  async getDeltas(): Promise<DeltaEntry[]> {
    const deltaEntries: DeltaEntry[] = [];
    
    if (this.isNativeRuntime) {
      const stmt = this.db.prepare('SELECT delta FROM jyinx_storage WHERE delta IS NOT NULL');
      const results = stmt.all() as { delta: string }[];
      results.forEach(item => {
        if (item.delta) {
          deltaEntries.push(JSON.parse(item.delta));
        }
      });
    }
    
    return deltaEntries;
  }

  async cleanup(): Promise<void> {
    if (this.indexedDB) {
      this.indexedDB.close();
      this.indexedDB = null;
    }
    this.db.close();
  }
}

export const hybridStorage = new HybridStorageAdapter();