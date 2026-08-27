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
    let cancelled = false;
    const loadUsage = async () => {
      try {
        const response = await fetch(`/api/jyinx/metrics?model=${encodeURIComponent(model)}`, { cache: "no-store" });
        const data = await response.json() as { inputTokens?: number; outputTokens?: number; cost?: number };
        if (cancelled || !response.ok) return;
        const nextInput = data.inputTokens ?? 0;
        const nextOutput = data.outputTokens ?? 0;
        setInputTokens(nextInput);
        setOutputTokens(nextOutput);
        setTotalCost(data.cost ?? 0);
        onTokenUpdate(model, nextInput + nextOutput);
      } catch {
        if (!cancelled) onTokenUpdate(model, 0);
      }
    };
    void loadUsage();
    const interval = window.setInterval(() => void loadUsage(), 10_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [ledgerService, model, onTokenUpdate]);

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