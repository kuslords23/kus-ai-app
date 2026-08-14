import React, { useState, useCallback } from 'react';

interface DualPaneProps {
  onModelSelect: (modelName: string) => void;
  onSyncStatusChange: (status: string) => void;
}

export const DualPane: React.FC<DualPaneProps> = ({
  onModelSelect,
  onSyncStatusChange
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModel, setActiveModel] = useState('llama-3-8x');
  const [isConnected, setIsConnected] = useState(false);

  const handleModelSelect = (model: string) => {
    setActiveModel(model);
    onModelSelect(model);
  };

  const handleSyncStatusChange = (status: string) => {
    setIsConnected(status === 'online');
    onSyncStatusChange(status);
  };

  return (
    <div className="dual-pane-container">
      {/* File Explorer Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>📂 Jyinx Workspace</h2>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ⌨️
          </button>
        </div>
        <div className="sidebar-content">
          <ul className="file-list">
            {[
              {id: 'llama-3-8x', name: 'Llama 3-8x', icon: '🤖'},
              {id: 'gemma-4-31b-it', name: 'Gemma 4B', icon: '🤖'},
              {id: 'mistral-large', name: 'Mixtral Large', icon: '🤖'},
              {id: 'nvidia-nemotron-3-ultra-550b-a55b', name: 'Nemotron Ultra', icon: '🤖'},
              {id: 'qwen3-coder', name: 'Qwen 3-Coder', icon: '🤖'}
            ].map(file => (
              <li key={file.id} className="file-item">
                <span className="file-icon">{file.icon}</span>
                <span className="file-name">{file.name}</span>
                <button 
                  className="file-action"
                  onClick={() => handleModelSelect(file.name)}
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main Editor Panel */}
      <main className="main-panel">
        <div className="editor-pane">
          <div className="editor-header">
            <div className="model-selector">
              <select
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value)}
              >
                {[
                  { id: 'llama-3-8x', name: 'Llama 3-8x', icon: '🤖' },
                  { id: 'gemma-4-31b-it', name: 'Gemma 4B', icon: '🤖' },
                  { id: 'mistral-large', name: 'Mixtral Large', icon: '🤖' },
                  { id: 'nvidia-nemotron-3-ultra-550b-a55b', name: 'Nemotron Ultra', icon: '🤖' },
                  { id: 'qwen3-coder', name: 'Qwen 3-Coder', icon: '🤖' },
                ].map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="status-bar">
              <span className="status-indicator">
                <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
                <span className="status-text">{isConnected ? 'Online' : 'Offline – Storing Locally'}</span>
                <span className="pending-count">Pending: {getPendingCount()}</span>
              </span>
            </div>
          </div>
          <div className="editor-body">
            <textarea
              placeholder="Start coding here..."
              onChange={(e) => {
                // Send code changes to OpenRouter
                if (activeModel) {
                  const code = e.target.value;
                  // In real implementation, send to OpenRouter
                  console.log(`Code change detected for ${activeModel}`);
                }
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

function getPendingCount(): number {
  // In real implementation, query the offline queue
  return 0;
}

export default DualPane;