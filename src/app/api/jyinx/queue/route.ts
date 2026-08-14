import { NextApiRequest, NextApiResponse } from 'next';

import { OfflineQueue } from '../../lib/jyinx/offline-queue';
import { networkMonitor } from '../../lib/jyinx/network-monitor';

// Instance for API access
const offlineQueue = new OfflineQueue();

// API Route Handlers

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'GET':
      const status = offlineQueue.status;
      res.status(200).json({
        status: status.toUpperCase(),
        pendingItems: offlineQueue.pendingItems,
        lastSync: offlineQueue.lastSync
      });
      break;

    case 'POST':
      const { id } = req.body;
      if (!id) {
        res.status(400).json({ error: 'itemId is required' });
        break;
      }

      try {
        if (req.query.retry) {
          // Retry failed item
          await offlineQueue.retry(id);
          res.status(200).json({ success: true });
        }
      } catch (error) {
        res.status(500).json({ error: 'Retry failed' });
      }
      break;

    case 'DELETE':
      // Remove item from queue
      offlineQueue.delete(id!);
      res.status(200).json({ success: true });
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end('Method Not Allowed');
      break;
  }
};

// Utility Handlers

export async function getQueueStats() {
  const stats = await offlineQueue.getQueueStats();
  return stats;
}

export async function flushQueue() {
  await offlineQueue.flush();
}