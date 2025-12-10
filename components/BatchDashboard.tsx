import React from 'react';
import { Layers, XCircle, Play, Square, X, Trash2, FileText, Download } from 'lucide-react';

interface BatchDashboardProps {
  stats: { total: number; processed: number; failed: number };
  isBatchRunning: boolean;
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onDelete: (ids: string[]) => void;
  batchNegativePrompt: string;
  onUpdateNegativePrompt: (val: string) => void;
  keywordStyle: 'Mixed' | 'Single' | 'Phrases';
  onUpdateKeywordStyle: (val: 'Mixed' | 'Single' | 'Phrases') => void;
  onStart: () => void;
  onStop: () => void;
  canProcess: boolean;
  hasProcessedFiles: boolean;
  onExportCSV: () => void;
  onExportZip: () => void;
}

const BatchDashboard: React.FC<BatchDashboardProps> = ({
  stats,
  isBatchRunning,
  selectedIds,
  onClearSelection,
  onDelete,
  batchNegativePrompt,
  onUpdateNegativePrompt,
  keywordStyle,
  onUpdateKeywordStyle,
  onStart,
  onStop,
  canProcess,
  hasProcessedFiles,
  onExportCSV,
  onExportZip
}) => {
  const handleDeleteClick = () => {
    if (selectedIds.size === 0) return;
    
    // UI Logic: Confirmation handled here in the child (view layer)
    if (window.confirm(`Permanently remove ${selectedIds.size} selected files?`)) {
        // Action: Call parent handler to modify data
        onDelete(Array.from(selectedIds));
        // Cleanup: Clear local selection state (via prop)
        onClearSelection();
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-6 shadow-xl animate-in slide-in-from-top-3 backdrop-blur-sm">
         <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
            
            {/* Left Group: Title & Metrics */}
            <div className="flex items-center gap-6 w-full xl:w-auto justify-between xl:justify-start border-b xl:border-b-0 border-slate-700/50 pb-2 xl:pb-0">
                <h2 className="text-lg font-bold text-white flex items-center gap-2 shrink-0">
                    <Layers className="w-5 h-5 text-purple-400" /> Batch Dashboard
                </h2>
                
                <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                     <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 uppercase tracking-wider hidden sm:inline">Files:</span>
                        <span className="text-white font-bold">{stats.total}</span>
                     </div>
                     <div className="h-4 w-px bg-slate-700 hidden sm:block"></div>
                     <div className={`font-bold flex items-center gap-2 ${isBatchRunning ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`}>
                        {isBatchRunning ? (
                            <>Processing {stats.processed + stats.failed}/{stats.total}</>
                        ) : (
                            <>Idle</>
                        )}
                     </div>
                     <div className="flex items-center gap-2 bg-slate-900/50 px-2 py-1 rounded border border-slate-700/50">
                        <span className="text-emerald-400 font-bold flex items-center gap-1">✓ {stats.processed}</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-red-400 font-bold flex items-center gap-1">✕ {stats.failed}</span>
                     </div>
                </div>
            </div>

            {/* Center Group: Settings (Negatives + Style) */}
            <div className="flex-1 w-full xl:w-auto flex flex-col md:flex-row items-center gap-4">
                 {/* Global Negative Keywords */}
                 <div className="relative group w-full flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                         <XCircle className="w-4 h-4 text-slate-500 group-focus-within:text-red-400 transition-colors" />
                    </div>
                    <input 
                         className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:border-red-500 outline-none placeholder:text-slate-600 transition-all shadow-inner"
                         placeholder="Global Negative Keywords (e.g. text, blurry)"
                         value={batchNegativePrompt}
                         onChange={(e) => onUpdateNegativePrompt(e.target.value)}
                    />
                 </div>
                 
                 {/* Keyword Style */}
                 <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-600 w-full md:w-auto shrink-0">
                     {(['Mixed', 'Single', 'Phrases'] as const).map((style) => (
                         <button 
                           key={style} 
                           onClick={() => onUpdateKeywordStyle(style)} 
                           className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${keywordStyle === style ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                         >
                           {style}
                         </button>
                     ))}
                 </div>
            </div>

            {/* Right Group: Action Buttons */}
            <div className="flex items-center gap-2 w-full xl:w-auto justify-end flex-wrap sm:flex-nowrap">
                 {/* Start/Stop Toggle */}
                 {!isBatchRunning ? (
                     <button 
                         onClick={onStart}
                         disabled={!canProcess}
                         className="flex-1 xl:flex-none bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:bg-slate-700 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all whitespace-nowrap"
                     >
                         <Play className="w-4 h-4 fill-current" /> <span className="hidden sm:inline">Start Batch</span>
                     </button>
                 ) : (
                     <button 
                         onClick={onStop}
                         className="flex-1 xl:flex-none bg-red-600 hover:bg-red-500 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 transition-all animate-pulse whitespace-nowrap"
                     >
                         <Square className="w-4 h-4 fill-current" /> <span className="hidden sm:inline">Stop</span>
                     </button>
                 )}

                 <div className="h-8 w-px bg-slate-700 mx-1 hidden xl:block"></div>

                 {/* Clear Selection & Delete */}
                 {selectedIds.size > 0 && (
                     <>
                         <button
                             onClick={onClearSelection}
                             className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg flex items-center justify-center gap-2 transition-all text-xs font-bold uppercase"
                             title="Clear Selection"
                         >
                             <X className="w-4 h-4" /> Clear
                         </button>
                         <button
                             onClick={handleDeleteClick}
                             className="px-3 py-2 bg-red-900/30 hover:bg-red-600 border border-red-800/50 hover:border-red-500 text-red-300 hover:text-white rounded-lg flex items-center justify-center gap-2 transition-all text-xs font-bold uppercase"
                             title="Delete Selected"
                         >
                             <Trash2 className="w-4 h-4" /> Delete
                         </button>
                     </>
                 )}

                 {/* Export Tools */}
                 <button 
                    onClick={onExportCSV}
                    disabled={!hasProcessedFiles}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-lg flex items-center gap-2 text-xs font-bold uppercase transition-all disabled:opacity-50"
                >
                    <FileText className="w-4 h-4" /> CSV
                </button>
                
                <button 
                    onClick={onExportZip}
                    disabled={!hasProcessedFiles}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 text-xs font-bold uppercase transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
                >
                    <Download className="w-4 h-4" /> Zip
                </button>
            </div>

         </div>
    </div>
  );
};

export default BatchDashboard;