import React, { useCallback } from 'react';
import { Upload } from 'lucide-react';

interface UploaderProps {
  onFilesSelected: (files: File[]) => void;
  compact?: boolean;
}

const Uploader: React.FC<UploaderProps> = ({ onFilesSelected, compact = false }) => {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Accept JPG, PNG, SVG, EPS, and Video files
      const files = Array.from(e.dataTransfer.files).filter((file: File) => 
        file.type === "image/jpeg" || 
        file.type === "image/png" || 
        file.type === "image/svg+xml" ||
        file.type.startsWith('video/') ||
        file.name.toLowerCase().endsWith(".eps") ||
        file.name.toLowerCase().endsWith(".mov") || 
        file.name.toLowerCase().endsWith(".mp4")
      );
      if (files.length > 0) {
        onFilesSelected(files);
      }
    }
  }, [onFilesSelected]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
       const files = Array.from(e.target.files).filter((file: File) => 
        file.type === "image/jpeg" || 
        file.type === "image/png" ||
        file.type === "image/svg+xml" ||
        file.type.startsWith('video/') ||
        file.name.toLowerCase().endsWith(".eps") ||
        file.name.toLowerCase().endsWith(".mov") || 
        file.name.toLowerCase().endsWith(".mp4")
      );
      onFilesSelected(files);
    }
  };

  return (
    <div 
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`w-full ${compact ? 'h-32' : 'h-48'} border-2 border-dashed border-slate-600 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 hover:border-cyan-500/50 transition-all flex flex-col items-center justify-center cursor-pointer group`}
    >
      <label htmlFor="file-upload" className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
        <div className={`p-3 bg-slate-800 rounded-full ${compact ? 'mb-2' : 'mb-4'} group-hover:scale-110 group-hover:bg-slate-700 transition-all shadow-lg`}>
          <Upload className={`${compact ? 'w-5 h-5' : 'w-8 h-8'} text-cyan-400`} />
        </div>
        <p className={`${compact ? 'text-sm' : 'text-lg'} font-medium text-slate-200 group-hover:text-white transition-colors`}>Drag & Drop files</p>
        {!compact && <p className="text-sm text-slate-400 mt-2">Supports JPG, PNG, Video + Linked EPS/SVG</p>}
        <input 
          id="file-upload" 
          type="file" 
          multiple 
          accept="image/jpeg, image/png, image/svg+xml, .eps, video/*, .mov, .mp4, .webm" 
          className="hidden" 
          onChange={handleChange}
        />
      </label>
    </div>
  );
};

export default Uploader;