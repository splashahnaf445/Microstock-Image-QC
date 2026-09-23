import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Sparkles, 
  Download, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  RefreshCw,
  FileText,
  BadgeAlert,
  Info,
  Maximize2,
  ShieldCheck,
  Image as ImageIcon
} from 'lucide-react';
import JSZip from 'jszip';
import { ReviewItem, ReviewResult } from '../types';

interface ImageReviewTabProps {
  reviewItems: ReviewItem[];
  setReviewItems: React.Dispatch<React.SetStateAction<ReviewItem[]>>;
}

export default function ImageReviewTab({ reviewItems, setReviewItems }: ImageReviewTabProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<'fit' | '100%'>('fit');
  const [isBulkReviewing, setIsBulkReviewing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [rateLimitSecondsLeft, setRateLimitSecondsLeft] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'warning' | 'info' | 'success' } | null>(null);
  const [selectedModel, setSelectedModel] = useState<'gemini-3.5-flash-lite' | 'gemini-3.6-flash' | 'gemini-3.1-pro'>('gemini-3.5-flash-lite');

  const showNotification = (message: string, type: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(prev => prev?.message === message ? null : prev);
    }, 6000);
  };

  useEffect(() => {
    if (rateLimitSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setRateLimitSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitSecondsLeft]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = reviewItems.find(item => item.id === selectedItemId);

  // Dynamic pass/fail calculations based on real analysis results (Pass threshold >= 74)
  const passCount = reviewItems.filter(item => item.status === 'success' && item.result && item.result.technical_score >= 74).length;
  const failCount = reviewItems.filter(item => item.status === 'success' && item.result && item.result.technical_score < 74).length;

  // File drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFiles = (files: FileList) => {
    const validImageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (validImageFiles.length === 0) {
      showNotification("Please upload valid image files (PNG, JPG, WEBP).", "warning");
      return;
    }

    if (reviewItems.length + validImageFiles.length > 40) {
      showNotification("Maximum batch size is 40 images. Only the first eligible images will be loaded.", "warning");
    }

    const remainingSlots = 40 - reviewItems.length;
    const filesToLoad = validImageFiles.slice(0, remainingSlots);

    filesToLoad.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        
        // Generate a highly compressed thumbnail to safely fit in LocalStorage
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 320; // maximum dimension for fast, space-efficient preview
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let previewUrl = base64String;
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            previewUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality compressed preview
          }

          // Generate a beautifully balanced high-res inspection version for Gemini.
          // This keeps details extremely crisp for stock audit while cutting file weight by up to 98%,
          // which prevents the Gemini API TPM (Tokens Per Minute) and payload limits from throwing 429 errors!
          const inspectCanvas = document.createElement('canvas');
          const maxInspectDim = 1024; // 1024px is the perfect size for detailed Gemini vision inspection
          let inspectWidth = img.width;
          let inspectHeight = img.height;
          if (inspectWidth > inspectHeight) {
            if (inspectWidth > maxInspectDim) {
              inspectHeight = Math.round((inspectHeight * maxInspectDim) / inspectWidth);
              inspectWidth = maxInspectDim;
            }
          } else {
            if (inspectHeight > maxInspectDim) {
              inspectWidth = Math.round((inspectWidth * maxInspectDim) / inspectHeight);
              inspectHeight = maxInspectDim;
            }
          }
          inspectCanvas.width = inspectWidth;
          inspectCanvas.height = inspectHeight;
          const inspectCtx = inspectCanvas.getContext('2d');
          let inspectBase64 = base64String;
          if (inspectCtx) {
            inspectCtx.drawImage(img, 0, 0, inspectWidth, inspectHeight);
            inspectBase64 = inspectCanvas.toDataURL('image/jpeg', 0.85); // 85% quality compressed JPEG
          }

          const newItem: ReviewItem = {
            id: crypto.randomUUID(),
            imageName: file.name,
            imageSize: (file.size / (1024 * 1024)).toFixed(2) + " MB",
            previewUrl: previewUrl, // highly optimized version for persistence
            base64Data: inspectBase64, // optimized inspection data for extremely low token consumption
            status: 'idle'
          };
          setReviewItems(prev => [...prev, newItem]);
          setSelectedItemId(prevId => prevId || newItem.id);
        };
        img.onerror = () => {
          const newItem: ReviewItem = {
            id: crypto.randomUUID(),
            imageName: file.name,
            imageSize: (file.size / (1024 * 1024)).toFixed(2) + " MB",
            previewUrl: base64String,
            base64Data: base64String,
            status: 'idle'
          };
          setReviewItems(prev => [...prev, newItem]);
          setSelectedItemId(prevId => prevId || newItem.id);
        };
        img.src = base64String;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReviewItems(prev => prev.filter(item => item.id !== id));
    if (selectedItemId === id) {
      setSelectedItemId(null);
    }
  };

  const handleClearAll = () => {
    // Instantly and reliably delete all uploaded files and clear the queue
    setReviewItems([]);
    setSelectedItemId(null);
    try {
      localStorage.removeItem('microstock_automator_reviews');
    } catch (e) {
      console.error("Failed to remove reviews from localStorage:", e);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ZIP download generator for all passed assets (score >= 74)
  const handleDownloadPassedZip = async () => {
    const passedItems = reviewItems.filter(
      item => item.status === 'success' && item.result && item.result.technical_score >= 74
    );

    if (passedItems.length === 0) {
      showNotification("No passed images (score >= 74) found in the queue to download.", "info");
      return;
    }

    setIsZipping(true);
    const zip = new JSZip();

    try {
      passedItems.forEach((item, index) => {
        // Use full raw base64 data if available, fallback to preview
        const base64Content = item.base64Data || item.previewUrl;
        if (!base64Content) return;

        // Split out the mime type and raw base64 string
        const parts = base64Content.split(',');
        if (parts.length < 2) return;
        const rawBase64 = parts[1];

        // Retrieve extension from base64 mime-type header
        const mime = parts[0].split(';')[0].split(':')[1] || 'image/jpeg';
        let ext = 'jpg';
        if (mime.includes('png')) ext = 'png';
        else if (mime.includes('webp')) ext = 'webp';
        else if (mime.includes('gif')) ext = 'gif';

        const rawName = item.imageName || `passed_asset_${index + 1}`;
        const filename = rawName.includes('.') ? rawName : `${rawName}.${ext}`;

        zip.file(filename, rawBase64, { base64: true });
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `passed_microstock_assets_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Failed to generate ZIP archive:", error);
      showNotification("An error occurred while packaging your assets into a ZIP file.", "error");
    } finally {
      setIsZipping(false);
    }
  };

  const handleUpdateTargetConcept = (id: string, text: string) => {
    setReviewItems(prev => prev.map(item => 
      item.id === id ? { ...item, targetConcept: text } : item
    ));
  };

  // Run Benchmark Review for single item
  const runReviewForItem = async (id: string): Promise<{ success: boolean; isQuota?: boolean; retryInSeconds?: number }> => {
    setReviewItems(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'reviewing', error_message: undefined } : item
    ));

    const itemToReview = reviewItems.find(item => item.id === id);
    if (!itemToReview) return { success: false };
    const base64ToSend = itemToReview.base64Data || itemToReview.previewUrl;
    if (!base64ToSend) return { success: false };

    try {
      let detectedMime = 'image/jpeg';
      try {
        const parts = base64ToSend.split(';');
        if (parts.length > 0 && parts[0].includes(':')) {
          const mimePart = parts[0].split(':')[1];
          if (mimePart) {
            detectedMime = mimePart;
          }
        }
      } catch (_) {}

      const response = await fetch('/api/review-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: base64ToSend,
          mimeType: detectedMime,
          imageName: itemToReview.imageName,
          targetConcept: itemToReview.targetConcept || undefined,
          model: selectedModel
        })
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (!response.ok) {
        if (isJson) {
          const data = await response.json();
          if (response.status === 429) {
            const retryIn = data.retryInSeconds || 35;
            setRateLimitSecondsLeft(retryIn);
            setReviewItems(prev => prev.map(item => 
              item.id === id ? { ...item, status: 'error', error_message: data.error } : item
            ));
            return { success: false, isQuota: true, retryInSeconds: retryIn };
          }
          throw new Error(data.error || `Server error (${response.status})`);
        } else {
          const textError = await response.text();
          console.error("Non-JSON error from server:", textError);
          // If the error looks like HTML, extract a clean preview, otherwise use a generic message
          const cleanText = textError.length > 120 ? textError.substring(0, 120) + "..." : textError;
          const noHtml = cleanText.replace(/<[^>]*>/g, '').trim();
          throw new Error(`Server returned error (${response.status}): ${noHtml || "Internal Server Error"}`);
        }
      }

      if (!isJson) {
        throw new Error("Server succeeded but did not return JSON data.");
      }

      const data = await response.json();

      setReviewItems(prev => prev.map(item => 
        item.id === id ? { ...item, status: 'success', result: data } : item
      ));
      return { success: true };
    } catch (err: any) {
      setReviewItems(prev => prev.map(item => 
        item.id === id ? { ...item, status: 'error', error_message: err.message || "Quality analysis failed" } : item
      ));
      return { success: false };
    }
  };

  // Run Benchmark Review for all rows
  const handleBulkReview = async () => {
    const idleOrErrorItems = reviewItems.filter(item => item.status === 'idle' || item.status === 'error');
    if (idleOrErrorItems.length === 0) {
      showNotification("No idle or failed images to review.", "info");
      return;
    }

    setIsBulkReviewing(true);
    // Process one by one to avoid overwhelming server or rate limit
    for (let i = 0; i < idleOrErrorItems.length; i++) {
      const item = idleOrErrorItems[i];
      
      let res = await runReviewForItem(item.id);
      
      // If we hit a rate limit, pause bulk review, countdown, and retry!
      if (!res.success && res.isQuota) {
        const waitTime = (res.retryInSeconds || 35) + 2; // add a little safety buffer
        console.log(`Rate limit encountered. Pausing and auto-waiting ${waitTime} seconds...`);
        
        for (let s = waitTime; s > 0; s--) {
          setRateLimitSecondsLeft(s);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        setRateLimitSecondsLeft(0);
        
        // Retry the item
        res = await runReviewForItem(item.id);
      }
      
      if (!res.success) {
        // If it still failed, stop the bulk review to let the user review the error
        break;
      }
      
      // Introduce a strict sleep of 4 seconds between every single image upload and analysis request to respect free tier rate limits
      if (i < idleOrErrorItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    }
    setIsBulkReviewing(false);
  };

  // Download review result JSON
  const handleExportJSON = (item: ReviewItem) => {
    if (!item.result) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(item, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `microstock_review_${item.imageName.split('.')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  // Helper score color mapper (Aligned with new 74 pass threshold)
  const getScoreColor = (score: number) => {
    if (score >= 74) return 'text-emerald-500 border-emerald-500 bg-emerald-50/40';
    if (score >= 60) return 'text-amber-500 border-amber-500 bg-amber-50/40';
    return 'text-rose-500 border-rose-500 bg-rose-50/40';
  };

  return (
    <div className="space-y-6 relative">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`p-4.5 rounded-xl border flex items-center justify-between gap-4 shadow-xl backdrop-blur-md z-50 ${
              notification.type === 'error'
                ? 'bg-rose-950/80 border-rose-800/60 text-rose-200 shadow-rose-950/20'
                : notification.type === 'warning'
                ? 'bg-amber-950/80 border-amber-800/60 text-amber-200 shadow-amber-950/20'
                : notification.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-200 shadow-emerald-950/20'
                : 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-black/40'
            }`}
          >
            <div className="flex items-center gap-3">
              {notification.type === 'error' && <XCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />}
              {notification.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />}
              {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />}
              {notification.type === 'info' && <Info className="w-5 h-5 flex-shrink-0 text-indigo-400" />}
              <span className="text-xs sm:text-sm font-semibold tracking-wide">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-xs font-bold hover:opacity-80 px-2.5 py-1 bg-white/10 hover:bg-white/15 rounded-md transition-colors"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {rateLimitSecondsLeft > 0 && (
        <div className="bg-amber-950/60 border border-amber-800/50 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-200 shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-1000" style={{ width: `${(rateLimitSecondsLeft / 20) * 100}%` }}></div>
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex-shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <p className="font-bold text-sm tracking-wide text-amber-300">API Speed Buffer Enforced (Rate Limit 429)</p>
              <p className="text-[11px] text-amber-400/85 mt-1 leading-relaxed max-w-2xl">
                The AI Core is cooling down to comply with standard engine quota rules.
                {isBulkReviewing 
                  ? " The automated batch review has paused and will resume operations in " 
                  : " Operations will resume automatically in "}
                <span className="font-black text-amber-300 text-sm font-mono bg-amber-500/20 px-1.5 py-0.5 rounded ml-1">{rateLimitSecondsLeft}s</span>.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRateLimitSecondsLeft(0)}
            className="text-[10px] uppercase tracking-wider font-extrabold text-amber-100 hover:text-white bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/30 px-3.5 py-2 rounded-lg transition-all flex-shrink-0 shadow-sm"
          >
            Bypass Cooldown
          </button>
        </div>
      )}

      {/* Compact Description header */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800/80 rounded-xl px-4 py-3 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg flex-shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-black text-white tracking-wide uppercase flex items-center gap-2">
              Quality & Compliance Benchmark Console
            </h2>
            <p className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
              40-Asset Bulk Queue & Pixel Inspector • AI multi-point checks for artifacts, focus, and IP risks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9.5px] bg-slate-950/80 text-slate-300 font-extrabold px-2.5 py-1 rounded-md border border-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> 100% Pixel Audit
          </span>
          <span className="text-[9.5px] bg-slate-950/80 text-slate-300 font-extrabold px-2.5 py-1 rounded-md border border-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-indigo-400" /> IP & Logo Scan
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Upload and Gallery queue list (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800/90 rounded-2xl p-5 shadow-lg space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider">Batch Operations</h3>
              <span className="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">Queue Controller</span>
            </div>
            
            {/* Drag Area */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleTriggerUpload}
              className={`border-2 border-dashed rounded-xl p-6.5 text-center cursor-pointer transition-all duration-200 relative overflow-hidden group ${
                dragActive 
                  ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                  : 'border-slate-800 bg-slate-950/50 hover:bg-slate-900/30 hover:border-slate-700/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl inline-block mb-3 shadow-md group-hover:scale-105 transition-transform duration-200">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition-colors" />
              </div>
              <p className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">Drag & drop asset batch</p>
              <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-wider">PNG, JPG, or WEBP • Max 40 files</p>
            </div>

            {/* Model Selection Block */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> AI Engine Core
                </label>
                <span className="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-black tracking-widest uppercase">Select Mode</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 3.5 Flash-Lite */}
                <button
                  type="button"
                  onClick={() => setSelectedModel('gemini-3.5-flash-lite')}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                    selectedModel === 'gemini-3.5-flash-lite'
                      ? 'border-emerald-500/80 bg-emerald-500/10 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'border-slate-850 bg-slate-900/40 text-slate-400 hover:bg-slate-900/80 hover:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-black tracking-wide">3.5 Flash-Lite</span>
                    <span className="text-[8.5px] font-black text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-1 py-0.2 rounded tracking-tight">
                      (efficient most)
                    </span>
                  </div>
                  <span className="text-[9px] font-medium text-slate-400 mt-1">Fastest answers • Least credits & cost</span>
                </button>

                {/* 3.6 Flash */}
                <button
                  type="button"
                  onClick={() => setSelectedModel('gemini-3.6-flash')}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                    selectedModel === 'gemini-3.6-flash'
                      ? 'border-indigo-500 bg-indigo-500/10 text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                      : 'border-slate-850 bg-slate-900/40 text-slate-400 hover:bg-slate-900/80 hover:border-slate-800'
                  }`}
                >
                  <span className="text-xs font-black tracking-wide">3.6 Flash</span>
                  <span className="text-[9px] font-medium text-slate-400 mt-1">All-around help • High speed & accuracy</span>
                </button>

                {/* 3.1 Pro */}
                <button
                  type="button"
                  onClick={() => setSelectedModel('gemini-3.1-pro')}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                    selectedModel === 'gemini-3.1-pro'
                      ? 'border-purple-500 bg-purple-500/10 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.15)]'
                      : 'border-slate-850 bg-slate-900/40 text-slate-400 hover:bg-slate-900/80 hover:border-slate-800'
                  }`}
                >
                  <span className="text-xs font-black tracking-wide">3.1 Pro</span>
                  <span className="text-[9px] font-medium text-slate-400 mt-1">Advanced maths and code</span>
                </button>
              </div>
              <p className="text-[9.5px] text-slate-500 leading-relaxed font-medium">
                Choose <b className="text-emerald-400">3.5 Flash-Lite (efficient most)</b> for batch auditing with minimal credit usage and lowest latency, <b className="text-slate-300">3.6 Flash</b> for balanced reviews, or <b className="text-slate-300">3.1 Pro</b> for complex multi-point inspection.
              </p>
            </div>

            {reviewItems.length > 0 && (
              <div className="space-y-3.5 pt-3.5 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">BATCH ANALYTICS</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/15 px-2 py-0.5 rounded-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                      <span className="text-[9px] font-extrabold text-emerald-400 tracking-wider">PASS: {passCount}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/15 px-2 py-0.5 rounded-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                      <span className="text-[9px] font-extrabold text-rose-400 tracking-wider">FAIL: {failCount}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-1">
                  <span className="text-[10px] font-bold text-slate-400">Queue ({reviewItems.length}/40)</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleBulkReview}
                      disabled={isBulkReviewing || reviewItems.every(i => i.status === 'success')}
                      className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-black text-[10px] px-3.5 py-2 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1 shadow-md shadow-indigo-500/10 uppercase tracking-wider cursor-pointer"
                    >
                      {isBulkReviewing ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" /> Auditing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-indigo-200" /> Audit All
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleClearAll}
                      className="border border-slate-800 bg-slate-950 hover:bg-slate-900 text-rose-400 hover:text-rose-300 font-extrabold text-[10px] px-3 py-2 rounded-lg transition-all uppercase tracking-wider flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Wipe
                    </button>
                  </div>
                </div>

                {passCount > 0 && (
                  <button
                    onClick={handleDownloadPassedZip}
                    disabled={isZipping}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-emerald-800 disabled:to-emerald-800 text-white font-black text-[10px] py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 uppercase tracking-wider cursor-pointer"
                  >
                    {isZipping ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Generating compliance archive...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Download {passCount} passed assets (ZIP)
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Upload Gallery Queue list */}
          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            {reviewItems.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-950/20 rounded-2xl border border-dashed border-slate-800">
                <p className="text-xs italic text-slate-400">The bench queue is empty.</p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">Upload assets to run quality analysis</p>
              </div>
            ) : (
              reviewItems.map(item => {
                const isSelected = item.id === selectedItemId;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.1)]' 
                        : 'border-slate-800/80 hover:border-slate-700/80 bg-slate-900/30 backdrop-blur-sm'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg bg-slate-950 overflow-hidden relative flex-shrink-0 border border-slate-800 flex items-center justify-center">
                      {item.previewUrl ? (
                        <img 
                          src={item.previewUrl} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-200 truncate">{item.imageName}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{item.imageSize}</p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {item.status === 'reviewing' && (
                        <span className="w-4 h-4 text-indigo-400">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        </span>
                      )}

                      {item.status === 'success' && item.result && (
                        <div className="flex gap-1 items-center">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                            item.result.technical_score >= 74
                              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                              : 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                          }`}>
                            SCORE: {item.result.technical_score}
                          </span>
                        </div>
                      )}

                      {item.status === 'error' && (
                        <span className="text-rose-400" title={item.error_message}>
                          <XCircle className="w-4 h-4" />
                        </span>
                      )}

                      {item.status === 'idle' && (
                        <span className="text-slate-600 text-[9px] font-black tracking-wider uppercase bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">QUEUED</span>
                      )}

                      <button
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        className="text-slate-600 hover:text-rose-400 p-0.5 rounded hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column: Selected Image Inspection Panel (8 cols) */}
        <div className="lg:col-span-8">
          {!selectedItem ? (
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl min-h-[480px] lg:min-h-[520px] p-12 text-center text-slate-500 flex flex-col items-center justify-center shadow-xl">
              <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl inline-block mb-4 shadow-lg">
                <Eye className="w-10 h-10 text-indigo-400/80 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-slate-200 tracking-wide">Hero Inspection Viewport</h3>
              <p className="text-xs mt-2 text-slate-400 max-w-sm leading-relaxed">Select an uploaded asset from your 40-item queue on the left to review metrics, pixel clarity, and compliance checks in real-time.</p>
            </div>
          ) : (
            <div className="bg-slate-900/50 backdrop-blur-md border border-slate-850 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-800/80">
              
              {/* Inspection Header */}
              <div className="p-4.5 bg-slate-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">Asset Inspector</span>
                  <h3 className="text-sm font-black text-slate-200 truncate mt-1.5">{selectedItem.imageName}</h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Size: {selectedItem.imageSize}</p>
                </div>

                <div className="flex gap-2">
                  {selectedItem.status === 'idle' && (
                    <button
                      onClick={() => runReviewForItem(selectedItem.id)}
                      disabled={rateLimitSecondsLeft > 0}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-4.5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      {rateLimitSecondsLeft > 0 ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cooldown ({rateLimitSecondsLeft}s)
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-indigo-200" /> Run Analysis
                        </>
                      )}
                    </button>
                  )}

                  {selectedItem.status === 'error' && (
                    <button
                      onClick={() => runReviewForItem(selectedItem.id)}
                      disabled={rateLimitSecondsLeft > 0}
                      className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs px-4.5 py-2.5 rounded-xl transition-all shadow-md shadow-rose-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      {rateLimitSecondsLeft > 0 ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cooldown ({rateLimitSecondsLeft}s)
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" /> Retry Review
                        </>
                      )}
                    </button>
                  )}

                  {selectedItem.status === 'success' && selectedItem.result && (
                    <>
                      <button
                        onClick={() => runReviewForItem(selectedItem.id)}
                        disabled={rateLimitSecondsLeft > 0}
                        className="border border-slate-800 bg-slate-950 hover:bg-slate-900 disabled:opacity-50 text-slate-300 font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {rateLimitSecondsLeft > 0 ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cooldown ({rateLimitSecondsLeft}s)
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> Re-audit
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleExportJSON(selectedItem)}
                        className="border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-300 font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> Export JSON
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Viewport and Concept Link */}
              <div className="p-4 bg-slate-950/60 border-b border-slate-850 flex flex-col md:flex-row gap-4">
                
                {/* Dynamic Image Loupe Screen */}
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-center text-slate-400 text-xs">
                    <span className="font-mono text-[9px] font-black tracking-widest text-slate-500">HERO COMPLIANCE VIEWPORT</span>
                    <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
                      <button
                        onClick={() => setZoomLevel('fit')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          zoomLevel === 'fit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Fit Screen
                      </button>
                      <button
                        onClick={() => setZoomLevel('100%')}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          zoomLevel === '100%' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                        title="View image at 100% physical size to check focus/grain sharpness as required by stock review teams"
                      >
                        <ZoomIn className="w-3 h-3" /> 100% sharp
                      </button>
                    </div>
                  </div>

                  {/* Viewport Box - Hero Size */}
                  <div className="bg-slate-950/90 rounded-xl border border-slate-800/90 h-[480px] sm:h-[520px] lg:h-[560px] overflow-auto relative flex items-center justify-center shadow-inner bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]">
                    {selectedItem.previewUrl ? (
                      <div className={`transition-all duration-150 ${
                        zoomLevel === '100%' 
                          ? 'absolute top-0 left-0 cursor-move min-w-full min-h-full p-4' 
                          : 'w-full h-full flex items-center justify-center p-4'
                      }`}>
                        <img 
                          src={selectedItem.previewUrl} 
                          alt="Quality inspection"
                          className={`${
                            zoomLevel === '100%' 
                              ? 'max-w-none object-none w-auto h-auto' 
                              : 'max-w-full max-h-full object-contain'
                          }`}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="text-center p-6 space-y-3">
                        <ImageIcon className="w-10 h-10 text-slate-750 mx-auto" />
                        <p className="text-xs text-slate-400 font-bold">Image Preview Cleared</p>
                        <p className="text-[10px] text-slate-500 max-w-xs mx-auto leading-normal">
                          The high-resolution raw image data was omitted to prevent local storage quota overflow, but all benchmarking scores and compliance checks remain fully active.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Concept Link mapping sidebar in black */}
                <div className="w-full md:w-56 flex-shrink-0 bg-slate-950/60 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Info className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Concept Match</span>
                    </div>
                    <p className="text-[9.5px] text-slate-500 leading-normal font-medium">
                      Define the target prompt used for generation. The engine checks concept fidelity.
                    </p>

                    <textarea
                      value={selectedItem.targetConcept || ''}
                      onChange={(e) => handleUpdateTargetConcept(selectedItem.id, e.target.value)}
                      placeholder="Type the target concept/prompt..."
                      rows={4}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-200 focus:border-indigo-500 leading-normal focus:outline-none placeholder:text-slate-700"
                    />

                    {/* No Layer A prompts to select since Layer A is deleted */}
                  </div>

                  <div className="text-[9px] text-slate-500 border-t border-slate-850 pt-3 mt-3 leading-relaxed font-semibold">
                    💡 <b>Pro-Tip:</b> 100% zoom isolates compression halos and edge noise, the top causes of stock agency rejections.
                  </div>
                </div>
              </div>

              {/* Status specific view */}
              <div className="p-6">
                
                {selectedItem.status === 'reviewing' && (
                  <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full border-4 border-indigo-500/10 border-t-indigo-500 animate-spin"></div>
                      <Sparkles className="w-5 h-5 text-indigo-400 absolute top-4.5 left-4.5 animate-pulse" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-xs font-black text-slate-200 tracking-wider uppercase">Running Compliance Audits...</p>
                      <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed font-medium">
                        The engine is scanning anatomical symmetry, isolating watermarks, reviewing pixel noise, and calculating compositional value.
                      </p>
                    </div>
                  </div>
                )}

                {selectedItem.status === 'idle' && (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-4">
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl">
                      <Sparkles className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-xs italic text-slate-400">Compliance review has not been executed yet.</p>
                    <button
                      onClick={() => runReviewForItem(selectedItem.id)}
                      disabled={rateLimitSecondsLeft > 0}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {rateLimitSecondsLeft > 0 ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cooldown ({rateLimitSecondsLeft}s)
                        </>
                      ) : (
                        "Begin Compliance Audit"
                      )}
                    </button>
                  </div>
                )}

                {selectedItem.status === 'error' && (
                  <div className="bg-rose-950/40 border border-rose-900/50 p-5 rounded-2xl text-rose-200 space-y-4 shadow-lg backdrop-blur-sm">
                    <div className="flex items-center gap-2.5 text-rose-300">
                      <XCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
                      <span className="font-extrabold text-sm tracking-wide">Analysis Engine Failure</span>
                    </div>
                    <p className="text-xs leading-relaxed text-rose-200/80">{selectedItem.error_message || "An error occurred during Gemini image analysis."}</p>
                    <button
                      onClick={() => runReviewForItem(selectedItem.id)}
                      disabled={rateLimitSecondsLeft > 0}
                      className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-black px-4.5 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {rateLimitSecondsLeft > 0 ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Wait {rateLimitSecondsLeft}s
                        </>
                      ) : (
                        "Retry Audit"
                      )}
                    </button>
                  </div>
                )}

                {selectedItem.status === 'success' && selectedItem.result && (
                  <div className="space-y-6">
                    
                    {/* Scores Bento */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      
                      {/* Metric 1 */}
                      <div className="border border-slate-850 rounded-2xl p-4.5 flex items-center justify-between shadow-sm bg-slate-950/40 backdrop-blur-xs">
                        <div className="space-y-1.5">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Technical score</span>
                          <span className="text-2xl font-black text-white block">{selectedItem.result.technical_score}<span className="text-xs text-slate-500 font-normal">/100</span></span>
                          <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Focus & compression halos</span>
                        </div>
                        <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center font-black text-xs tracking-wider ${
                          selectedItem.result.technical_score >= 74
                            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                            : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                        }`}>
                          {selectedItem.result.technical_score >= 74 ? "PASS" : "FAIL"}
                        </div>
                      </div>

                      {/* Metric 2 */}
                      <div className="border border-slate-850 rounded-2xl p-4.5 flex items-center justify-between shadow-sm bg-slate-950/40 backdrop-blur-xs">
                        <div className="space-y-1.5">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Commercial value</span>
                          <span className="text-2xl font-black text-white block">{selectedItem.result.stock_suitability_score}<span className="text-xs text-slate-500 font-normal">/100</span></span>
                          <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Composition & demand</span>
                        </div>
                        <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center font-black text-xs tracking-wider ${
                          selectedItem.result.stock_suitability_score >= 74
                            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                            : selectedItem.result.stock_suitability_score >= 60
                            ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                            : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                        }`}>
                          {selectedItem.result.stock_suitability_score >= 74 ? "HIGH" : selectedItem.result.stock_suitability_score >= 60 ? "MID" : "LOW"}
                        </div>
                      </div>

                      {/* Metric 3: Decision */}
                      <div className={`rounded-2xl p-4.5 border flex flex-col justify-between shadow-sm ${
                        selectedItem.result.technical_score >= 74 
                          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' 
                          : 'border-rose-500/20 bg-rose-500/5 text-rose-300'
                      }`}>
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-widest block opacity-70">AUDIT VERDICT</span>
                          <span className="text-base font-black block mt-1.5">
                            {selectedItem.result.technical_score >= 74 ? "APPROVED FOR SUBMISSION" : "COMPLIANCE REJECTION"}
                          </span>
                        </div>
                        <span className="text-[10px] opacity-80 leading-relaxed block mt-2 font-medium">
                          {selectedItem.result.technical_score >= 74 
                            ? "Asset passes technical validation parameters comfortably." 
                            : `Technical execution (${selectedItem.result.technical_score}/100) failed compliance threshold.`}
                        </span>
                      </div>
                    </div>

                    {/* Rejection reasons */}
                    {selectedItem.result.rejection_reasons.length > 0 && (
                      <div className="bg-rose-950/40 border border-rose-900/60 rounded-2xl p-5 space-y-2.5">
                        <div className="flex items-center gap-2 text-rose-300 font-black text-xs tracking-wider">
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                          COMPLIANCE REJECTION TRIGGERS
                        </div>
                        <ul className="list-disc list-inside text-[11px] text-rose-200/85 space-y-1.5 pl-1 font-semibold leading-relaxed">
                          {selectedItem.result.rejection_reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Quality Flags Matrix */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider">Agency Compliance Warnings</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {Object.entries(selectedItem.result.flags).map(([flagKey, value]) => {
                          const label = flagKey
                            .replace("has_", "")
                            .replace(/_/g, " ")
                            .replace("or ", "/ ");
                          return (
                            <div 
                              key={flagKey} 
                              className={`p-3 rounded-xl border text-[11px] flex items-center justify-between font-bold transition-all ${
                                value 
                                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' 
                                  : 'border-slate-850 bg-slate-950/20 text-slate-400'
                              }`}
                            >
                              <span className="capitalize">{label}</span>
                              {value ? (
                                <span className="bg-rose-500/15 border border-rose-500/20 text-rose-300 font-black px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider">FLAGGED</span>
                              ) : (
                                <span className="text-emerald-400 font-black text-[9px] tracking-wider uppercase">✔ CLEAR</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Detailed Accordions */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider">Deep Category Analytics</h4>
                      
                      <div className="space-y-3">
                        
                        {/* Anatomy & Face */}
                        <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-5 space-y-3.5">
                          <h5 className="text-xs font-black text-slate-200 uppercase tracking-wide">Anatomy & Facial Coherency</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Anatomic Distortion Scan</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.anatomy_and_limbs}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Coherence & Asymmetry</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.face_coherence}</p>
                            </div>
                          </div>
                        </div>

                        {/* Technical Quality & Lighting */}
                        <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-5 space-y-3.5">
                          <h5 className="text-xs font-black text-slate-200 uppercase tracking-wide">Technical Execution & Exposure</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Sharpness & Grain Density</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.technical_quality}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Lighting & Chromatic Halos</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.lighting_and_reflections}</p>
                            </div>
                          </div>
                        </div>

                        {/* IP Risk & Branding */}
                        <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-5 space-y-3.5">
                          <h5 className="text-xs font-black text-slate-200 uppercase tracking-wide">Intellectual Property & Tracing</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Trademarks & Logo Audits</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.ip_risk}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Text & Watermark Sweeps</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.text_and_watermarks}</p>
                            </div>
                          </div>
                        </div>

                        {/* Composition & Concept Match */}
                        <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-5 space-y-3.5">
                          <h5 className="text-xs font-black text-slate-200 uppercase tracking-wide">Composition & Copy Space</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Aesthetic Balance & Framing</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.stock_usability}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-black text-indigo-400 block uppercase tracking-widest">Prompt Fidelity Check</span>
                              <p className="font-semibold">{selectedItem.result.detailed_analysis.concept_match || "No target concept mapped to analyze."}</p>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                )}

              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
