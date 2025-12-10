import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Trash2, Key, XCircle, Zap, Eye, Video } from 'lucide-react';
import { KeyManager, KeySlot } from '../services/KeyManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysChanged: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onKeysChanged }) => {
  const [keys, setKeys] = useState<KeySlot[]>([]);
  const [newKey, setNewKey] = useState("");
  const [providerType, setProviderType] = useState<'auto' | 'openai' | 'deepseek' | 'google'>('auto');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setKeys(KeyManager.getKeys());
    }
  }, [isOpen]);

  const handleAddKey = () => {
    setError(null);
    try {
      // Pass the selected provider type to KeyManager
      KeyManager.addKey(newKey, providerType);
      setKeys(KeyManager.getKeys());
      setNewKey("");
      setProviderType('auto'); // Reset to auto
      onKeysChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRemoveKey = (id: string) => {
    KeyManager.removeKey(id);
    setKeys(KeyManager.getKeys());
    onKeysChanged();
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google': return <Video className="w-3 h-3" />;
      case 'openai': return <Eye className="w-3 h-3" />;
      case 'deepseek': return <Zap className="w-3 h-3" />;
      default: return <Key className="w-3 h-3" />;
    }
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'google': return 'Gemini 1.5 (Video/Vision)';
      case 'openai': return 'GPT-4o (Vision/Fallback)';
      case 'deepseek': return 'DeepSeek-V3 (Text/Chat)';
      default: return provider;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-center">
          <ShieldCheck className="w-12 h-12 text-white mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-white">System Configuration</h2>
          <p className="text-blue-100 text-sm mt-1">Manage Multi-AI Engine Access</p>
        </div>

        <div className="p-6 space-y-6">
          
          {/* List of Keys */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Licenses ({keys.length})</h3>
            
            {keys.length === 0 && (
                <div className="text-center p-4 border border-dashed border-slate-700 rounded-lg text-slate-500 text-sm">
                    No active licenses. Add a key below to enable AI features.
                </div>
            )}

            <div className="max-h-40 overflow-y-auto space-y-2">
                {keys.map((k, i) => (
                    <div key={k.id} className="bg-slate-900 border border-slate-700 p-3 rounded-lg flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-full ${
                                k.provider === 'openai' ? 'bg-emerald-500/20 text-emerald-400' : 
                                k.provider === 'deepseek' ? 'bg-purple-500/20 text-purple-400' : 
                                'bg-blue-500/20 text-blue-400'
                            }`}>
                                {getProviderIcon(k.provider)}
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-200">
                                    {getProviderLabel(k.provider)}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                                    <span>•••• {k.key.slice(-4)}</span>
                                    {k.failureCount > 0 && <span className="text-amber-500">({k.failureCount} errors)</span>}
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleRemoveKey(k.id)}
                            className="text-slate-600 hover:text-red-400 transition-colors p-1"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
          </div>

          {/* Add New Key */}
          <div className="space-y-2">
             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Add New License</label>
             <div className="flex gap-2">
                 <input 
                    type="password"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
                    placeholder="Paste API key..."
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none placeholder:text-slate-600"
                 />
                 
                 <select 
                    value={providerType}
                    onChange={(e) => setProviderType(e.target.value as any)}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-2 text-xs text-white focus:border-cyan-500 outline-none"
                 >
                    <option value="auto">Auto-Detect</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="google">Google (Gemini)</option>
                 </select>

                 <button 
                    onClick={handleAddKey}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2 rounded-lg flex items-center justify-center transition-colors"
                 >
                    <Plus className="w-4 h-4" />
                 </button>
             </div>
             {error && <p className="text-xs text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {error}</p>}
             <p className="text-[10px] text-slate-500">
                Tip: Use <b>Google</b> for Video support. Use <b>DeepSeek</b> for cheaper text tasks.
             </p>
          </div>

          <div className="pt-2 border-t border-slate-700 flex justify-end gap-3">
             <button 
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
             >
                Close
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;