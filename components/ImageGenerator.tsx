import React, { useState } from 'react';
import { Wand2, Download, RefreshCw, Zap, ArrowRight, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { generateImage, GenerationResult } from '../services/replicateService';

interface ImageGeneratorProps {
  onImageGenerated: (file: File, prompt: string) => void;
  userCredits: number | null; // NEW PROP
}

const COST_PER_IMAGE = 50; // Calculated for Flux Dev ($0.025)

const ASPECT_RATIOS = [
  { label: '16:9', value: '16:9', icon: 'RectangleHorizontal' },
  { label: '1:1', value: '1:1', icon: 'Square' },
  { label: '9:16', value: '9:16', icon: 'RectangleVertical' },
  { label: '4:3', value: '4:3', icon: 'RectangleHorizontal' },
];

const PRESETS = [
  { 
    id: 'corporate_vector', 
    name: 'Corp Vector', 
    promptSuffix: "flat vector art, corporate memphis style, minimal, navy blue and cyan palette, clean lines, white background, no gradients, high quality illustration" 
  },
  { 
    id: 'photorealistic', 
    name: 'Photo Real', 
    promptSuffix: "hyperrealistic, 8k, extremely detailed, cinematic lighting, shot on 35mm" 
  },
  { 
    id: 'none', 
    name: 'Raw', 
    promptSuffix: "" 
  }
];

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ onImageGenerated, userCredits }) => {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [selectedPreset, setSelectedPreset] = useState("corporate_vector");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const hasCredits = userCredits !== null && userCredits >= COST_PER_IMAGE;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (!hasCredits) {
        alert(`Insufficient credits! You need ${COST_PER_IMAGE} credits to generate an image.`);
        return;
    }

    setIsGenerating(true);
    setResult(null);

    // 1. Construct Full Prompt
    const preset = PRESETS.find(p => p.id === selectedPreset);
    const fullPrompt = preset && preset.id !== 'none' 
      ? `${prompt}, ${preset.promptSuffix}` 
      : prompt;

    // 2. Call Service (Flux Dev/Pro)
    // Note: The backend should handle the actual credit deduction!
    const data = await generateImage({
      prompt: fullPrompt,
      aspectRatio: aspect,
    });

    setResult(data);
    setIsGenerating(false);
  };

  const handleProcess = async () => {
    if (!result) return;
    try {
        const response = await fetch(result.imageUrl);
        const blob = await response.blob();
        const filename = `flux_gen_${Date.now()}.jpg`; 
        const file = new File([blob], filename, { type: blob.type });
        onImageGenerated(file, prompt);
    } catch (e) {
        console.error("Failed to process generated image", e);
        alert("Failed to download image from server. CORS issue?");
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 shadow-xl animate-in slide-in-from-left-4">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-500/20 rounded-lg">
            <Zap className="w-6 h-6 text-pink-400" />
            </div>
            <div>
            <h2 className="text-xl font-bold text-white">Flux AI Studio</h2>
            <p className="text-xs text-slate-400">Powered by Replicate (Flux Dev)</p>
            </div>
        </div>
        <div className={`px-3 py-1 rounded-full border text-xs font-bold ${hasCredits ? 'bg-slate-900 border-slate-600 text-slate-300' : 'bg-red-900/20 border-red-500 text-red-400'}`}>
            Cost: {COST_PER_IMAGE} Credits
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-full">
        
        {/* LEFT: Controls */}
        <div className="flex-1 space-y-6">
            
            {/* Prompt Input */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prompt</label>
                <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your image (e.g., 'A futuristic data center with glowing servers')..."
                    className="w-full h-32 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-pink-500 outline-none resize-none placeholder:text-slate-600"
                />
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aspect Ratio</label>
                    <div className="grid grid-cols-2 gap-2">
                        {ASPECT_RATIOS.map((r) => (
                            <button
                                key={r.value}
                                onClick={() => setAspect(r.value)}
                                className={`py-2 text-xs font-bold rounded-lg border transition-all ${aspect === r.value ? 'bg-pink-600 text-white border-pink-500' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Style Preset</label>
                    <div className="flex flex-col gap-2">
                        {PRESETS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setSelectedPreset(p.id)}
                                className={`px-3 py-2 text-xs font-bold rounded-lg border text-left transition-all ${selectedPreset === p.id ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}
                            >
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Generate Button */}
            <button 
                onClick={handleGenerate}
                disabled={isGenerating || !prompt || !hasCredits}
                className={`w-full py-3 font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                    !hasCredits 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white shadow-pink-900/20'
                }`}
            >
                {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                {!hasCredits ? "Insufficient Credits" : isGenerating ? "Generating..." : `Generate Image (-${COST_PER_IMAGE} Credits)`}
            </button>
            
            {!hasCredits && (
                <p className="text-xs text-red-400 text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" /> You need {COST_PER_IMAGE} credits. You have {userCredits}.
                </p>
            )}

        </div>

        {/* RIGHT: Preview */}
        <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden group">
            {result ? (
                <>
                    <img src={result.imageUrl} alt="Generated" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
                        <button 
                            onClick={handleProcess}
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full shadow-lg flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all"
                        >
                            <ArrowRight className="w-5 h-5" /> Send to Metadata Lab
                        </button>
                        <a 
                            href={result.imageUrl} 
                            download={`generated_${Date.now()}.jpg`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-slate-300 hover:text-white flex items-center gap-2 underline"
                        >
                            <Download className="w-4 h-4" /> Download Raw
                        </a>
                    </div>
                </>
            ) : (
                <div className="text-center text-slate-500">
                    <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium">Preview Area</p>
                    <p className="text-sm">Your masterpiece will appear here.</p>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default ImageGenerator;