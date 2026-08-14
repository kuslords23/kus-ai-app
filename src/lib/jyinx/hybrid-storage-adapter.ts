import { PlatformInfo, PlatformType, HybridStorageContext, DeltaEntry, SyncStatus, ViewportConfig } from './hybrid-storage';

export class HybridStorageAdapter implements HybridStorageContext {
  private db: IDBDatabase | null = null;
  public readonly platform: PlatformType;
  private readonly viewportConfig: ViewportConfig;
  private readonly deviceId: string;
  private supabaseClient: any = null;

  constructor() {
    this.deviceId = this.generateDeviceId();
    this.platform = this.detectPlatform();
    this.viewportConfig = this.getViewportConfig();
    this.initializeIndexedDB().catch(console.error);
    this.initializeSupabase();
  }

  private generateDeviceId(): string {
    return `device_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
  }

  private detectPlatform(): PlatformType {
    if (typeof window === 'undefined') {
      return 'web';
    }

    const isTauri = (window as any).__TAURI__ !== undefined;
    const isCapacitor = (window as any).Capacitor !== undefined;
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const isPwa = isStandalone || (window.navigator as any).standalone === true;

    if (isTauri || isCapacitor) return 'native';
    if (isPwa) return 'pwa';
    return 'web';
  }

  private getViewportConfig(): ViewportConfig {
    return {
      mobile: { width: 375, height: 667, device: 'iPhone 13' },
      tablet: { width: 810, height: 1080, device: 'iPad' },
      desktop: { width: 1920, height: 1080, device: 'desktop' }
    };
  }

  private async initializeIndexedDB(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;

    const request = indexedDB.open('jyinx-pwa-store', 1);

    request.onsuccess = (event) => {
      this.db = (event.target as IDBOpenDBRequest).result;
    };

    request.onerror = (event) => {
      console.error('IndexedDB initialization failed:', event);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (db.objectStoreNames.contains('jyinx-store')) return;
      db.createObjectStore('jyinx-store', { keyPath: 'key' });
    };
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB not available in this environment');
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('jyinx-pwa-store', 1);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('jyinx-store')) {
          db.createObjectStore('jyinx-store', { keyPath: 'key' });
        }
      };
    });
  }

  private initializeSupabase(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      // Lazy-load supabase only when credentials exist to avoid bundling it eagerly.
      this.supabaseClient = null;
    }
  }

  async writeData(key: string, data: any): Promise<void> {
    const db = await this.getDB();
    const timestamp = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['jyinx-store'], 'readwrite');
      const store = transaction.objectStore('jyinx-store');
      const request = store.put({ key, value: data, timestamp });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async readData(key: string): Promise<any> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['jyinx-store'], 'readonly');
      const store = transaction.objectStore('jyinx-store');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as { value?: any } | null;
        resolve(result?.value ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async snapshotState(): Promise<{ [key: string]: any }> {
    const db = await this.getDB();
    const snapshot: { [key: string]: any } = {};

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['jyinx-store'], 'readonly');
      const store = transaction.objectStore('jyinx-store');
      const request = store.getAll();

      request.onsuccess = () => {
        const allData = request.result as { key: string; value: any }[];
        allData.forEach((item) => {
          snapshot[item.key] = item.value;
        });
        resolve(snapshot);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPlatformInfo(): Promise<PlatformInfo> {
    return {
      isNative: this.platform === 'native',
      isPwa: this.platform === 'pwa',
      hasNativeAPI: this.platform === 'native' || this.platform === 'pwa'
    };
  }

  async getDeltas(): Promise<DeltaEntry[]> {
    const snapshot = await this.snapshotState();
    return Object.keys(snapshot).map((key) => ({
      id: `${this.deviceId}_${key}`,
      key,
      newValue: snapshot[key],
      timestamp: new Date().toISOString(),
      deviceId: this.deviceId,
      isLocalOnly: true
    }));
  }

  async cleanup(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const hybridStorage = new HybridStorageAdapter();