import React, { useState, useEffect } from 'react';

interface SyncStatusBadgeProps {
  syncStatus: 'online' | 'offline' | 'recovering';
  pendingItems: number;
  networkStatus: 'connected' | 'disconnected';
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  syncStatus,
  pendingItems,
  networkStatus
}) => {
  const [isVisible, setIsVisible] = useState(true);

  const getStatusText = () => {
    switch (syncStatus) {
      case 'online':
        return networkStatus === 'connected' ? 'Synced' : 'Offline - Storing Locally';
      case 'offline':
        return 'Offline - Storing Locally';
      case 'recovering':
        return 'Syncing Deltas...';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    switch (syncStatus) {
      case 'online':
        return 'bg-green-500';
      case 'offline':
        return 'bg-yellow-500';
      case 'recovering':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor()} text-white`}>
      <span className="w-2 h-2 mr-2 rounded-full bg-white animate-pulse"></span>
      <span>{getStatusText()}</span>
      {pendingItems > 0 && (
        <span className="ml-2 px-1.5 py-0.5 bg-white bg-opacity-20 rounded-full">
          {pendingItems}
        </span>
      )}
    </div>
  );
};