import React, { useState, useEffect } from 'react';
import { StockFile, FileStatus, StockMetadata } from '../types';
import { CheckCircle, Loader2, AlertCircle, Edit2, Save, X, Copy, Check, ArrowUp, Bookmark, Copy as CopyIcon, Sparkles, Plus, Layers, Eye, Briefcase, Zap, BrainCircuit, FileText, Wand2, RefreshCw, Play, FileBox } from 'lucide-react';
import { suggestMoreKeywords, KeywordSuggestionType, generateStrategicAnalysis, generateReversePrompt } from '../services/openaiService';
import { fileToBase64 } from '../services/imageService';

interface MetadataCardProps {
  item: StockFile;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdateMetadata: (id: string, metadata: any) => void;
  onUpdateReport: (id: string, report: string) => void;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onSavePreset: (metadata: StockMetadata) => void;
  onApplyToAll: (metadata: StockMetadata) => void;
  onRegenerate: () => void;
  apiKey: string; // Deprecated
  keywordStyle: 'Mixed' | 'Single' | 'Phrases';
}

const MetadataCard: React.FC<MetadataCardProps> = ({ 
  item, 
  isSelected, 
  onToggleSelect, 
  onUpdateMetadata,
  onUpdateReport,
  onUpdatePrompt,
  onSavePreset, 
  onApplyToAll,
  onRegenerate,
  keywordStyle
}) => {
  const [activeTab, setActiveTab] = useState<'metadata' | 'strategy' | 'prompt'>('metadata');
  const [isEditing, setIsEditing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  
  // Edit State
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [newKeywordInput, setNewKeywordInput] = useState("");
  
  // Suggestion State
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionType, setSuggestionType] = useState<KeywordSuggestionType>('mixed');
  const [showQuickSuggest, setShowQuickSuggest] = useState(false);

  // Copy Feedback State
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (item.metadata) {
      setEditTitle(item.metadata.title);
      setEditDesc(item.metadata.description);
      setEditKeywords(item.metadata.keywords);
    }
  }, [item.metadata, isEditing]);

  const handleSave = () => {
    onUpdateMetadata(item.id, {
      title: editTitle,
      description: editDesc,
      keywords: editKeywords
    });
    setIsEditing(false);
    setSuggestedKeywords([]);
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const removeKeyword = (indexToRemove: number) => {
    setEditKeywords(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const addKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = newKeywordInput.trim();
      if (val && !editKeywords.includes(val)) {
        setEditKeywords([...editKeywords, val]);
        setNewKeywordInput("");
      }
    }
  };

  const promoteKeyword = (index: number) => {
    if (index === 0) return;
    const currentKeywords = isEditing ? editKeywords : (item.metadata?.keywords || []);
    const newKeywords = [...currentKeywords];
    const kw = newKeywords[index];
    newKeywords.splice(index, 1);
    newKeywords.unshift(kw);
    
    if (isEditing) {
        setEditKeywords(newKeywords);
    } else {
        onUpdateMetadata(item.id, { ...item.metadata, keywords: newKeywords });
    }
  };

  const handleSuggest = async (type: KeywordSuggestionType) => {
    if (!item.metadata) return;
    setIsSuggesting(true);
    setSuggestionType(type);
    setSuggestedKeywords([]);
    try {
      const suggestions = await suggestMoreKeywords(
        "", 
        item.metadata.title, 
        item.metadata.description, 
        item.metadata.keywords, 
        type,
        keywordStyle
      );
      setSuggestedKeywords(suggestions);
    } catch (error) {
      console.error("Failed to suggest keywords", error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleStrategicAnalysis = async () => {
      if (item.strategyReport) return;
      setIsAnalyzing(true);
      try {
        const base64 = await fileToBase64(item.file);
        const report = await generateStrategicAnalysis("", base64, item.file.type, item.metadata?.title || "Image");
        onUpdateReport(item.id, report);
      } catch (e) {
          console.error(e);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handlePromptGeneration = async () => {
      if (item.generatedPrompt) return;
      setIsGeneratingPrompt(true);
      try {
        const base64 = await fileToBase64(item.file);
        const prompt = await generateReversePrompt("", base64, item.file.type);
        onUpdatePrompt(item.id, prompt);
      } catch (e) {
        console.error(e);
      } finally {
        setIsGeneratingPrompt(false);
      }
  };

  const addQuickSuggestion = (kw: string) => {
    if (!item.metadata) return;
    const newKeywords = [...item.metadata.keywords, kw];
    onUpdateMetadata(item.id, { ...item.metadata, keywords: newKeywords });
    setSuggestedKeywords(prev => prev.filter(k => k !== kw));
  };

  const SuggestionTab = ({ type, label, icon: Icon }: { type: KeywordSuggestionType, label: string, icon: any }) => (
      <button
          onClick={() => handleSuggest(type)}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
              suggestionType === type 
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/20' 
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-transparent hover:border-slate-600'
          }`}
      >
          <Icon className="w-3.5 h-3.5" />
          {label}
      </button>
  );

  const isVideo = item.file.type.startsWith('video/') || 
                  item.file.name.toLowerCase().endsWith('.mp4') || 
                  item.file.name.toLowerCase().endsWith('.mov') || 
                  item.file.name.toLowerCase().endsWith('.webm') ||
                  item.file.name.toLowerCase().endsWith('.avi');

  return (
    <div className={`bg-slate-800 border rounded-xl overflow-hidden flex flex-col md:flex-row shadow-lg transition-all hover:shadow-2xl group/card ${isSelected ? 'border-cyan-500 ring-1 ring-cyan-500/50' : 'border-slate-700 hover:border-slate-600'}`}>
      <div className="w-full md:w-64 h-64 md:h-auto relative bg-slate-900 flex-shrink-0">
        
        {isVideo ? (
            <video 
                src={item.previewUrl} 
                controls 
                className="w-full h-full object-contain bg-slate-950/50" 
            />
        ) : (
            <img 
                src={item.previewUrl} 
                alt="Preview" 
                className="w-full h-full object-contain bg-slate-950/50" 
            />
        )}

        <div 
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
            className="absolute top-2 left-2 z-20 cursor-pointer p-1 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur transition-all"
        >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-white/70 hover:border-white'}`}>
                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
        </div>

        {/* Status Badge */}
        <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
            {item.status === FileStatus.PROCESSING && (
                <div className="bg-blue-500/90 backdrop-blur text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <Loader2 className="w-3 h-3 animate-spin" /> Processing
                </div>
            )}
            {item.status === FileStatus.SUCCESS && (
                <div className="bg-emerald-500/90 backdrop-blur text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <CheckCircle className="w-3 h-3" /> Ready
                </div>
            )}
            {item.status === FileStatus.ERROR && (
                <div className="bg-red-500/90 backdrop-blur text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <AlertCircle className="w-3 h-3" /> Failed
                </div>
            )}
            {/* Vector Badge */}
            {item.vectorFile && (
               <div className="bg-amber-500/90 backdrop-blur text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                  <FileBox className="w-3 h-3" /> 
                  {item.vectorFile.name.split('.').pop()?.toUpperCase()}
               </div>
            )}
        </div>
        
        {item.status === FileStatus.SUCCESS && item.metadata && !isEditing && (
             <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-slate-900 to-transparent p-3 opacity-0 group-hover/card:opacity-100 transition-opacity flex justify-center gap-2">
                <button 
                  onClick={() => onApplyToAll(item.metadata!)}
                  className="bg-slate-800/90 hover:bg-cyan-600 text-slate-300 hover:text-white p-2 rounded-full backdrop-blur border border-slate-600 hover:border-cyan-500 transition-all shadow-lg"
                  title="Apply to ALL"
                >
                  <CopyIcon className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => onSavePreset(item.metadata!)}
                  className="bg-slate-800/90 hover:bg-purple-600 text-slate-300 hover:text-white p-2 rounded-full backdrop-blur border border-slate-600 hover:border-purple-500 transition-all shadow-lg"
                  title="Save Preset"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
             </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-slate-800/50">
        
        {/* Tabs - ONLY SHOW if SUCCESS */}
        {item.status === FileStatus.SUCCESS && (
            <div className="flex border-b border-slate-700 bg-slate-900/30">
                <button 
                    onClick={() => setActiveTab('metadata')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'metadata' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <FileText className="w-3 h-3" /> Metadata
                </button>
                <button 
                    onClick={() => { setActiveTab('strategy'); handleStrategicAnalysis(); }}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'strategy' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <BrainCircuit className="w-3 h-3" /> Analysis
                </button>
                <button 
                    onClick={() => { setActiveTab('prompt'); }}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'prompt' ? 'border-pink-500 text-pink-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <Wand2 className="w-3 h-3" /> Prompt Gen
                </button>
            </div>
        )}

        <div className="p-5 flex-1 flex flex-col gap-4">
        
        {/* IDLE STATE FIX (No longer blank!) */}
        {item.status === FileStatus.IDLE && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-4 min-h-[300px]">
                <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-slate-400" />
                </div>
                <div className="text-center">
                    <p className="font-medium text-slate-300">Ready to Analyze</p>
                    <p className="text-xs mt-1 text-slate-500">Generate metadata to see details.</p>
                </div>
                <button 
                    onClick={onRegenerate}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
                >
                    <Play className="w-4 h-4 fill-current" /> Generate Metadata
                </button>
            </div>
        )}
            
        {item.status === FileStatus.PROCESSING && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3 min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                <p className="animate-pulse text-sm">AI Vision Engine Analyzing...</p>
            </div>
        )}

        {item.status === FileStatus.ERROR && (
             <div className="flex-1 flex flex-col items-center justify-center text-red-400 p-4 border border-red-500/20 rounded-lg bg-red-500/5 min-h-[200px]">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p className="font-medium">Analysis Failed</p>
                <p className="text-xs mt-1 text-red-400/70 text-center">{item.error}</p>
                <button onClick={onRegenerate} className="mt-3 text-xs bg-red-900/30 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded transition-colors">
                    Retry
                </button>
             </div>
        )}

        {/* METADATA VIEW (Only show if SUCCESS) */}
        {item.status === FileStatus.SUCCESS && activeTab === 'metadata' && item.metadata && !isEditing && (
            <>
                <div className="space-y-1">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1 flex-1 mr-4">
                            <div className="flex items-center gap-2">
                                <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Title</h3>
                                <button onClick={() => copyToClipboard(item.metadata!.title, 'title')} className="text-slate-500 hover:text-cyan-400">
                                    {copiedField === 'title' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                </button>
                            </div>
                            <p className="text-slate-100 font-medium leading-snug">{item.metadata.title}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={onRegenerate}
                                className="text-slate-400 hover:text-cyan-400 p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                                title="Regenerate Metadata"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setIsEditing(true); setShowQuickSuggest(false); }} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700" title="Edit Metadata">
                                <Edit2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Description</h3>
                        <button onClick={() => copyToClipboard(item.metadata!.description, 'desc')} className="text-slate-500 hover:text-cyan-400">
                             {copiedField === 'desc' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed line-clamp-2">{item.metadata.description}</p>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                                Keywords <span className="text-slate-500 ml-1">({item.metadata.keywords.length})</span>
                            </h3>
                            <button onClick={() => copyToClipboard(item.metadata!.keywords.join(', '), 'kw')} className="text-slate-500 hover:text-cyan-400">
                                {copiedField === 'kw' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 content-start">
                        {item.metadata.keywords.slice(0, 10).map((kw, i) => (
                            <span key={`top-${i}`} className="relative bg-amber-900/20 text-amber-200 text-xs px-2 py-1 rounded border border-amber-500/30 cursor-pointer select-none" title="Top 10 Priority">
                                <span className="mr-1.5 opacity-50 text-[10px] font-mono">{i + 1}</span>
                                {kw}
                            </span>
                        ))}
                        {item.metadata.keywords.slice(10).map((kw, i) => (
                            <button 
                                key={`rest-${i}`} 
                                onClick={() => promoteKeyword(i + 10)}
                                className="group/tag bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white text-xs px-2 py-1 rounded border border-slate-600/50 hover:border-cyan-500/50 transition-colors cursor-pointer flex items-center gap-1"
                            >
                                {kw}
                                <ArrowUp className="w-2.5 h-2.5 opacity-0 group-hover/tag:opacity-100 text-cyan-400" />
                            </button>
                        ))}
                    </div>

                    {/* SUGGEST MORE BUTTON - BOTTOM RIGHT */}
                    <div className="mt-3 flex flex-col items-end">
                      {!showQuickSuggest && (
                        <button 
                          onClick={() => {
                            setShowQuickSuggest(true);
                            if (suggestedKeywords.length === 0) handleSuggest('mixed');
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500 hover:text-white px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 shadow-sm hover:shadow-cyan-500/20"
                        >
                          <Sparkles className="w-3 h-3" /> Suggest More
                        </button>
                      )}
                    </div>

                    {/* SUGGESTION PANEL */}
                    {showQuickSuggest && (
                        <div className="mt-2 border-t border-slate-700 pt-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                  <Sparkles className="w-3 h-3 text-purple-400" /> Generate More ({keywordStyle})
                                </h4>
                                <button onClick={() => setShowQuickSuggest(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-700 rounded"><X className="w-3 h-3"/></button>
                            </div>
                            
                            {/* Tabs */}
                            <div className="flex gap-1 mb-4 bg-slate-900/50 p-1 rounded-lg">
                                <SuggestionTab type="mixed" label="Mixed" icon={Layers} />
                                <SuggestionTab type="visual" label="Visuals" icon={Eye} />
                                <SuggestionTab type="conceptual" label="Concepts" icon={Zap} />
                                <SuggestionTab type="industry" label="Industry" icon={Briefcase} />
                            </div>

                            {/* Results Area */}
                            <div className="min-h-[80px]">
                                {isSuggesting ? (
                                    <div className="flex flex-col items-center justify-center py-4 text-slate-500 gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                                        <span className="text-xs">Generating {suggestionType} ideas...</span>
                                    </div>
                                ) : suggestedKeywords.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {suggestedKeywords.map((kw, i) => (
                                            <button
                                                key={i}
                                                onClick={() => addQuickSuggestion(kw)}
                                                className="bg-slate-800 hover:bg-emerald-600 hover:border-emerald-500 text-slate-300 hover:text-white border border-slate-600/50 text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all group animate-in zoom-in-50 duration-200"
                                            >
                                                <Plus className="w-3 h-3 text-emerald-400 group-hover:text-white" /> {kw}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                  <div className="text-center py-4">
                                     <button 
                                        onClick={() => handleSuggest(suggestionType)}
                                        className="text-xs text-slate-500 hover:text-cyan-400 flex items-center justify-center gap-1 mx-auto"
                                     >
                                        <RefreshCw className="w-3 h-3" /> Retry Generation
                                     </button>
                                  </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </>
        )}

        {/* STRATEGY VIEW */}
        {item.status === FileStatus.SUCCESS && activeTab === 'strategy' && (
            <div className="flex-1 overflow-y-auto pr-2 animate-in fade-in duration-300">
                {isAnalyzing ? (
                    <div className="flex flex-col items-center justify-center h-48 space-y-4 text-amber-400">
                         <div className="relative">
                            <BrainCircuit className="w-10 h-10 animate-pulse" />
                            <div className="absolute top-0 right-0 w-3 h-3 bg-amber-200 rounded-full animate-ping"></div>
                         </div>
                         <div className="text-center">
                            <p className="font-bold text-sm">Thinking...</p>
                            <p className="text-xs text-amber-400/70">AI is analyzing market viability</p>
                         </div>
                    </div>
                ) : item.strategyReport ? (
                    <div className="prose prose-invert prose-sm text-xs leading-relaxed text-slate-300">
                        <div className="whitespace-pre-wrap">{item.strategyReport}</div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <p className="text-sm">Click the tab to start analysis.</p>
                    </div>
                )}
            </div>
        )}
        
        {/* PROMPT GEN VIEW */}
        {item.status === FileStatus.SUCCESS && activeTab === 'prompt' && (
            <div className="flex-1 overflow-y-auto pr-2 animate-in fade-in duration-300">
                {isGeneratingPrompt ? (
                    <div className="flex flex-col items-center justify-center h-48 space-y-4 text-pink-400">
                         <div className="relative">
                            <Wand2 className="w-10 h-10 animate-pulse" />
                            <div className="absolute top-0 right-0 w-3 h-3 bg-pink-200 rounded-full animate-ping"></div>
                         </div>
                         <div className="text-center">
                            <p className="font-bold text-sm">Reverse Engineering...</p>
                            <p className="text-xs text-pink-400/70">Creating high-quality text prompt</p>
                         </div>
                    </div>
                ) : item.generatedPrompt ? (
                    <div className="space-y-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 relative group">
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => copyToClipboard(item.generatedPrompt || "", "prompt_copy")} className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-md border border-slate-600">
                                    <Copy className="w-3 h-3" />
                                </button>
                            </div>
                            <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider block mb-2">Generated Prompt</span>
                            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{item.generatedPrompt}</p>
                        </div>
                        <button 
                            onClick={() => copyToClipboard(item.generatedPrompt || "", "prompt_copy")}
                            className="w-full py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-900/20"
                        >
                            {copiedField === "prompt_copy" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copiedField === "prompt_copy" ? "Copied!" : "Copy Prompt to Clipboard"}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                        <div className="text-center">
                            <p className="text-sm font-medium text-slate-400">Image to Prompt</p>
                            <p className="text-xs mt-1 max-w-[250px] mx-auto text-slate-500">Reverse engineer this image into a prompt for Midjourney or Stable Diffusion.</p>
                        </div>
                        <button 
                            onClick={handlePromptGeneration}
                            className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all shadow-lg shadow-pink-900/20"
                        >
                            <Wand2 className="w-4 h-4" /> Generate Prompt
                        </button>
                    </div>
                )}
            </div>
        )}

        {/* EDIT VIEW */}
        {isEditing && activeTab === 'metadata' && (
            <div className="flex flex-col gap-4 h-full animate-in fade-in duration-200">
                <div className="space-y-1">
                    <label className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Title</label>
                    <input 
                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Description</label>
                    <textarea 
                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none resize-none h-20"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                    />
                </div>
                <div className="flex-1 flex flex-col min-h-0 space-y-1">
                    <label className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Keywords ({editKeywords.length})</label>
                    <div className="w-full bg-slate-900 border border-slate-600 rounded p-2 flex flex-wrap gap-2 content-start overflow-y-auto max-h-[250px]">
                        {editKeywords.map((kw, i) => (
                            <span key={i} className={`text-xs pl-2 pr-1 py-1 rounded flex items-center gap-1 border ${i < 10 ? 'bg-amber-900/20 text-amber-200 border-amber-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                                {i < 10 && <span className="text-[10px] opacity-50 mr-1">{i + 1}</span>}
                                {kw}
                                <button onClick={() => removeKeyword(i)} className="p-0.5 hover:text-red-400"><X className="w-3 h-3" /></button>
                            </span>
                        ))}
                        <input 
                            className="bg-transparent border-none outline-none text-white text-xs min-w-[100px] flex-1 py-1 placeholder:text-slate-600"
                            placeholder="Type & Enter..."
                            value={newKeywordInput}
                            onChange={(e) => setNewKeywordInput(e.target.value)}
                            onKeyDown={addKeyword}
                        />
                    </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-300 text-xs font-medium">Cancel</button>
                    <button onClick={handleSave} className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-2"><Save className="w-3 h-3" /> Save</button>
                </div>
            </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default MetadataCard;