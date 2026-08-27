export type NetworkStatus = 'online' | 'offline' | 'connecting';

export interface NetworkMonitorEvent {
  type: 'sync_status_change';
  status: NetworkStatus;
  timestamp: string;
  pendingItems: number;
}

export class NetworkMonitor {
  private status: NetworkStatus = 'online';
  private listeners: ((event: NetworkMonitorEvent) => void)[] = [];
  private readonly pollInterval: number = 5000; // 5 seconds
  private pollTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private offlineQueue: any = null;

  constructor(offlineQueue?: any) {
    this.offlineQueue = offlineQueue;
    this.initialize();
  }

  private initialize(): void {
    // Only monitor DOM/navigator in the browser.
    // On serverless (Vercel) runtime there is no window; status stays 'online'.
    if (typeof window === 'undefined') {
      this.isMonitoring = false;
      return;
    }

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    this.isMonitoring = true;
    this.startPolling();
  }

  private handleOnline = (): void => {
    const previousStatus = this.status;
    this.status = 'connecting';
    this.notifyListeners();

    // Verify connection with quick check
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.status = 'online';
        this.notifyListeners();
      }
    }, 1000);
  };

  private handleOffline = (): void => {
    const previousStatus = this.status;
    this.status = 'offline';
    this.notifyListeners();
  };

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      if (typeof navigator === 'undefined') return;
      const isCurrentlyOnline = navigator.onLine;
      if (isCurrentlyOnline && this.status !== 'online') {
        this.handleOnline();
      } else if (!isCurrentlyOnline && this.status === 'online') {
        this.handleOffline();
      }
    }, this.pollInterval);
  }

  async checkConnectivity(): Promise<boolean> {
    // Perform actual network request to verify connectivity
    try {
      const response = await fetch('/api/health/ping', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getStatus(): NetworkStatus {
    return this.status;
  }

  async waitForOnline(): Promise<void> {
    if (this.status === 'online') return;

    return new Promise((resolve) => {
      const handler = (event: NetworkMonitorEvent) => {
        if (event.status === 'online') {
          this.off();
          resolve();
        }
      };
      this.on(handler);
    });
  }

  on(listener: (event: NetworkMonitorEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  private notifyListeners(): void {
    const event: NetworkMonitorEvent = {
      type: 'sync_status_change',
      status: this.status,
      timestamp: new Date().toISOString(),
      pendingItems: this.offlineQueue?.getQueueStats?.().pending ?? 0
    };
    this.listeners.forEach(listener => listener(event));
  }

  off(): void {
    if (this.isMonitoring) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
      }
      this.isMonitoring = false;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }
  }

  destroy(): void {
    this.off();
    this.listeners = [];
  }
}

// Factory function to create monitor with queue reference
export function createNetworkMonitor(offlineQueue: any): NetworkMonitor {
  return new NetworkMonitor(offlineQueue);
}