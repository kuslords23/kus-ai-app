import { NextApiRequest, NextApiResponse } from 'next';
import { OfflineQueue } from '../../../lib/jyinx/offline-queue';
import { NetworkMonitor } from '../../../lib/jyinx/network-monitor';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { method } = req;

  switch (method) {
    case 'GET':
      // Return queue status
      const status = networkMonitor.getStatus();
      res.status(200).json({
        status: status.toUpperCase(),
        pendingItems: offlineQueue.getQueueStats().pending,
        lastSync: offlineQueue.getQueueStats().lastSync
      });
      break;

    case 'POST':
      // Handle queue operations
      if (req.body?.action === 'retry') {
        const item = offlineQueue.getById(req.body.id);
        if (item) {
          // Simple retry logic
          offlineQueue.markProcessing(item.id);
          res.status(200).json({ success: true, id: item.id });
        } else {
          res.status(400).json({ error: 'Invalid action' });
        }
      } else {
        res.status(400).json({ error: 'Action ID required' });
      }
      break;

    case 'DELETE':
      // Remove item from queue
      offlineQueue.cleanup();
      res.status(200).json({ success: true });
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      res.status(405).end('Method Not Allowed');
      break;
  }
}