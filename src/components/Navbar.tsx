import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'unconfigured' | 'error'>('checking');

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setApiStatus('connected');
        } else {
          setApiStatus('unconfigured');
        }
      } catch (err) {
        setApiStatus('error');
      }
    }
    checkHealth();
  }, []);

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/90 flex items-center justify-between px-6 shrink-0 z-20 relative">
      {/* Brand Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
            MICROSTOCK <span className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded text-sm font-black border border-indigo-500/20">QC</span>
          </h1>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest -mt-0.5">COMPLIANCE ENGINE</p>
        </div>
      </div>

      {/* Right Connection Status & User Profile representation */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 bg-slate-950/40 border border-slate-800 px-3 py-1.5 rounded-lg">
          <div className={`w-2 h-2 rounded-full ${
            apiStatus === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse' : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
          }`}></div>
          <span className="text-xs font-bold text-slate-300">
            {apiStatus === 'checking' && 'INITIALIZING CORE...'}
            {apiStatus === 'connected' && 'GEMINI ENGINE ACTIVE'}
            {apiStatus === 'unconfigured' && 'KEY NOT CONFIGURED'}
            {apiStatus === 'error' && 'OFFLINE DEMO'}
          </span>
        </div>
        
        <div className="h-8 w-px bg-slate-800 hidden sm:block"></div>
        
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black text-slate-200 tracking-wider">PRO WORKSPACE</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">UNRESTRICTED ACCESS</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 border border-indigo-400/20 shadow-md flex items-center justify-center text-white font-black text-xs tracking-wider">
            PRO
          </div>
        </div>
      </div>
    </header>
  );
}
