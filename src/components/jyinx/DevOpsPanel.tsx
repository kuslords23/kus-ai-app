import React, { useState } from 'react';

export const DevOpsPanel: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'committing' | 'pushing' | 'deploying'>('idle');

  const commitAndPush = async () => {
    setStatus('committing');
    try {
      // Stage all changes
      await runShellCommand('git add .');
      
      // Commit with auto-generated or custom message
      const message = `Jyinx workspace update: ${new Date().toISOString()}`;
      await runShellCommand(`git commit -m "${message}"`);
      
      setStatus('pushing');
      await runShellCommand('git push origin main');
      setStatus('idle');
      alert('Changes committed and pushed!');
    } catch (error) {
      console.error('Git operation failed:', error);
      setStatus('idle');
      alert('Git operation failed - check console for details');
    }
  };

  const triggerVercelDeploy = async () => {
    setStatus('deploying');
    try {
      // Vercel API deployment trigger
      const response = await fetch('/api/vercel-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: 'kus-ai-app' })
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus('idle');
        alert(`Vercel deployment triggered! ${data.url}`);
      } else {
        throw new Error('Deployment failed');
      }
    } catch (error) {
      console.error('Vercel deploy failed:', error);
      setStatus('idle');
      alert('Vercel deployment failed');
    }
  };

  const handleQuerySQL = async () => {
    // Supabase / SQLite query tool handler
    alert('SQL query tool opened - see Supabase integration');
  };

  return (
    <div className="devops-panel">
      <h3>��⚙��️ DevOps Panel</h3>
      
      {/* Git Controls */}
      <div className="control-group">
        <button 
          onClick={commitAndPush}
          className={`btn btn-primary ${status !== 'idle' ? 'active' : ''}`}
          disabled={status !== 'idle'}
        >
          {status === 'committing' ? 'Staging...' : 
          status === 'pushing' ? 'Pushing...' : 
          status === 'deploying' ? 'Deploying...' : 'Commit & Push'}
        </button>
        
        <button 
          onClick={triggerVercelDeploy}
          className={`btn btn-secondary ${status === 'deploying' ? 'active' : ''}`}
          disabled={status !== 'idle'}
        >
          Deploy to Vercel
        </button>
        
        <button 
          onClick={handleQuerySQL}
          className="btn btn-outline"
        >
          Query DB
        </button>
      </div>

      {/* Status Indicator */}
      <div className="status-indicator">
        {status === 'idle' && <span className="dot green"></span>}
        {status !== 'idle' && <span className="dot yellow pulse"></span>}
        <span className="status-text">{status}</span>
      </div>
    </div>
  );
};

// Helper function for running shell commands
async function runShellCommand(command: string): Promise<void> {
  // In production, use a proper server-side API instead of direct shell execution
  console.log(`Executing: ${command}`);
  // NOTE: Direct shell execution from frontend is not recommended for security
  // Instead, this should go through a protected backend endpoint
}