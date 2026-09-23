import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ImageReviewTab from './components/ImageReviewTab';
import { ReviewItem } from './types';
import { ShieldCheck } from 'lucide-react';

const LOCAL_STORAGE_REVIEWS_KEY = 'microstock_automator_reviews';

export default function App() {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_REVIEWS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist reviewItems when changed (except huge base64 fields if they exceed storage)
  useEffect(() => {
    try {
      // Store lightweight items first to prevent quota exceeded errors
      const lightweightItems = reviewItems.map(item => {
        const pUrl = item.previewUrl || '';
        return {
          id: item.id,
          imageName: item.imageName || 'Unnamed Asset',
          imageSize: item.imageSize || '0.00 MB',
          previewUrl: pUrl.length < 500000 ? pUrl : '', // keep small previews, skip huge ones
          targetConcept: item.targetConcept || '',
          status: item.status || 'idle',
          result: item.result || undefined,
          error_message: item.error_message || undefined
        };
      });
      localStorage.setItem(LOCAL_STORAGE_REVIEWS_KEY, JSON.stringify(lightweightItems));
    } catch (e) {
      console.error("Failed to save reviews to localStorage:", e);
    }
  }, [reviewItems]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans antialiased relative overflow-hidden">
      
      {/* Background ambient light effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
      
      {/* Top Banner/Navigation */}
      <div className="space-y-0 relative z-10">
        <Navbar />
        
        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
          <ImageReviewTab 
            reviewItems={reviewItems} 
            setReviewItems={setReviewItems} 
          />
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900/40 border-t border-slate-800/80 mt-12 py-8 text-slate-400 text-xs relative z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            
            {/* Branding Column */}
            <div className="space-y-3">
              <span className="font-extrabold text-slate-200 uppercase tracking-widest flex items-center gap-2 text-[10px]">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                MICROSTOCK QUALITY CONTROL SYSTEM
              </span>
              <p className="text-[11px] leading-relaxed text-slate-400">
                A professional, full-stack compliance-benchmarking console. Instantly verifies pixel integrity, detects AI defects, anatomical distortions, and intellectual property risks before agency delivery.
              </p>
            </div>

            {/* Microstock compliance links/tips */}
            <div className="space-y-3">
              <span className="font-extrabold text-slate-200 uppercase tracking-widest text-[10px] block">
                COMPLIANCE PARAMETERS
              </span>
              <ul className="space-y-1.5 text-[11px] text-slate-400">
                <li className="flex items-center gap-2">
                  <span className="text-indigo-400">⚡</span> No trademarked logos or brand identifiers.
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-indigo-400">⚡</span> High clarity, no noise, no artifacts.
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-indigo-400">⚡</span> Fully compliant commercial suitability.
                </li>
              </ul>
            </div>

            {/* Troubleshooting info */}
            <div className="space-y-3">
              <span className="font-extrabold text-slate-200 uppercase tracking-widest text-[10px] block">
                ENGINE STATS
              </span>
              <p className="text-[11px] leading-relaxed text-slate-400">
                AI processing is routed server-side via the secure Google Gemini engine. Toggle model settings to manage rate limits.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="bg-slate-800/70 border border-slate-700/50 text-slate-300 px-2.5 py-1 rounded-md font-mono text-[9px]">
                  Dual-Core Switch Mode
                </span>
                <span className="bg-slate-800/70 border border-slate-700/50 text-slate-300 px-2.5 py-1 rounded-md font-mono text-[9px]">
                  Express Core
                </span>
              </div>
            </div>

          </div>

          <div className="border-t border-slate-800/60 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© 2026 Microstock QC console. For professional commercial production pipelines.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-slate-300 transition-colors">Compliance Codex</a>
              <a href="#" className="hover:text-slate-300 transition-colors">Terms of Operations</a>
              <a href="#" className="hover:text-slate-300 transition-colors">Security Audit</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
