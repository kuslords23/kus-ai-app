export type NetworkStatus = 'online' | 'offline' | 'connecting';

export interface QueueItem {
  id: string;
  type: 'api_call' | 'delta_push' | 'telemetry_log' | 'model_request';
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  retryCount: number;
  maxRetries: number;
  priority: 'low' | 'normal' | 'high';
  networkCondition: 'online' | 'offline';
  callbackUrl?: string;
  correlationId?: string;
}

export class OfflineQueue {
  private dbName = 'JyinxQueue';
  private storeName = 'offline_queue';
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  public status: NetworkStatus = 'online';
  public lastSync: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initDB();
    }
  }

  private initDB(): void {
    if (this.isInitialized) return;
    
    const request = indexedDB.open(this.dbName, 1);
    
    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
    };
    
    request.onsuccess = () => {
      this.db = request.result;
      this.isInitialized = true;
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(this.storeName)) {
        const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('priority', 'priority', { unique: false });
      }
    };
  }

  setNetworkStatus(status: NetworkStatus): void {
    this.status = status;
  }

  private async waitForDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
        }
      };
    });
  }

  async enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'retryCount' | 'maxRetries' | 'networkCondition' | 'status'>): Promise<string> {
    const db = await this.waitForDB();
    
    const queueItem: QueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      networkCondition: this.status === 'offline' ? 'offline' : 'online',
      ...item
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(queueItem);
      
      request.onsuccess = () => resolve(queueItem.id);
      request.onerror = () => reject(request.error);
    });
  }

  async retry(itemId: string): Promise<void> {
    const db = await this.waitForDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const getRequest = store.get(itemId);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (!item) {
          reject(new Error(`Item not found: ${itemId}`));
          return;
        }
        
        item.status = 'processing';
        item.retryCount = (item.retryCount || 0) + 1;
        
        const putRequest = store.put(item);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async remove(itemId: string): Promise<void> {
    const db = await this.waitForDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(itemId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getById(itemId: string): Promise<QueueItem | null> {
    const db = await this.waitForDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(itemId);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as QueueItem);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  markProcessing(itemId: string): void {
    this.getById(itemId).then(item => {
      if (item) {
        item.status = 'processing';
        this.waitForDB().then(db => {
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);
          store.put(item);
        });
      }
    });
  }

  async getQueueStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    highPriorityPending: number;
    lastSync: string | null;
  }> {
    const db = await this.waitForDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const items = request.result as QueueItem[];
        const stats = {
          total: items.length,
          pending: items.filter(i => i.status === 'pending').length,
          processing: items.filter(i => i.status === 'processing').length,
          completed: items.filter(i => i.status === 'completed').length,
          failed: items.filter(i => i.status === 'failed').length,
          highPriorityPending: items.filter(i => i.priority === 'high' && i.status === 'pending').length,
          lastSync: this.lastSync
        };
        resolve(stats);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async flush(): Promise<void> {
    const db = await this.waitForDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  cleanup(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}