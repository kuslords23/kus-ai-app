import React, { useState, useEffect } from 'react';

interface TokenMeterProps {
  ledgerService: any;
  model: string;
  onTokenUpdate: (modelName: string, tokens: number) => void;
}

export const TokenMeter: React.FC<TokenMeterProps> = ({
  ledgerService,
  model,
  onTokenUpdate
}) => {
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    // Simulate token consumption
    const interval = setInterval(() => {
      const newInput = Math.floor(Math.random() * 50) + inputTokens;
      const newOutput = Math.floor(Math.random() * 50) + outputTokens;
      const newCost = (newInput + newOutput) * 0.001;
      
      setInputTokens(newInput);
      setOutputTokens(newOutput);
      setTotalCost(newCost);
      onTokenUpdate(model, newInput + newOutput);
    }, 10000);
    
    return () => clearInterval(interval);
  }, [inputTokens, outputTokens, ledgerService, model, onTokenUpdate]);

  return (
    <div className="jyinx-token-meter">
      <h3>Token Usage</h3>
      
      <div className="jyinx-token-stats">
        <div className="jyinx-token-stat">
          <span className="jyinx-label">Input:</span>
          <span className="jyinx-value jyinx-input-tokens">{inputTokens}</span>
        </div>
        
        <div className="jyinx-token-stat">
          <span className="jyinx-label">Output:</span>
          <span className="jyinx-value jyinx-output-tokens">{outputTokens}</span>
        </div>
        
        <div className="jyinx-token-stat">
          <span className="jyinx-label">Total:</span>
          <span className="jyinx-value jyinx-total-tokens">{inputTokens + outputTokens}</span>
        </div>
        
        <div className="jyinx-token-stat">
          <span className="jyinx-label">Cost:</span>
          <span className="jyinx-value jyinx-cost">${totalCost.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
};