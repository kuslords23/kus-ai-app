import { OfflineQueue } from './offline-queue';
import { NetworkMonitor } from './network-monitor';

export class SyncManager {
  private queue: OfflineQueue;
  private syncStatus: 'online' | 'offline' | 'recovering';
  private isRecovering: boolean;
  private retryDelay: number;
  private maxRetries: number;

  constructor() {
    this.queue = new OfflineQueue();
    this.syncStatus = 'online';
    this.isRecovering = false;
    this.retryDelay = 1000;
    this.maxRetries = 3;
  }

  async processQueue(): Promise<void> {
    if (this.syncStatus === 'offline') {
      // Queue is being rebuilt from offline items
      this.syncStatus = 'recovering';
      console.log('Starting recovery from offline queue');
      
      while (true) {
        const pendingItems = await this.queue.getPendingItems();
        if (pendingItems.length === 0) {
          this.syncStatus = 'online';
          this.isRecovering = false;
          console.log('Queue recovered - all items processed');
          break;
        }

        for (const item of pendingItems) {
          try {
            await this.queue.markCompleted(item.id);
            console.log(`Processed item ${item.id}`);
          } catch (error) {
            console.error(`Failed to process item ${item.id}:`, error);
            // Retry logic handled by queue manager
          }
        }
      }
    }
  }

  async retryFailedItem(itemId: string): Promise<void> {
    const item = await this.queue.getById(itemId);
    if (!item) return;

    if (item.retryCount >= this.maxRetries) {
      console.warn(`Item ${itemId} exceeded max retries, marking as failed`);
      await this.queue.markFailed(itemId, new Error('Max retries exceeded'));
      return;
    }

    // Exponential backoff
    const delay = this.retryDelay * Math.pow(2, item.retryCount);
    console.log(`Retrying item ${itemId} in ${delay}ms (attempt ${item.retryCount + 1})`);

    setTimeout(() => {
      this.queue.markProcessing(itemId);
    }, delay);
  }

  async syncToServer(): Promise<boolean> {
    // Simulate network call to Synapse/backend
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('Syncing to server...');
        // In real implementation, this would call your backend API
        resolve(true);
      }, 2000);
    });
  }

  getStatus(): string {
    return this.syncStatus;
  }

  isRecovering(): boolean {
    return this.isRecovering;
  }

  incrementRetryCount(itemId: string): void {
    const item = await this.queue.getById(itemId);
    if (item) {
      item.retryCount += 1;
      this.queue.updateItem(itemId, item);
    }
  }

  async flushQueue(): Promise<void> {
    console.log('Flushing remaining items from queue');
    await this.processQueue();
  }
}

// Singleton instance
export const syncManager = new SyncManager();