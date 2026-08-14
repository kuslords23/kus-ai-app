import { Database } from 'better-sqlite3';
import path from 'path';

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
  private db: Database;
  private queueKey = 'jyinx_offline_queue';
  public status: NetworkStatus = 'online';
  public pendingItems: number = 0;
  public lastSync: string | null = null;
  private total: number = 0;

  constructor() {
    this.db = this.initializeDB();
    this.initializeSchema();
  }

  private initializeDB(): Database {
    const dbPath = path.join(process.cwd(), 'jyinx-store.sqlite');
    return new Database(dbPath, { readonly: false });
  }

  private initializeSchema(): void {
    const stmt = this.db.prepare(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        retryCount INTEGER DEFAULT 0,
        maxRetries INTEGER DEFAULT 3,
        priority TEXT DEFAULT 'normal',
        networkCondition TEXT DEFAULT 'offline',
        callbackUrl TEXT,
        correlationId TEXT
      )
    `);
    stmt.run();
  }

  setNetworkStatus(status: NetworkStatus): void {
    this.status = status;
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

    const stmt = this.db.prepare(`
      INSERT INTO offline_queue (id, type, payload, status, createdAt, retryCount, maxRetries, priority, networkCondition, callbackUrl, correlationId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      queueItem.id,
      queueItem.type,
      JSON.stringify(queueItem.payload),
      queueItem.status,
      queueItem.createdAt,
      queueItem.retryCount,
      queueItem.maxRetries,
      queueItem.priority,
      queueItem.networkCondition,
      queueItem.callbackUrl,
      queueItem.correlationId
    );

    this.total = this.db.prepare('SELECT COUNT(*) as count FROM offline_queue').get().count as number;
    
    return queueItem.id;
  }

  async retry(itemId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE offline_queue 
      SET status = 'processing', retryCount = retryCount + 1
      WHERE id = ?
    `);
    stmt.run(itemId);
  }

  async remove(itemId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM offline_queue WHERE id = ?');
    stmt.run(itemId);
    this.total = this.db.prepare('SELECT COUNT(*) as count FROM offline_queue').get().count as number;
  }

  async getById(itemId: string): Promise<QueueItem | null> {
    const stmt = this.db.prepare('SELECT * FROM offline_queue WHERE id = ?');
    const result = stmt.get(itemId);
    
    if (!result) return null;
    
    return {
      id: result.id,
      type: result.type,
      payload: JSON.parse(result.payload),
      status: result.status,
      createdAt: result.createdAt,
      retryCount: result.retryCount,
      maxRetries: result.maxRetries,
      priority: result.priority,
      networkCondition: result.networkCondition,
      callbackUrl: result.callbackUrl,
      correlationId: result.correlationId
    };
  }

  markProcessing(itemId: string): void {
    const stmt = this.db.prepare(`
      UPDATE offline_queue 
      SET status = 'processing'
      WHERE id = ?
    `);
    stmt.run(itemId);
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
    const total = this.db.prepare('SELECT COUNT(*) as count FROM offline_queue').get().count as number;
    const pending = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'pending'").get().count as number;
    const processing = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'processing'").get().count as number;
    const completed = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'completed'").get().count as number;
    const failed = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'failed'").get().count as number;
    const highPriorityPending = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE priority = 'high' AND status = 'pending'").get().count as number;

    return {
      total,
      pending,
      processing,
      completed,
      failed,
      highPriorityPending,
      lastSync: this.lastSync
    };
  }

  async flush(): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM offline_queue');
    stmt.run();
    this.total = 0;
  }

  cleanup(): void {
    this.db.close();
  }
}