import { PlatformInfo } from './hybrid-storage';

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

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Listen for browser online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
    this.isMonitoring = true;
    // Fallback polling for navigator.onLine reliability
    this.startPolling();
  }

  private handleOnline = (): void => {
    const previousStatus = this.status;
    this.status = 'connecting';
    this.notifyListeners();

    // Verify connection with quick check
    setTimeout(() => {
      if (navigator.onLine) {
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
      if (typeof navigator !== 'undefined') {
        const isCurrentlyOnline = navigator.onLine;
        if (isCurrentlyOnline && this.status !== 'online') {
          this.handleOnline();
        } else if (!isCurrentlyOnline && this.status === 'online') {
          this.handleOffline();
        }
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
      pendingItems: 0 // Will be updated by sync manager
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

// Singleton instance
export const networkMonitor = new NetworkMonitor();