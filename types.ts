export interface StockMetadata {
  title: string;
  description: string;
  keywords: string[];
}

export enum FileStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface StockFile {
  id: string;
  file: File;
  previewUrl: string;
  status: FileStatus;
  metadata?: StockMetadata;
  error?: string;
  processedFile?: Blob; // The file with embedded metadata
  strategyReport?: string; // For the Thinking Mode report
  generatedPrompt?: string; // For the Image-to-Prompt feature
  vectorFile?: File; // The paired vector file (EPS/SVG)
}

export interface MetadataPreset {
  id: string;
  name: string;
  metadata: StockMetadata;
}

export interface ProcessingStats {
  total: number;
  processed: number;
  failed: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface MarketTrend {
  content: string;
  sources: GroundingSource[];
}