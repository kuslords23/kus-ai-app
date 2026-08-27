"use client";

import React, { useState } from "react";
import { JYINX_MODELS } from "@/lib/jyinx/model-registry";

interface DualPaneProps {
  onModelSelect: (modelName: string) => void;
  onSyncStatusChange: (status: string) => void;
}

export const DualPane: React.FC<DualPaneProps> = ({ onModelSelect, onSyncStatusChange }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModel, setActiveModel] = useState(JYINX_MODELS[0]?.id ?? "openrouter/auto");
  const [code, setCode] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const handleSyncStatusChange = (status: string) => {
    setIsConnected(status === "online");
    onSyncStatusChange(status);
  };

  return <div className="dual-pane-container">
    <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
      <div className="sidebar-header"><h2>Jyinx Workspace</h2><button type="button" className="sidebar-toggle" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">☰</button></div>
      {sidebarOpen && <div className="sidebar-content"><ul className="file-list">{JYINX_MODELS.map((model) => <li key={model.id} className="file-item"><span className="file-name">{model.label}</span><button type="button" className="file-action" onClick={() => { setActiveModel(model.id); onModelSelect(model.id); }}>Select</button></li>)}</ul></div>}
    </aside>
    <main className="main-panel"><div className="editor-pane"><div className="editor-header"><select value={activeModel} onChange={(event) => { setActiveModel(event.target.value); onModelSelect(event.target.value); }}>{JYINX_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select><span className="status-indicator"><span className={`status-dot ${isConnected ? "online" : "offline"}`}></span>{isConnected ? "Online" : "Offline"}</span><button type="button" onClick={() => handleSyncStatusChange(isConnected ? "offline" : "online")}>Toggle connection</button></div><textarea value={code} onChange={(event) => setCode(event.target.value)} placeholder="Start coding here..." /></div></main>
  </div>;
};

export default DualPane;
