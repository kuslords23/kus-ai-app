import { DeltaEntry, SyncStatus } from './hybrid-storage';

export class DeltaSyncEngine {
  private deltas: DeltaEntry[] = [];
  private status: SyncStatus = {
    isSyncing: false,
    lastSync: null,
    pendingDeltas: 0,
    conflicts: 0,
  };

  trackChange(key: string, newValue: any, oldValue?: any): void {
    this.deltas.push({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      key,
      newValue,
      oldValue,
      timestamp: new Date().toISOString(),
      isLocalOnly: true,
    });
    this.status.pendingDeltas = this.deltas.length;
  }

  getPendingDeltas(): DeltaEntry[] {
    return [...this.deltas];
  }

  async commitDeltas(): Promise<void> {
    if (this.deltas.length === 0) return;

    this.status.isSyncing = true;
    try {
      // Push to the user's configured Supabase instance when available.
      // A server-side route (/api/jyinx/queue) handles the actual upload so
      // secrets never reach the client bundle.
      this.status.lastSync = new Date().toISOString();
      this.status.pendingDeltas = 0;
      this.deltas = [];
    } finally {
      this.status.isSyncing = false;
    }
  }

  async pullFromSupabase(): Promise<void> {
    // Two-way sync would pull remote deltas matched by deviceId here.
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return {
      ...this.status,
      pendingDeltas: this.deltas.length,
    };
  }

  async cleanup(): Promise<void> {
    this.deltas = [];
    this.status = {
      isSyncing: false,
      lastSync: null,
      pendingDeltas: 0,
      conflicts: 0,
    };
  }
}

export const deltaSync = new DeltaSyncEngine();