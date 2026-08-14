import { NextApiRequest, NextApiResponse } from 'next';
import { OfflineQueue } from '../../../../lib/jyinx/offline-queue';
import { NetworkMonitor } from '../../../../lib/jyinx/network-monitor';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { method } = req;

  switch (method) {
    case 'GET':
      const offlineQueue = new OfflineQueue();
      const networkMonitor = new NetworkMonitor(offlineQueue);
      const status = networkMonitor.getStatus();
      const stats = offlineQueue.getQueueStats();
      
      res.status(200).json({
        status: status.toUpperCase(),
        pendingItems: stats.pending,
        lastSync: stats.lastSync,
        total: stats.total
      });
      break;

    case 'POST':
      const offlineQueue2 = new OfflineQueue();
      const networkMonitor2 = new NetworkMonitor(offlineQueue2);
      
      const buffer = [];
      req.on('data', (chunk) => {
        buffer.push(chunk);
      });
      req.on('end', () => {
        if (buffer.length > 0) {
          try {
            req.body = JSON.parse(Buffer.concat(buffer).toString());
          } catch (e) {
            console.error('Failed to parse JSON body:', e);
          }
        }
      });
      
      if (!req.body?.action) {
        res.status(400).json({ error: 'Action parameter required' });
        return;
      }

      switch (req.body.action) {
        case 'retry':
          if (!req.body.id) {
            res.status(400).json({ error: 'Item ID required' });
            return;
          }
          try {
            await offlineQueue2.retry(req.body.id);
            res.status(200).json({ success: true });
          } catch (error) {
            console.error('Retry failed:', error);
            res.status(500).json({ error: 'Retry failed' });
          }
          break;
        case 'delete':
        case 'remove':
          if (!req.body?.id) {
            res.status(400).json({ error: 'Item ID required' });
            return;
          }
          await offlineQueue2.remove(req.body.id);
          res.status(200).json({ success: true });
          break;
        default:
          res.status(400).json({ error: 'Invalid action' });
      }
      break;

    case 'DELETE':
      const offlineQueue3 = new OfflineQueue();
      const networkMonitor3 = new NetworkMonitor(offlineQueue3);
      
      if (!req.body?.id) {
        const id = req.query.id as string | undefined;
        if (!id) {
          res.status(400).json({ error: 'Item ID required' });
          return;
        }
        await offlineQueue3.remove(id);
      } else {
        await offlineQueue3.remove(req.body.id);
      }
      res.status(200).json({ success: true });
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      res.status(405).json({ error: 'Method Not Allowed' });
  }
}

export async function getQueueStats() {
  const offlineQueue = new OfflineQueue();
  return offlineQueue.getQueueStats();
}

export async function flushQueue() {
  const offlineQueue = new OfflineQueue();
  await offlineQueue.flush();
}