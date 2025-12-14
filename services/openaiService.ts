import { supabase } from '../supabaseClient';
import { StockMetadata, MarketTrend, ChatMessage } from "../types";

// --- RETRY LOGIC FOR STABILITY ---
// Automatically retries failed requests up to 3 times to prevent "Skipped" errors.
const invokeWithRetry = async (action: string, payload: any, retries = 3): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data, error } = await supabase.functions.invoke('generate-metadata', {
        body: { action, ...payload }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      return data; // Success!
    } catch (err) {
      console.warn(`Attempt ${i + 1} failed for ${action}:`, err);
      if (i === retries - 1) throw err; // Throw if last attempt failed
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

// 1. Image/Video Metadata Generation
export const generateImageMetadata = async (
  _ignoredApiKey: string, 
  base64Data: string, 
  mimeType: string,
  negativeKeywords?: string,
  keywordStyle: 'Mixed' | 'Single' | 'Phrases' = 'Single'
): Promise<StockMetadata> => {
  return await invokeWithRetry('generate_metadata', {
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
  const response = await invokeWithRetry('suggest_keywords', {
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
  const response = await invokeWithRetry('strategic_analysis', {
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
  const response = await invokeWithRetry('reverse_prompt', {
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
  return await invokeWithRetry('market_research', { query });
};

// 6. Chatbot
export const sendChatMessage = async (
  _ignoredApiKey: string, 
  history: ChatMessage[]
): Promise<string> => {
  const response = await invokeWithRetry('chat', { history });
  return response.message || "";
};

// 7. Asset Tracker (Separate Function - No Retry needed as it's fast)
export const trackAsset = async (
  _ignoredApiKey: string,
  url: string
): Promise<{ downloads: number | null; views: number | null; message: string }> => {
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