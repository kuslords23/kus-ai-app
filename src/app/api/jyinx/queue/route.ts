import { NextRequest, NextResponse } from 'next/server';
import { OfflineQueue } from '@/lib/jyinx/offline-queue';
import { NetworkMonitor } from '@/lib/jyinx/network-monitor';

type QueueStats = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  highPriorityPending: number;
  lastSync: string | null;
};

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const offlineQueue = new OfflineQueue();
  const networkMonitor = new NetworkMonitor(offlineQueue);

  try {
    const status = networkMonitor.getStatus();
    const stats = (await offlineQueue.getQueueStats()) as QueueStats;

    return NextResponse.json({
      status: status.toUpperCase(),
      pendingItems: stats.pending,
      lastSync: stats.lastSync,
      total: stats.total,
    });
  } catch (error) {
    console.error('GET /api/jyinx/queue failed:', error);
    return NextResponse.json({ error: 'Failed to read queue' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const offlineQueue = new OfflineQueue();
  const networkMonitor = new NetworkMonitor(offlineQueue);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body?.action as string | undefined;
  if (!action) {
    return NextResponse.json({ error: 'Action parameter required' }, { status: 400 });
  }

  switch (action) {
    case 'terminal': {
      const command = typeof body?.command === 'string' ? body.command.trim() : '';
      if (!command || command.length > 500) return NextResponse.json({ error: 'A valid terminal command is required' }, { status: 400 });
      return NextResponse.json({ success: true, message: `Queued terminal command: ${command}` });
    }
    case 'retry': {
      const id = body?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
      }
      try {
        await offlineQueue.retry(id);
        return NextResponse.json({ success: true });
      } catch (error) {
        console.error('Retry failed:', error);
        return NextResponse.json({ error: 'Retry failed' }, { status: 500 });
      }
    }
    case 'delete':
    case 'remove': {
      const id = body?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
      }
      await offlineQueue.remove(id);
      return NextResponse.json({ success: true });
    }
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const offlineQueue = new OfflineQueue();
  const networkMonitor = new NetworkMonitor(offlineQueue);

  let id: string | null = null;
  const url = new URL(req.url);
  const queryId = url.searchParams.get('id');
  if (queryId) {
    id = queryId;
  } else {
    try {
      const body: any = await req.json();
      id = body?.id ?? null;
    } catch {
      // no body, rely on query param (already handled above)
    }
  }

  if (!id) {
    return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
  }

  await offlineQueue.remove(id);
  return NextResponse.json({ success: true });
}

// Re-exported helpers for reuse by other server code.
export async function getQueueStats(): Promise<QueueStats> {
  const offlineQueue = new OfflineQueue();
  return (await offlineQueue.getQueueStats()) as QueueStats;
}

export async function flushQueue(): Promise<void> {
  const offlineQueue = new OfflineQueue();
  await offlineQueue.flush();
}