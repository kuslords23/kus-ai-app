import { Database } from 'better-sqlite3';
import path from 'path';
import { HybridStorageContext } from './hybrid-storage';
import { NetworkStatus, NetworkMonitorEvent } from './network-monitor';

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
  private isNative: boolean;
  
  constructor() {
    this.isNative = typeof process !== 'undefined' && process.platform;
    this.db = this.initializeDB();
    this.initializeSchema();
  }

  private initializeDB(): Database {
    let dbPath: string;
    
    if (this.isNative) {
      // Native platform - use SQLite
      dbPath = path.join(process.cwd(), 'jyinx-native.db');
    } else {
      // Web/PWA - use IndexedDB with SQLite fallback option
      dbPath = path.join(process.cwd(), 'jyinx-web.db');
    }
    
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

  async enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'retryCount' | 'maxRetries' | 'networkCondition'>): Promise<string> {
    const queueItem: QueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      networkCondition: networkMonitor.getStatus() === 'offline' ? 'offline' : 'online',
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

    return queueItem.id;
  }

  async dequeue(itemId: string): Promise<QueueItem | null> {
    const stmt = this.db.prepare('SELECT * FROM offline_queue WHERE id = ?');
    const result = stmt.get(itemId) as QueueItem | null;

    if (result) {
      const updateStmt = this.db.prepare(`
        UPDATE offline_queue 
        SET status = 'processing', retryCount = retryCount + 1
        WHERE id = ?
      `);
      updateStmt.run(itemId);
    }

    return result;
  }

  async markCompleted(itemId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE offline_queue 
      SET status = 'completed', retryCount = 0
      WHERE id = ?
    `);
    stmt.run(itemId);
  }

  async markFailed(itemId: string, error?: Error): Promise<void> {
    const retryCount = (this.db.prepare('SELECT retryCount FROM offline_queue WHERE id = ?').get(itemId) as any).retryCount + 1;
    
    const stmt = this.db.prepare(`
      UPDATE offline_queue 
      SET status = 'failed', retryCount = ?
      WHERE id = ?
    `);
    stmt.run(retryCount, itemId);
  }

  async getPendingItems(): Promise<QueueItem[]> {
    const stmt = this.db.prepare('SELECT * FROM offline_queue WHERE status = ?');
    const results = stmt.all('pending') as QueueItem[];
    return results;
  }

  async getHighPriorityItems(): Promise<QueueItem[]> {
    const stmt = this.db.prepare('SELECT * FROM offline_queue WHERE priority = ? AND status = ?');
    const results = stmt.all('high', 'pending') as QueueItem[];
    return results;
  }

  async cleanupExpiredItems(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const stmt = this.db.prepare('DELETE FROM offline_queue WHERE createdAt < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }

  async getQueueStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    highPriorityPending: number;
  }> {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM offline_queue').get().count;
    const pending = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'pending'").get().count;
    const processing = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'processing'").get().count;
    const completed = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'completed'").get().count;
    const failed = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'failed'").get().count;
    const highPriorityPending = this.db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE priority = 'high' AND status = 'pending'").get().count;

    return {
      total,
      pending,
      processing,
      completed,
      failed,
      highPriorityPending
    };
  }

  destroy(): void {
    this.db.close();
  }
}

// Singleton instance
export const offlineQueue = new OfflineQueue();