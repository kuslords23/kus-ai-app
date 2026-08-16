import React, { useState } from 'react';

export const InputWorkspace: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [status, setStatus] = useState('');

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setStatus('Analyzing…');
    try {
      const response = await fetch('/api/jyinx/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Analyze this input and return actionable findings.', model: 'openrouter/auto', code: inputText, file: 'input-workspace' }) });
      const result = await response.json() as { content?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Analysis failed.');
      setAnalysisResult(result.content || 'No analysis returned.');
      setStatus('Analysis complete');
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Analysis unavailable.');
    }
  };

  return (
    <div className="jyinx-input-workspace">
      <textarea
        className="jyinx-input-area"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Enter text for analysis or script parsing..."
        rows={10}
      />
      
      <div className="jyinx-workspace-actions">
        <button 
          className="jyinx-analyze-btn"
          onClick={handleAnalyze}
        >
          Analyze
        </button>
        <button 
          className="jyinx-script-btn"
          onClick={() => { setAnalysisResult('Script parsing is available through Agent chat. Submit the script there with the active repository context.'); setStatus('Ready for agent parsing'); }}
        >
          Parse Script
        </button>
      </div>
      
      {status && <p className="jyinx-status">{status}</p>}
      {analysisResult && (
        <div className="jyinx-analysis-result">
          <pre>{analysisResult}</pre>
        </div>
      )}
    </div>
  );
};