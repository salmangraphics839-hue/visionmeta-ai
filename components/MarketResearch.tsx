import React, { useState } from 'react';
import { Search, Loader2, Globe, ArrowRight } from 'lucide-react';
import { getMarketResearch } from '../services/openaiService';
import { MarketTrend } from '../types';

interface MarketResearchProps {
  apiKey: string; // Deprecated
  isOpen: boolean;
  onClose: () => void;
}

const MarketResearch: React.FC<MarketResearchProps> = ({ apiKey, isOpen, onClose }) => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MarketTrend | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const data = await getMarketResearch("", query);
      setResult(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Globe className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Market Research</h2>
                    <p className="text-xs text-slate-400">Powered by Vision Engine</p>
                </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white px-3 py-1 bg-slate-700 rounded-lg text-xs">Close</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
            <div className="flex gap-2 mb-6">
                <input 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Enter a topic (e.g. 'Authentic office culture', 'Drone photography trends')"
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-emerald-500 outline-none"
                />
                <button 
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-2"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    Research
                </button>
            </div>

            {result && (
                <div className="space-y-6 animate-in slide-in-from-bottom-2">
                    <div className="prose prose-invert prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-slate-300 leading-relaxed">
                            {result.content}
                        </div>
                    </div>
                </div>
            )}

            {!result && !isLoading && (
                <div className="text-center py-20 text-slate-500">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Search for any niche to get AI market insights.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default MarketResearch;