import React, { useState } from 'react';
import { Search, Loader2, BarChart3, X, ExternalLink } from 'lucide-react';
import { trackAsset } from '../services/openaiService';

interface AssetTrackerProps {
  isOpen: boolean;
  onClose: () => void;
}

const AssetTracker: React.FC<AssetTrackerProps> = ({ isOpen, onClose }) => {
  const [url, setUrl] = useState("");
  const [data,XH] = useState<{ downloads: number | null; views: number | null; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTrack = async () => {
    if (!url.trim()) return;
    setIsLoading(true);
    setError(null);
    setData(null);
    
    try {
      const result = await trackAsset("", url);
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to track asset");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
        
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-orange-500/20 rounded-lg">
                <BarChart3 className="w-6 h-6 text-orange-400" />
             </div>
             <div>
                <h2 className="text-lg font-bold text-white">Competitor Spy</h2>
                <p className="text-xs text-slate-400">Track hidden metrics from Adobe Stock</p>
             </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
           <div className="flex gap-2">
              <input 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste Adobe Stock Image URL..."
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none text-sm"
              />
              <button 
                onClick={handleTrack} 
                disabled={isLoading || !url}
                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Track
              </button>
           </div>

           {error && (
             <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
               {error}
             </div>
           )}

           {data && (
             <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-2">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-center">
                   <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Downloads</p>
                   <p className="text-3xl font-black text-white">
                      {data.downloads !== null ? data.downloads.toLocaleString() : "N/A"}
                   </p>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-center">
                   <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Views</p>
                   <p className="text-3xl font-black text-slate-300">
                      {data.views !== null ? data.views.toLocaleString() : "N/A"}
                   </p>
                </div>
                <div className="col-span-2 text-center text-xs text-slate-500">
                   {data.message}
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default AssetTracker;