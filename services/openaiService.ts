import { supabase } from '../supabaseClient';
import { StockMetadata, MarketTrend, ChatMessage } from "../types";

// Helper to handle the Supabase Invoke for the MAIN APP (Metadata, etc.)
// We send an 'action' parameter so one Edge Function can handle all different tasks
const invokeVisionMetaEdgeFunction = async (action: string, payload: any) => {
  const { data, error } = await supabase.functions.invoke('generate-metadata', {
    body: { action, ...payload }
  });

  if (error) {
    // This handles network errors or 500s from the Edge Function
    console.error("Edge Function Invocation Error:", error);
    throw new Error("Connection to server failed. Please try again.");
  }

  // This handles application errors returned by your logic (e.g., "Insufficient credits")
  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};

// 1. Image/Video Metadata Generation
export const generateImageMetadata = async (
  _ignoredApiKey: string, // kept for signature compatibility
  base64Data: string, 
  mimeType: string,
  negativeKeywords?: string,
  keywordStyle: 'Mixed' | 'Single' | 'Phrases' = 'Single'
): Promise<StockMetadata> => {
  return await invokeVisionMetaEdgeFunction('generate_metadata', {
    base64Data,
    mimeType,
    negativeKeywords,
    keywordStyle
  });
};

// 2. Keyword Suggestion
export const suggestMoreKeywords = async (
  _ignoredApiKey: string,
  title: string, 
  description: string, 
  currentKeywords: string[], 
  type: any = 'mixed',
  keywordStyle: any = 'Single'
): Promise<string[]> => {
  const response = await invokeVisionMetaEdgeFunction('suggest_keywords', {
    title,
    description,
    currentKeywords,
    type,
    keywordStyle
  });
  return response.suggestions || [];
};

// 3. Strategic Analysis
export const generateStrategicAnalysis = async (
  _ignoredApiKey: string, 
  base64Data: string, 
  mimeType: string, 
  title: string
): Promise<string> => {
  const response = await invokeVisionMetaEdgeFunction('strategic_analysis', {
    base64Data,
    mimeType,
    title
  });
  return response.report || "No analysis generated.";
};

// 4. Reverse Prompt Engineering
export const generateReversePrompt = async (
  _ignoredApiKey: string, 
  base64Data: string, 
  mimeType: string
): Promise<string> => {
  const response = await invokeVisionMetaEdgeFunction('reverse_prompt', {
    base64Data,
    mimeType
  });
  return response.prompt || "";
};

// 5. Market Research
export const getMarketResearch = async (
  _ignoredApiKey: string, 
  query: string
): Promise<MarketTrend> => {
  return await invokeVisionMetaEdgeFunction('market_research', { query });
};

// 6. Chatbot
export const sendChatMessage = async (
  _ignoredApiKey: string, 
  history: ChatMessage[]
): Promise<string> => {
  const response = await invokeVisionMetaEdgeFunction('chat', { history });
  return response.message || "";
};

// 7. Asset Tracker (NEW - Points to the SEPARATE test function)
export const trackAsset = async (
  _ignoredApiKey: string,
  url: string
): Promise<{ downloads: number | null; views: number | null; message: string }> => {
  // NOTE: Calling 'asset-tracker' function, NOT 'generate-metadata'
  const { data, error } = await supabase.functions.invoke('asset-tracker', {
    body: { url }
  });

  if (error) {
    console.error("Tracker Error:", error);
    throw new Error("Failed to connect to tracker service.");
  }
  
  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};