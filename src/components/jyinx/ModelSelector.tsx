import React from 'react';

interface ModelOption {
  id: string;
  name: string;
  icon: string;
}

interface ModelSelectorProps {
  models: ModelOption[];
  selected: string;
  onChange: (id: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selected,
  onChange
}) => {
  return (
    <div className="jyinx-model-selector">
      <h3>Model</h3>
      <div className="jyinx-model-options">
        {models.map(model => (
          <button
            key={model.id}
            className={`jyinx-model-button ${selected === model.id ? 'jyinx-active' : ''}`}
            onClick={() => onChange(model.id)}
          >
            {model.icon} {model.name}
          </button>
        ))}
      </div>
    </div>
  );
};