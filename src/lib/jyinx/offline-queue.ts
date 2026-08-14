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

  // In-memory fallback for server-side (Vercel Node runtime) where IndexedDB
  // does not exist. Keeps the queue functional without native modules.
  private memory: Map<string, QueueItem> = new Map();

  private get isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  }

  constructor() {
    if (this.isBrowser) {
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
    if (!this.isBrowser) {
      throw new Error('IndexedDB is not available on the server');
    }
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
    const queueItem: QueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      networkCondition: this.status === 'offline' ? 'offline' : 'online',
      ...item
    };

    // Server-side in-memory path
    if (!this.isBrowser) {
      this.memory.set(queueItem.id, queueItem);
      return queueItem.id;
    }

    const db = await this.waitForDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(queueItem);

      request.onsuccess = () => resolve(queueItem.id);
      request.onerror = () => reject(request.error);
    });
  }

  async retry(itemId: string): Promise<void> {
    // Server-side in-memory path
    if (!this.isBrowser) {
      const item = this.memory.get(itemId);
      if (!item) throw new Error(`Item not found: ${itemId}`);
      item.status = 'processing';
      item.retryCount += 1;
      return;
    }

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
    if (!this.isBrowser) {
      this.memory.delete(itemId);
      return;
    }

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
    if (!this.isBrowser) {
      return this.memory.get(itemId) ?? null;
    }

    const db = await this.waitForDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(itemId);

      request.onsuccess = () => {
        resolve((request.result as QueueItem) ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async markProcessing(itemId: string): Promise<void> {
    const item = await this.getById(itemId);
    if (!item) return;

    item.status = 'processing';

    if (!this.isBrowser) {
      this.memory.set(itemId, item);
      return;
    }

    const db = await this.waitForDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingItems(): Promise<QueueItem[]> {
    const all = await this.getAllItems();
    return all.filter((i) => i.status === 'pending' || i.status === 'failed');
  }

  async markCompleted(itemId: string): Promise<void> {
    const item = await this.getById(itemId);
    if (!item) return;
    item.status = 'completed';
    await this.updateItem(itemId, item);
  }

  async markFailed(itemId: string, error?: Error): Promise<void> {
    const item = await this.getById(itemId);
    if (!item) return;
    item.status = 'failed';
    item.retryCount += 1;
    await this.updateItem(itemId, item);
  }

  async updateItem(itemId: string, item: QueueItem): Promise<void> {
    if (!this.isBrowser) {
      this.memory.set(itemId, item);
      return;
    }

    const db = await this.waitForDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getAllItems(): Promise<QueueItem[]> {
    if (!this.isBrowser) {
      return Array.from(this.memory.values());
    }

    const db = await this.waitForDB();
    return new Promise<QueueItem[]>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as QueueItem[]);
      request.onerror = () => reject(request.error);
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
    let items: QueueItem[];

    if (!this.isBrowser) {
      items = Array.from(this.memory.values());
    } else {
      const db = await this.waitForDB();
      items = await new Promise<QueueItem[]>((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as QueueItem[]);
        request.onerror = () => reject(request.error);
      });
    }

    return {
      total: items.length,
      pending: items.filter((i) => i.status === 'pending').length,
      processing: items.filter((i) => i.status === 'processing').length,
      completed: items.filter((i) => i.status === 'completed').length,
      failed: items.filter((i) => i.status === 'failed').length,
      highPriorityPending: items.filter(
        (i) => i.priority === 'high' && i.status === 'pending'
      ).length,
      lastSync: this.lastSync
    };
  }

  async flush(): Promise<void> {
    if (!this.isBrowser) {
      this.memory.clear();
      return;
    }

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