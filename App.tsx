import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { Download, Play, Trash2, Image as ImageIcon, Loader2, Bookmark, ChevronDown, Check, FileText, Search, X, AlertTriangle, Globe, XCircle, Tag, Grid, List, Edit, ArrowLeft, Square, CheckSquare, Video, LogOut, User, Lock, Mail, Settings, BarChart3 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { User as SupabaseUser } from '@supabase/supabase-js';

import Uploader from './components/Uploader';
import MetadataCard from './components/MetadataCard';
import BatchDashboard from './components/BatchDashboard';
import ChatBot from './components/ChatBot';
import MarketResearch from './components/MarketResearch';
import AssetTracker from './components/AssetTracker';
import { StockFile, FileStatus, StockMetadata, MetadataPreset } from './types';
import { generateImageMetadata } from './services/openaiService';
import { embedMetadata, fileToBase64, getPreviewUrl } from './services/imageService';

const App: React.FC = () => {
  // --- AUTH & USER STATE ---
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // App Modes
  const [viewMode, setViewMode] = useState<'single' | 'batch'>('single');

  // Data State
  const [files, setFiles] = useState<StockFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  
  // Processing State
  const [processQueue, setProcessQueue] = useState<string[]>([]);
  const [activeCount, setActiveCount] = useState(0); 
  const MAX_CONCURRENCY = 10;
  
  // Edit Modal State
  const [editingFileId, setEditingFileId] = useState<string | null>(null);

  // Features
  const [showMarketResearch, setShowMarketResearch] = useState(false);
  const [showAssetTracker, setShowAssetTracker] = useState(false);

  // Generation Settings
  const [showGenSettings, setShowGenSettings] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState(""); 
  const [batchNegativePrompt, setBatchNegativePrompt] = useState(""); 
  
  // Keyword style settings
  const [keywordStyle, setKeywordStyle] = useState<'Mixed' | 'Single' | 'Phrases'>('Single');

  // Preset Management
  const [presets, setPresets] = useState<MetadataPreset[]>(() => {
    const saved = localStorage.getItem('stock_presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  // Refs
  const viewModeRef = useRef(viewMode);
  const negativePromptRef = useRef(negativePrompt);
  const batchNegativePromptRef = useRef(batchNegativePrompt);

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { negativePromptRef.current = negativePrompt; }, [negativePrompt]);
  useEffect(() => { batchNegativePromptRef.current = batchNegativePrompt; }, [batchNegativePrompt]);

  // --- SUPABASE AUTH & CREDIT LOGIC ---

  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchCredits(session.user.id);
      setAuthLoading(false);
    });

    // 2. Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchCredits(session.user.id);
      else setCredits(null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchCredits = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();
    
    if (data) {
      setCredits(data.credits);
    } else if (error) {
      console.error('Error fetching credits:', error);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Auto-login logic usually handled by Supabase, or show "Check email"
        if (!error) alert("Account created! You can now log in.");
        setAuthMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setFiles([]); // Clear sensitive data on logout
  };

  // --- APP LOGIC ---

  // Queue Processor
  useEffect(() => {
    if (processQueue.length > 0 && activeCount < MAX_CONCURRENCY) {
      const nextId = processQueue[0];
      setProcessQueue(prev => prev.slice(1)); 
      processImage(nextId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processQueue, activeCount]);

  // Persist Presets
  useEffect(() => {
    localStorage.setItem('stock_presets', JSON.stringify(presets));
  }, [presets]);

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const handleFilesSelected = (newFiles: File[]) => {
    const primaryFiles: File[] = [];
    const vectorFiles: Map<string, File> = new Map();

    newFiles.forEach(f => {
      const lowerName = f.name.toLowerCase();
      const type = f.type.toLowerCase();

      if (type.startsWith('image/') || type.startsWith('video/') || 
          lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') ||
          lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.webm') || lowerName.endsWith('.avi')) {
        primaryFiles.push(f);
      } else if (lowerName.endsWith('.eps') || lowerName.endsWith('.svg')) {
        const basename = f.name.substring(0, f.name.lastIndexOf('.'));
        vectorFiles.set(basename, f);
      }
    });

    const newStockFiles: StockFile[] = primaryFiles.map(file => {
      const basename = file.name.substring(0, file.name.lastIndexOf('.'));
      const pairedVector = vectorFiles.get(basename);
      
      return {
        id: generateId(),
        file: file,
        previewUrl: getPreviewUrl(file),
        status: FileStatus.IDLE,
        vectorFile: pairedVector
      };
    });

    if (newStockFiles.length === 0) return;

    if (viewMode === 'single') {
        setFiles([newStockFiles[0]]);
        setSelectedIds(new Set());
        setProcessQueue([]); 
    } else {
        setFiles(prev => [...prev, ...newStockFiles]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === files.length && files.length > 0) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(files.map(f => f.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const startProcessing = () => {
    // Check credits before queuing (Client-side check for better UX)
    if (credits !== null && credits <= 0) {
      alert("Insufficient credits. Please contact admin.");
      return;
    }

    let idsToProcess: string[] = [];
    if (selectedIds.size > 0) {
        idsToProcess = files
            .filter(f => selectedIds.has(f.id))
            .filter(f => f.status !== FileStatus.PROCESSING && f.status !== FileStatus.SUCCESS)
            .map(f => f.id);
    } else {
        idsToProcess = files
            .filter(f => f.status === FileStatus.IDLE || f.status === FileStatus.ERROR)
            .map(f => f.id);
    }
    
    setProcessQueue(prev => {
        const unique = new Set([...prev, ...idsToProcess]);
        return Array.from(unique);
    });
  };

  const stopProcessing = () => {
    setProcessQueue([]); 
  };

  const processImage = async (id: string) => {
    setActiveCount(prev => prev + 1);
    
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: FileStatus.PROCESSING } : f));

    const targetFile = files.find(f => f.id === id);
    if (!targetFile) {
        setActiveCount(prev => prev - 1);
        return;
    }

    try {
      const activeNegativePrompt = viewModeRef.current === 'batch' 
          ? batchNegativePromptRef.current 
          : negativePromptRef.current;

      const base64 = await fileToBase64(targetFile.file);
      
      // 1. Call Secure Edge Function
      const metadata = await generateImageMetadata("", base64, targetFile.file.type, activeNegativePrompt, keywordStyle);

      // 2. Refresh credits from DB since server deducted them
      if (user) fetchCredits(user.id);

      // 3. Embed Metadata
      let processedBlob: Blob | undefined;
      try {
         processedBlob = await embedMetadata(targetFile.file, metadata);
      } catch (embedError) {
         console.warn("Embedding failed, proceeding with original file.", embedError);
         processedBlob = targetFile.file; 
      }

      setFiles(prev => prev.map(f => f.id === id ? { 
        ...f, 
        status: FileStatus.SUCCESS, 
        metadata,
        processedFile: processedBlob
      } : f));

    } catch (error: any) {
      
      // ALERT USER IF CREDITS ARE OUT
      if (error.message.toLowerCase().includes('insufficient credits') || error.message.toLowerCase().includes('payment required')) {
          alert("🚫 Insufficient Credits!\n\nPlease contact the administrator to top up your account.");
          // Stop further processing if in batch mode
          setProcessQueue([]); 
      }

      setFiles(prev => prev.map(f => f.id === id ? { 
        ...f, 
        status: FileStatus.ERROR, 
        error: error.message || "Unknown error" 
      } : f));
    } finally {
      setActiveCount(prev => prev - 1);
    }
  };

  const handleUpdateMetadata = (id: string, metadata: StockMetadata) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const updateFile = async () => {
          try {
              const newBlob = await embedMetadata(f.file, metadata);
              f.processedFile = newBlob; 
          } catch (e) {
              console.warn("Failed to re-embed on edit", e);
          }
      };
      updateFile();
      return { ...f, metadata };
    }));
  };

  const handleUpdateReport = (id: string, report: string) => {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, strategyReport: report } : f));
  };
  
  const handleUpdatePrompt = (id: string, prompt: string) => {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, generatedPrompt: prompt } : f));
  };

  const savePreset = (metadata: StockMetadata) => {
    const name = prompt("Enter a name for this preset (e.g., 'Corporate Office'):");
    if (name) {
      const newPreset: MetadataPreset = {
        id: generateId(),
        name,
        metadata
      };
      setPresets(prev => [...prev, newPreset]);
    }
  };

  const applyPreset = (preset: MetadataPreset) => {
    const targetCount = selectedIds.size > 0 ? selectedIds.size : files.length;
    const targetDesc = selectedIds.size > 0 ? "SELECTED" : "ALL";

    if (confirm(`Apply preset "${preset.name}" to ${targetDesc} (${targetCount}) items? This will overwrite existing metadata.`)) {
        setFiles(prev => prev.map(f => {
            if (selectedIds.size > 0 && !selectedIds.has(f.id)) return f;
            const newMeta = { ...preset.metadata };
            embedMetadata(f.file, newMeta).then(blob => { f.processedFile = blob; });
            return { ...f, status: FileStatus.SUCCESS, metadata: newMeta };
        }));
        setShowPresetMenu(false);
    }
  };

  const deletePreset = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  const handleApplyToAll = (metadata: StockMetadata) => {
    const targetCount = selectedIds.size > 0 ? selectedIds.size : files.length;
    const targetDesc = selectedIds.size > 0 ? "SELECTED" : "ALL";

    if (confirm(`Copy this metadata to ${targetDesc} (${targetCount}) items?`)) {
        setFiles(prev => prev.map(f => {
            if (selectedIds.size > 0 && !selectedIds.has(f.id)) return f;
            const newMeta = { ...metadata };
            embedMetadata(f.file, newMeta).then(blob => { f.processedFile = blob; });
            return { ...f, status: FileStatus.SUCCESS, metadata: newMeta };
        }));
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setProcessQueue(prev => prev.filter(pid => pid !== id));
    setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
    });
  };

  const handleDeleteBatch = (idsToDelete: string[]) => {
      setFiles(prevFiles => prevFiles.filter(file => !idsToDelete.includes(file.id)));
      setProcessQueue(prevQueue => prevQueue.filter(pid => !idsToDelete.includes(pid)));
  };

  const clearAll = () => {
    setFiles([]);
    setProcessQueue([]);
    setSelectedIds(new Set());
    setSearchQuery("");
  };

  const handleViewModeChange = (mode: 'single' | 'batch') => {
      setViewMode(mode);
      if (mode === 'single' && files.length > 1) {
          setFiles([files[0]]);
          setSelectedIds(new Set());
          setProcessQueue([]); 
      }
  };

  // --- EXPORT & HELPER FUNCTIONS ---
  const getExportableFiles = () => {
    const candidateFiles = selectedIds.size > 0 
        ? files.filter(f => selectedIds.has(f.id)) 
        : files;
    return candidateFiles.filter(f => f.status === FileStatus.SUCCESS && f.metadata);
  };

  const downloadResults = async () => {
    const exportFiles = getExportableFiles();
    if (exportFiles.length === 0) return;

    const zip = new JSZip();
    for (const f of exportFiles) {
      if (!f.metadata) continue;
      try {
          const processedBlob = await embedMetadata(f.file, f.metadata);
          zip.file(f.file.name, processedBlob);
      } catch (e) {
          console.error("Failed to embed metadata for", f.file.name, e);
          zip.file(f.file.name, f.file); 
      }
      if (f.vectorFile) {
        try {
            const processedVector = await embedMetadata(f.vectorFile, f.metadata);
            zip.file(f.vectorFile.name, processedVector);
        } catch (e) {
            console.error("Failed to embed metadata for vector", f.vectorFile.name, e);
            zip.file(f.vectorFile.name, f.vectorFile);
        }
      }
    }
    const content = await zip.generateAsync({ type: "blob" });
    const fileName = selectedIds.size > 0 ? "selected_assets.zip" : "processed_assets.zip";
    (FileSaver.saveAs || FileSaver)(content, fileName);
  };

  const downloadCSV = async () => {
    const exportFiles = getExportableFiles();
    if (exportFiles.length === 0) return;

    const zip = new JSZip();
    const escape = (text: string) => `"${text.replace(/"/g, '""')}"`;

    const adobeRows = [['Filename', 'Title', 'Keywords', 'Category']];
    exportFiles.forEach(f => {
      if (!f.metadata) return;
      adobeRows.push([f.file.name, escape(f.metadata.title), escape(f.metadata.keywords.join(', ')), ""]);
    });
    zip.file("adobe_stock.csv", adobeRows.map(e => e.join(",")).join("\n"));

    const ssRows = [['Filename', 'Description', 'Keywords', 'Categories']];
    exportFiles.forEach(f => {
      if (!f.metadata) return;
      ssRows.push([f.file.name, escape(f.metadata.description), escape(f.metadata.keywords.join(', ')), ""]);
    });
    zip.file("shutterstock.csv", ssRows.map(e => e.join(",")).join("\n"));

    const dtRows = [['Filename', 'Title', 'Description', 'Keywords']];
    exportFiles.forEach(f => {
      if (!f.metadata) return;
      dtRows.push([f.file.name, escape(f.metadata.title), escape(f.metadata.description), escape(f.metadata.keywords.join(', '))]);
    });
    zip.file("dreamstime.csv", dtRows.map(e => e.join(",")).join("\n"));

    const rfRows = [['Filename', 'Title', 'Description', 'Keywords']];
    exportFiles.forEach(f => {
      if (!f.metadata) return;
      rfRows.push([f.file.name, escape(f.metadata.title), escape(f.metadata.description), escape(f.metadata.keywords.join(', '))]);
    });
    zip.file("123rf.csv", rfRows.map(e => e.join(",")).join("\n"));

    const content = await zip.generateAsync({ type: "blob" });
    const fileName = selectedIds.size > 0 ? "platform_csv_bundle.zip" : "all_platforms_csv.zip";
    (FileSaver.saveAs || FileSaver)(content, fileName);
  };

  const filteredFiles = files.filter(file => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    if (!file.metadata) return false;
    return file.metadata.keywords.some(k => k.toLowerCase().includes(query));
  });

  const stats = {
    total: files.length,
    processed: files.filter(f => f.status === FileStatus.SUCCESS).length,
    failed: files.filter(f => f.status === FileStatus.ERROR).length,
    pending: files.filter(f => f.status === FileStatus.IDLE || f.status === FileStatus.PROCESSING).length
  };

  const processableInSelection = files.filter(f => selectedIds.has(f.id) && f.status !== FileStatus.PROCESSING).length;
  const isSelectionMode = selectedIds.size > 0;
  const canProcess = isSelectionMode ? processableInSelection > 0 : stats.pending > 0;
  
  const processBtnText = activeCount > 0
    ? `Processing (${activeCount})...` 
    : isSelectionMode 
        ? `Generate for Selected (${processableInSelection})` 
        : `Generate Metadata (${stats.pending})`;

  const progressPercentage = stats.total === 0 ? 0 : (stats.processed / stats.total) * 100;
  const exportableCount = getExportableFiles().length;
  const isBatchRunning = activeCount > 0 || processQueue.length > 0;
  const hasProcessedFiles = files.some(f => f.status === FileStatus.SUCCESS);

  // --- RENDER LOGIN IF NO USER ---
  if (authLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-cyan-500"/></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2"></div>

        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl relative z-10 animate-in fade-in zoom-in-95">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20 mx-auto mb-4">
              <ImageIcon className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">VisionMeta AI</h1>
            <p className="text-slate-400 text-sm">Automated Metadata for Stock Media</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-5 h-5 text-slate-500" />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-cyan-500 outline-none"
                  placeholder="name@example.com"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-5 h-5 text-slate-500" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-cyan-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-center gap-2 text-xs text-red-400">
                <AlertTriangle className="w-4 h-4" /> {authError}
              </div>
            )}

            <button 
              type="submit" 
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(null); }}
              className="text-sm text-slate-400 hover:text-cyan-400 transition-colors"
            >
              {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN RENDER ---
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 pb-20 relative">
      <ChatBot apiKey="" />
      <MarketResearch apiKey="" isOpen={showMarketResearch} onClose={() => setShowMarketResearch(false)} />
      <AssetTracker isOpen={showAssetTracker} onClose={() => setShowAssetTracker(false)} />
      
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ImageIcon className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
                VisionMeta AI
              </h1>
            </div>
          </div>

          {/* MODE SWITCHER */}
          <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 hidden sm:flex">
              <button 
                  onClick={() => handleViewModeChange('single')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'single' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                  <List className="w-3.5 h-3.5" /> Single
              </button>
              <button 
                  onClick={() => handleViewModeChange('batch')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'batch' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                  <Grid className="w-3.5 h-3.5" /> Batch
              </button>
          </div>
          
          <div className="flex items-center gap-4">
             <button
               onClick={() => setShowMarketResearch(true)}
               className="hidden md:flex text-xs text-slate-300 hover:text-white items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-slate-800 transition-colors border border-slate-700 hover:border-emerald-500"
             >
                <Globe className="w-3.5 h-3.5 text-emerald-400" /> Trends
             </button>

             <button
               onClick={() => setShowAssetTracker(true)}
               className="hidden md:flex text-xs text-slate-300 hover:text-white items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-slate-800 transition-colors border border-slate-700 hover:border-orange-500"
             >
                <BarChart3 className="w-3.5 h-3.5 text-orange-400" /> Spy
             </button>

             {/* USER PROFILE & CREDITS */}
             <div className="flex items-center gap-3 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-300 truncate max-w-[100px] hidden md:inline">{user.email}</span>
                </div>
                <div className="h-4 w-px bg-slate-600"></div>
                <div className="flex items-center gap-1.5">
                   <span className={`text-xs font-bold ${credits !== null && credits > 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                     {credits ?? '...'}
                   </span>
                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Credits</span>
                </div>
             </div>

             <button 
               onClick={handleLogout}
               title="Sign Out"
               className="text-slate-400 hover:text-red-400 p-2 rounded-full hover:bg-slate-800 transition-colors"
             >
               <LogOut className="w-4 h-4" />
             </button>
          </div>
        </div>
        
        {files.length > 0 && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-800">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* BATCH MODE TOOLBAR */}
        {viewMode === 'batch' && (
            <>
                <div className="mb-6 animate-in slide-in-from-top-2">
                    <Uploader onFilesSelected={handleFilesSelected} compact={true} />
                </div>
                <BatchDashboard
                    stats={stats}
                    isBatchRunning={isBatchRunning}
                    selectedIds={selectedIds}
                    onClearSelection={handleClearSelection}
                    onDelete={handleDeleteBatch}
                    batchNegativePrompt={batchNegativePrompt}
                    onUpdateNegativePrompt={setBatchNegativePrompt}
                    keywordStyle={keywordStyle}
                    onUpdateKeywordStyle={setKeywordStyle}
                    onStart={startProcessing}
                    onStop={stopProcessing}
                    canProcess={canProcess}
                    hasProcessedFiles={hasProcessedFiles}
                    onExportCSV={downloadCSV}
                    onExportZip={downloadResults}
                />
            </>
        )}

        {/* SINGLE UPLOAD VIEW */}
        {viewMode === 'single' && (
            <>
                <div className="mb-8">
                    <Uploader onFilesSelected={handleFilesSelected} />
                </div>
                {files.length > 0 && (
                  <div className="sticky top-20 z-40 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-4 mb-8 flex flex-col gap-4 shadow-2xl animate-in slide-in-from-top-4 duration-500">
                    <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-6 text-sm font-medium w-full xl:w-auto justify-between xl:justify-start">
                           <div className="flex items-center gap-2 border-r border-slate-700 pr-6 mr-2">
                              <button 
                                  onClick={handleSelectAll}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded transition-all ${selectedIds.size > 0 && selectedIds.size === files.length ? 'text-cyan-400 bg-cyan-900/20' : 'text-slate-400 hover:text-white'}`}
                              >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedIds.size > 0 ? 'bg-cyan-500 border-cyan-500' : 'border-slate-500'}`}>
                                      {selectedIds.size > 0 && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <span className="text-xs uppercase tracking-wider font-bold">
                                      {selectedIds.size === 0 ? 'Select All' : `${selectedIds.size} Selected`}
                                  </span>
                              </button>
                           </div>
                           <div className="flex flex-col">
                            <span className="text-xs text-slate-500 uppercase tracking-wider">Total</span>
                            <span className="text-white text-lg leading-none">{stats.total}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-500 uppercase tracking-wider">Done</span>
                            <span className="text-emerald-400 text-lg leading-none">{stats.processed}</span>
                          </div>
                      </div>

                      <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 w-full xl:w-auto overflow-x-auto pb-1 xl:pb-0 justify-start xl:justify-end">
                          <div className="relative group mr-2">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                            </div>
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Filter..."
                              className="bg-slate-900/50 border border-slate-600 rounded-lg pl-9 pr-8 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 w-full md:w-32 transition-all"
                            />
                            {searchQuery && (
                              <button onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-500 hover:text-white"><X className="h-3 w-3" /></button>
                            )}
                          </div>
                          
                          <button onClick={() => setShowGenSettings(!showGenSettings)} className={`p-2.5 rounded-lg border ${showGenSettings ? 'bg-cyan-900/20 border-cyan-500 text-cyan-400' : 'bg-transparent border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700'} transition-all`}>
                            <Settings className="w-5 h-5" />
                          </button>

                          <div className="relative">
                              <button onClick={() => setShowPresetMenu(!showPresetMenu)} className="px-4 py-2.5 rounded-lg border border-slate-600 hover:bg-slate-700 text-slate-300 text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all">
                                  <Bookmark className="w-4 h-4 text-purple-400" /> Presets <ChevronDown className="w-3 h-3" />
                              </button>
                              {showPresetMenu && (
                                  <div className="absolute top-full right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                      <div className="p-2 border-b border-slate-700 text-xs text-slate-500 uppercase font-bold tracking-wider">Saved Templates</div>
                                      {presets.length === 0 ? (
                                          <div className="p-4 text-center text-sm text-slate-500">No presets yet.</div>
                                      ) : (
                                          <div className="max-h-60 overflow-y-auto">
                                              {presets.map(p => (
                                                  <div key={p.id} className="flex items-center justify-between p-2 hover:bg-slate-700 transition-colors group">
                                                      <button onClick={() => applyPreset(p)} className="flex-1 text-left text-sm text-slate-300 hover:text-white truncate pr-2">{p.name}</button>
                                                      <button onClick={(e) => deletePreset(e, p.id)} className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>

                          <div className="h-8 w-px bg-slate-700 mx-2 hidden md:block"></div>

                          <button onClick={clearAll} disabled={activeCount > 0} className="p-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/50 disabled:opacity-50 transition-colors">
                              <Trash2 className="w-5 h-5" />
                          </button>
                          
                          <button 
                              onClick={startProcessing}
                              disabled={activeCount > 0 || !canProcess}
                              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all whitespace-nowrap ${activeCount > 0 || !canProcess ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"}`}
                          >
                              {activeCount > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                              {processBtnText}
                          </button>
                          
                          <button 
                            onClick={downloadCSV} 
                            disabled={exportableCount === 0} 
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all whitespace-nowrap ${exportableCount === 0 ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white border border-slate-600 hover:border-slate-500"}`}
                          >
                            <FileText className="w-4 h-4" /> CSV Only
                          </button>

                          <button onClick={downloadResults} disabled={exportableCount === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all whitespace-nowrap ${exportableCount === 0 ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"}`}>
                              <Download className="w-4 h-4" /> Export
                          </button>
                      </div>
                    </div>

                    {showGenSettings && (
                        <div className="pt-4 border-t border-slate-700 animate-in slide-in-from-top-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block flex items-center gap-2"><XCircle className="w-4 h-4 text-red-400" /> Negative Keywords</label>
                                    <textarea className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-red-500 outline-none placeholder:text-slate-600" placeholder="e.g. blurry, text..." value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={2}/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block flex items-center gap-2"><Tag className="w-4 h-4 text-cyan-400" /> Keyword Style</label>
                                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-600 h-[42px]">
                                        {(['Mixed', 'Single', 'Phrases'] as const).map((style) => (
                                            <button key={style} onClick={() => setKeywordStyle(style)} className={`flex-1 rounded text-xs font-medium transition-all ${keywordStyle === style ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>{style}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                  </div>
                )}
            </>
        )}

        {/* FILE DISPLAY: LIST OR GRID */}
        {viewMode === 'single' ? (
            <div className="flex flex-col gap-6">
                {filteredFiles.map(file => (
                    <div key={file.id} className="relative group animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <button onClick={() => removeFile(file.id)} className="absolute -right-3 -top-3 bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700 border border-slate-700 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all z-20 shadow-xl"><Trash2 className="w-4 h-4" /></button>
                        <MetadataCard 
                            item={file} 
                            isSelected={selectedIds.has(file.id)}
                            onToggleSelect={handleToggleSelect}
                            onUpdateMetadata={handleUpdateMetadata}
                            onUpdateReport={handleUpdateReport}
                            onUpdatePrompt={handleUpdatePrompt}
                            onSavePreset={savePreset}
                            onApplyToAll={handleApplyToAll}
                            onRegenerate={() => processImage(file.id)}
                            apiKey=""
                            keywordStyle={keywordStyle}
                        />
                    </div>
                ))}
            </div>
        ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredFiles.map(file => {
                    const isSelected = selectedIds.has(file.id);
                    const isVideo = file.file.type.startsWith('video/');
                    return (
                    <div 
                        key={file.id} 
                        onClick={() => handleToggleSelect(file.id)}
                        className={`bg-slate-800 rounded-lg overflow-hidden border relative group transition-all hover:shadow-xl cursor-pointer ${isSelected ? 'border-cyan-500 ring-2 ring-cyan-500/50' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                        <div className="absolute top-2 right-2 z-10">
                            {file.status === FileStatus.PROCESSING && <div className="bg-blue-500 p-1 rounded-full animate-pulse"><Loader2 className="w-3 h-3 text-white animate-spin" /></div>}
                            {file.status === FileStatus.SUCCESS && <div className="bg-emerald-500 p-1 rounded-full"><Check className="w-3 h-3 text-white" /></div>}
                            {file.status === FileStatus.ERROR && <div className="bg-red-500 p-1 rounded-full"><AlertTriangle className="w-3 h-3 text-white" /></div>}
                        </div>
                        
                        <button 
                            onClick={(e) => { e.stopPropagation(); setEditingFileId(file.id); }}
                            className="absolute bottom-2 right-2 z-20 bg-slate-900/80 hover:bg-cyan-600 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all backdrop-blur shadow-lg border border-slate-700 hover:border-cyan-500"
                            title="Deep Edit"
                        >
                            <Edit className="w-3.5 h-3.5" />
                        </button>
                        
                        <div className={`absolute top-2 left-2 z-10 p-1 rounded-md backdrop-blur transition-all ${isSelected ? 'bg-cyan-500 text-white' : 'bg-black/30 text-white/50 group-hover:bg-black/50 group-hover:text-white'}`}>
                           {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </div>

                        <div className="aspect-square bg-slate-900 relative flex items-center justify-center">
                             {isVideo ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900">
                                    <Video className="w-10 h-10 text-slate-600" />
                                    <span className="text-[10px] text-slate-500 mt-2 uppercase font-bold">Video Clip</span>
                                </div>
                             ) : (
                                <img src={file.previewUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" />
                             )}
                             
                             {file.status === FileStatus.PROCESSING && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                                    <span className="text-xs font-bold text-white tracking-widest uppercase">Processing</span>
                                </div>
                             )}
                        </div>
                        <div className="p-2.5">
                            <p className="text-xs font-medium text-slate-300 truncate" title={file.file.name}>{file.file.name}</p>
                            <div className="flex items-center justify-between mt-1">
                                <span className={`text-[10px] font-bold uppercase ${file.status === FileStatus.SUCCESS ? 'text-emerald-400' : 'text-slate-500'}`}>
                                    {file.status === FileStatus.SUCCESS ? 'Complete' : file.status}
                                </span>
                                <div className="flex gap-1">
                                    {isVideo && <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-1 rounded">VID</span>}
                                    {file.vectorFile && <span className="text-[10px] bg-slate-700 px-1 rounded text-slate-300">VEC</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                )})}
            </div>
        )}
        
        {files.length === 0 && (
             <div className="text-center text-slate-500 py-20 flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-cyan-900/20">
                  <ImageIcon className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-lg font-medium text-slate-400">No media uploaded yet</p>
                <p className="text-sm">Drag and drop images or videos above to get started</p>
             </div>
        )}
      </main>

      {/* DEEP EDIT MODAL */}
      {editingFileId && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-5xl h-[90vh] bg-slate-900 rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setEditingFileId(null)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Deep Edit</h3>
                            <p className="text-xs text-slate-400 truncate max-w-md">{files.find(f => f.id === editingFileId)?.file.name}</p>
                        </div>
                    </div>
                    <button onClick={() => setEditingFileId(null)} className="text-slate-500 hover:text-white p-2">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
                    {files.find(f => f.id === editingFileId) ? (
                         <MetadataCard 
                            item={files.find(f => f.id === editingFileId)!} 
                            isSelected={true}
                            onToggleSelect={() => {}} 
                            onUpdateMetadata={handleUpdateMetadata}
                            onUpdateReport={handleUpdateReport}
                            onUpdatePrompt={handleUpdatePrompt}
                            onSavePreset={savePreset}
                            onApplyToAll={handleApplyToAll}
                            onRegenerate={() => processImage(editingFileId!)}
                            apiKey=""
                            keywordStyle={keywordStyle}
                        />
                    ) : (
                        <div className="text-center text-red-500 mt-10">File not found</div>
                    )}
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default App;