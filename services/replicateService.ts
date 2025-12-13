import { supabase } from '../supabaseClient';

export interface GenerateImageParams {
  prompt: string;
  aspectRatio: string;
  stylePreset?: string;
  outputFormat?: 'jpg' | 'png' | 'webp';
}

export interface GenerationResult {
  imageUrl: string;
  seed: number;
  cost: number;
}

// SIMULATION MODE: Returns a placeholder if no API key is present
const MOCK_IMAGE_URL = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop";

export const generateImage = async (params: GenerateImageParams, user: any): Promise<GenerationResult> => {
  
  console.log("Generating with params:", params);

  // 1. DEDUCT CREDITS (NEW LOGIC)
  // We use the 'update' method directly since RLS allows users to update their own profile.
  if (user) {
      // First fetch current credits to be safe
      const { data: profile } = await supabase.from('profiles').select('credits').eq('id', user.id).single();
      if (profile) {
          const newBalance = profile.credits - 50;
          if (newBalance < 0) throw new Error("Insufficient Credits");
          
          const { error: deductError } = await supabase
            .from('profiles')
            .update({ credits: newBalance })
            .eq('id', user.id);
            
          if (deductError) console.error("Credit deduction failed", deductError);
      }
  }

  // 2. CALL GENERATOR
  try {
    const { data, error } = await supabase.functions.invoke('generate-image', {
      body: params
    });

    if (error) {
      console.warn("Generation failed (likely no key). Switching to Simulation Mode.", error);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            imageUrl: MOCK_IMAGE_URL,
            seed: 123456,
            cost: 50
          });
        }, 2000); 
      });
    }

    if (data?.error) throw new Error(data.error);

    return {
      imageUrl: data.output[0], 
      seed: data.seed || 0,
      cost: 50 
    };

  } catch (e) {
    console.warn("Network error. Switching to Simulation Mode.");
    return {
       imageUrl: MOCK_IMAGE_URL,
       seed: 123456,
       cost: 50
    };
  }
};