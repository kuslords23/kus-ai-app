import React, { useState, useEffect } from 'react';
import { hybridStorage } from '@/lib/jyinx/hybrid-storage-adapter';
import { ViewportToggler } from './ViewportToggler';
import { TokenMeter } from './TokenMeter';
import { ModelSelector } from './ModelSelector';
import { InputWorkspace } from './InputWorkspace';

interface JyinxTabProps {
  onModelSelect: (modelName: string) => void;
  onTokenUpdate: (modelName: string, tokens: number) => void;
}

export const JyinxTab: React.FC<JyinxTabProps> = ({
  onModelSelect,
  onTokenUpdate
}) => {
  const [selectedModel, setSelectedModel] = useState('llama3-ddof');
  const [tokenBalance, setTokenBalance] = useState(0);
  const [models, setModels] = useState([
    { id: 'llama3-ddof', name: 'Llama 3 DD-Off', icon: '🦙' },
    { id: 'deepseek-v2', name: 'DeepSeek v2', icon: '🔍' },
    { id: 'mistral-large', name: 'Mixtral Large', icon: '🦙' },
  ]);

  // Platform info for tracking
  useEffect(() => {
    const info = hybridStorage.getPlatformInfo();
    console.log('Jyinx Platform Info:', info);
  }, []);

  // Initialize token tracking when model changes
  useEffect(() => {
    if (selectedModel) {
      // Initial snapshot
      onTokenUpdate(selectedModel, 0);
    }
  }, [selectedModel, onTokenUpdate]);

  return (
    <div className="jyinx-tab">
      <h2>Jyinx Workspace</h2>
      
      {/* Header area with model selector */}
      <header className="jyinx-header">
        <div className="jyinx-model-selector">
          <h3>Model</h3>
          <div className="jyinx-model-options">
            {models.map(model => (
              <button
                key={model.id}
                className={`jyinx-model-button ${selectedModel === model.id ? 'jyinx-active' : ''}`}
                onClick={() => setSelectedModel(model.id)}
              >
                {model.icon} {model.name}
              </button>
            ))}
          </div>
        </div>
        
        {/* Viewport Toggler */}
        <ViewportToggler onChange={onModelSelect} />
      </header>

      {/* Token Metering */}
      <section className="jyinx-token-section">
        <h3>Token Usage</h3>
        <TokenMeter
          ledgerService={hybridStorage}
          model={selectedModel}
          onTokenUpdate={onTokenUpdate}
        />
      </section>

      {/* Input Workspace */}
      <section className="jyinx-input-section">
        <h3>Input Workspace</h3>
        <InputWorkspace />
      </section>
    </div>
  );
};