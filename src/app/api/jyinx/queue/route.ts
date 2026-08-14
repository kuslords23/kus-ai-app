import { NextApiRequest, NextApiResponse } from 'next';
import { OfflineQueue } from '../../../lib/jyinx/offline-queue';
import { NetworkMonitor } from '../../../lib/jyinx/network-monitor';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Initialize services
  const offlineQueue = new OfflineQueue();
  const networkMonitor = new NetworkMonitor();

  // Middleware to parse JSON body for POST requests
  if (req.method === 'POST') {
    const buffer: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      buffer.push(chunk);
    });
    req.on('end', () => {
      if (buffer.length > 0) {
        try {
          req.body = JSON.parse(Buffer.concat(buffer).toString());
        } catch (e) {
          console.error('Failed to parse request body:', e);
        }
      }
    });
  }

  const { method } = req;

  switch (method) {
    case 'GET': {
      const status = networkMonitor.getStatus();
      const stats = offlineQueue.getQueueStats();
      
      res.status(200).json({
        status: status.toUpperCase(),
        pendingItems: stats.pending,
        lastSync: stats.lastSync,
        total: stats.total
      });
      break;
    }

    case 'POST': {
      if (!req.body?.action) {
        res.status(400).json({ error: 'Action parameter required' });
        return;
      }

      switch (req.body.action) {
        case 'retry': {
          if (!req.body.id) {
            res.status(400).json({ error: 'Item ID required' });
            return;
          }
          try {
            await offlineQueue.retry(req.body.id);
            res.status(200).json({ success: true });
          } catch (error) {
            res.status(500).json({ error: 'Retry failed' });
          }
          break;
        }
        case 'delete':
        case 'remove': {
          if (!req.body?.id) {
            res.status(400).json({ error: 'Item ID required' });
            return;
          }
          offlineQueue.remove(req.body.id);
          res.status(200).json({ success: true });
          break;
        }
        default:
          res.status(400).json({ error: 'Invalid action' });
      }
      break;
    }

    case 'DELETE': {
      if (!req.body?.id) {
        res.status(400).json({ error: 'Item ID required' });
        return;
      }
      offlineQueue.remove(req.body.id);
      res.status(200).json({ success: true });
      break;
    }

    default: {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      res.status(405).json({ error: 'Method Not Allowed' });
    }
  }
}

// Utility handlers
export async function getQueueStats() {
  const offlineQueue = new OfflineQueue();
  return offlineQueue.getQueueStats();
}

export async function flushQueue() {
  const offlineQueue = new OfflineQueue();
  await offlineQueue.flush();
}