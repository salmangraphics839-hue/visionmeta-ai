import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- MEMORY: SEO RULES & SYSTEM PROMPTS ---
const SEO_SYSTEM_PROMPT = `
You are an expert Stock Media SEO Specialist familiar with Adobe Stock and Shutterstock algorithms. 
Your objective is to generate optimized metadata (Title + Description + 50 Keywords) for the provided asset.

STRICT STEPS:
1. Identify the Core 3: Subject (Who/What), Action (Doing what), and Concept (Themes/Emotions).
2. TITLE: Write ONE natural, grammatical sentence of 8-15 words. Do not list keywords. Do not include "Generative AI".
3. DESCRIPTION: Write 2-3 sentences describing subject, setting, mood, and action. Max 200 chars.
4. KEYWORDS: Generate EXACTLY 50 keywords sorted by relevance.
   - Top 10: Must mirror the main words in the Title.
   - Mix: Include Literal (objects), Conceptual (ideas), and Stylistic (art style) tags.
   - Compliance: No repeated stems (run/running). No "Generative AI" tags.
   - CRITICAL: If the image contains NO HUMANS, "no people" MUST be in the Top 10 keywords.

OUTPUT FORMAT:
Return ONLY a valid JSON object. Do not wrap in markdown code blocks. Do not add conversational text.
Structure:
{
  "title": "String",
  "description": "String",
  "keywords": ["String", "String", ...]
}
`;

// --- HELPER 1: GENERIC API CALLER ---
const callOpenAICompatible = async (apiKey: string, baseURL: string, model: string, messages: any[], responseFormat?: any) => {
    const body: any = { model, messages, max_tokens: 1500 };
    if (responseFormat) body.response_format = responseFormat;
    
    const resp = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body)
    });
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Provider Error (${model}): ${err}`);
    }
    
    const data = await resp.json();
    return data.choices[0].message.content;
};

// --- HELPER 2: KEY LOADER (WITH SMART SHUFFLING) ---
const getProviderKeys = (baseName: string): string[] => {
    const keys: string[] = [];
    const k1 = Deno.env.get(baseName);
    if (k1) keys.push(k1);
    for (let i = 2; i <= 5; i++) {
        const k = Deno.env.get(`${baseName}_${i}`);
        if (k) keys.push(k);
    }
    // Randomize keys for Load Balancing (Superfast distribution)
    for (let i = keys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return keys;
};

// --- HELPER 3: ROBUST JSON PARSER ---
const cleanAndParseJSON = (text: string) => {
    try {
        // 1. Try Direct Parse
        return JSON.parse(text);
    } catch (e) {
        // 2. Try cleaning Markdown
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e2) {
                // 3. Fallback: Last ditch clean (remove unescaped newlines inside strings if needed, usually regex catches it)
                throw new Error("Failed to parse AI response as JSON");
            }
        }
        throw new Error("No JSON found in AI response");
    }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let supabaseAdmin: any;
  let user: any;
  let cost = 0;

  try {
    const { action, ...payload } = await req.json();
    
    // 1. SETUP & AUTH
    supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user: authUser }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !authUser) throw new Error("Unauthorized: You must be logged in.");
    user = authUser;

    // 2. CREDIT LOGIC
    if (['generate_metadata', 'strategic_analysis', 'reverse_prompt'].includes(action)) {
        cost = (payload.mimeType && payload.mimeType.startsWith('video/')) ? 2 : 1;
    }

    if (cost > 0) {
        const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', user.id).single();
        if (!profile || profile.credits < cost) {
            return new Response(JSON.stringify({ error: `Insufficient credits.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 });
        }
        const { error: deductErr } = await supabaseAdmin.from('profiles').update({ credits: profile.credits - cost }).eq('id', user.id);
        if (deductErr) throw new Error("Transaction failed.");
    }

    // 3. LOAD KEYS
    const KEYS = {
        GEMINI: getProviderKeys('GEMINI_API_KEY'),
        OPENAI: getProviderKeys('OPENAI_API_KEY'),
        DEEPSEEK: getProviderKeys('DEEPSEEK_API_KEY')
    };

    let result = null;
    let lastError = null;

    try {
        // === STRATEGY 1: VISION & VIDEO (METADATA / ANALYSIS / REVERSE PROMPT) ===
        if (['generate_metadata', 'strategic_analysis', 'reverse_prompt'].includes(action)) {
            const isVideo = payload.mimeType?.startsWith('video/');
            const isJson = action === 'generate_metadata';
            
            let promptText = "";
            
            // --- PROMPT CONSTRUCTION ---
            if (action === 'generate_metadata') {
                promptText = SEO_SYSTEM_PROMPT + `\n\nTASK: Analyze this asset and output JSON.`;
                
                if (payload.keywordStyle === 'Single') {
                    promptText += "\nKEYWORD STYLE RULE: STRICTLY SINGLE WORDS ONLY. No phrases allowed. EXCEPTION: You MUST use 'no people' as a phrase if applicable.";
                } else if (payload.keywordStyle === 'Phrases') {
                    promptText += "\nKEYWORD STYLE RULE: STRICTLY 2-WORD PHRASES ONLY.";
                } else {
                    promptText += "\nKEYWORD STYLE RULE: Mix of single words and phrases.";
                }

                if (payload.negativeKeywords) {
                    promptText += `\nNEGATIVE CONSTRAINTS (Do NOT use): ${payload.negativeKeywords}`;
                }
            } 
            else if (action === 'strategic_analysis') {
                promptText = `You are a Stock Photography Market Analyst. Analyze this asset's COMMERCIAL VIABILITY.
                1. **Target Buyer**: (e.g., Fintech, Healthcare, Edu-tech).
                2. **Key Selling Points**: (e.g., Authentic lighting, Copyspace, Diversity).
                3. **Technical/Conceptual Flaws**: (e.g., Noise, Cluttered composition, Dated style).
                4. **Pricing/Tier**: (Microstock vs Premium/Macrostock).`;
            } 
            else if (action === 'reverse_prompt') {
                promptText = `You are an elite Midjourney v6 Prompt Engineer. Analyze this image and write a text-to-image prompt to recreate it precisely.
                CRITICAL INSTRUCTION: Do NOT output a simple list of keywords. Use descriptive natural language phrases.
                Follow this specific structure:
                1. **Subject & Action**: Vivid details.
                2. **Environment**: Background, weather, time.
                3. **Lighting**: Volumetric, softbox, cinematic.
                4. **Camera**: Lens type (35mm), settings (f/1.8), angle.
                5. **Aesthetics**: Art style (Photorealistic, Octane Render).
                Output ONLY the raw prompt string. Do NOT write "Here is the prompt".`;
            }

            // --- VIDEO HANDLING (STORYBOARD TRICK) ---
            if (isVideo) {
                const videoPrompt = promptText + `\nCONTEXT: The input image is a 2x2 STORYBOARD collage extracted from a single video clip. Analyze these 4 frames together to understand the motion and action of the full video. Do NOT describe it as a collage.`;

                // ATTEMPT 1: GEMINI POOL (1.5 Flash is Superfast for Video)
                for (const key of KEYS.GEMINI) {
                    if (result) break;
                    try {
                        const genAI = new GoogleGenerativeAI(key);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                        const r = await model.generateContent([
                            videoPrompt, 
                            { inlineData: { data: payload.base64Data, mimeType: "image/jpeg" } } // Treat Storyboard as JPEG
                        ]);
                        const text = r.response.text();
                        if (isJson) {
                            result = cleanAndParseJSON(text);
                            // VALIDATION
                            if (!result.title || !result.keywords) throw new Error("Invalid metadata structure");
                        } else {
                            result = { report: text, prompt: text };
                        }
                    } catch (e) { lastError = e; }
                }
                // ATTEMPT 2: OPENAI POOL (UPDATED TO GPT-4o-MINI for Speed)
                if (!result) {
                    for (const key of KEYS.OPENAI) {
                        if (result) break;
                        try {
                            const messages = [{ role: "user", content: [
                                { type: "text", text: videoPrompt },
                                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${payload.base64Data}` } }
                            ]}];
                            const text = await callOpenAICompatible(key, 'https://api.openai.com/v1', 'gpt-4o-mini', messages, isJson ? { type: "json_object" } : undefined);
                            if (isJson) {
                                result = JSON.parse(text);
                                if (!result.title) throw new Error("Invalid metadata structure");
                            } else {
                                result = { report: text, prompt: text };
                            }
                        } catch (e) { lastError = e; }
                    }
                }
            } 
            // --- IMAGE HANDLING ---
            else {
                // ATTEMPT 1: OPENAI POOL (GPT-4o-MINI for Speed)
                for (const key of KEYS.OPENAI) {
                    if (result) break;
                    try {
                        const messages = [{ role: "user", content: [
                            { type: "text", text: promptText },
                            { type: "image_url", image_url: { url: `data:${payload.mimeType};base64,${payload.base64Data}` } }
                        ]}];
                        const text = await callOpenAICompatible(key, 'https://api.openai.com/v1', 'gpt-4o-mini', messages, isJson ? { type: "json_object" } : undefined);
                        if (isJson) {
                            result = JSON.parse(text);
                            if (!result.title) throw new Error("Invalid metadata structure");
                        } else {
                            result = { report: text, prompt: text };
                        }
                    } catch (e) { lastError = e; }
                }
                // ATTEMPT 2: GEMINI POOL (Backup)
                if (!result) {
                    for (const key of KEYS.GEMINI) {
                        if (result) break;
                        try {
                            const genAI = new GoogleGenerativeAI(key);
                            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                            const r = await model.generateContent([
                                promptText, 
                                { inlineData: { data: payload.base64Data, mimeType: payload.mimeType } }
                            ]);
                            const text = r.response.text();
                            if (isJson) {
                                result = cleanAndParseJSON(text);
                                if (!result.title) throw new Error("Invalid metadata structure");
                            } else {
                                result = { report: text, prompt: text };
                            }
                        } catch (e) { lastError = e; }
                    }
                }
            }
        }

        // === STRATEGY 1.5: ASSET TRACKER (SCRAPER) ===
        else if (action === 'track_asset') {
            const { url } = payload;
            if (!url || !url.includes('stock.adobe.com')) {
                throw new Error("Invalid URL. Please provide a valid Adobe Stock link.");
            }

            const resp = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            });

            if (!resp.ok) throw new Error("Failed to reach Adobe Stock. Check the URL.");
            const html = await resp.text();
            
            const downloadMatch = html.match(/"download_count":\s*(\d+)/) || html.match(/"num_downloads":\s*(\d+)/) || html.match(/"downloads":\s*(\d+)/);
            const viewMatch = html.match(/"view_count":\s*(\d+)/) || html.match(/"num_views":\s*(\d+)/);
            
            result = {
                downloads: downloadMatch ? parseInt(downloadMatch[1]) : null,
                views: viewMatch ? parseInt(viewMatch[1]) : null,
                foundData: !!(downloadMatch || viewMatch),
                message: downloadMatch ? "Data found successfully." : "Could not extract specific numbers."
            };
        }

        // === STRATEGY 2: TEXT PIPELINE (SUGGESTIONS / CHAT / RESEARCH) ===
        else if (['chat', 'market_research', 'suggest_keywords'].includes(action)) {
             let prompt = "";
             const isJson = action === 'suggest_keywords';

             if (action === 'market_research') prompt = `Research current trends for: "${payload.query}". Return clear, bulleted insights about what stock buyers want right now.`;
             if (action === 'chat') prompt = `Chat History: ${JSON.stringify(payload.history)}. Respond as a helpful assistant.`;
             
             if (action === 'suggest_keywords') {
                 prompt = `Return a JSON object with a key 'suggestions' containing 15 NEW, relevant keywords for:
                 Title: "${payload.title}"
                 Description: "${payload.description}"
                 Existing Tags: "${payload.currentKeywords}"`;
                 
                 if (payload.keywordStyle === 'Single') prompt += "\nCONSTRAINT: Generate SINGLE WORDS only. Exception: 'no people'.";
                 if (payload.keywordStyle === 'Phrases') prompt += "\nCONSTRAINT: Generate 2-WORD PHRASES only.";
                 if (payload.negativeKeywords) prompt += `\nNEGATIVE CONSTRAINT: Do NOT include: ${payload.negativeKeywords}`;
             }

             // 1. DEEPSEEK POOL
             for (const key of KEYS.DEEPSEEK) {
                 if (result) break;
                 try {
                     const text = await callOpenAICompatible(key, 'https://api.deepseek.com', 'deepseek-chat', [{role: 'user', content: prompt}], isJson ? { type: 'json_object' } : undefined);
                     result = isJson ? JSON.parse(text) : { content: text, message: text };
                 } catch (e) { lastError = e; }
             }

             // 2. OPENAI POOL
             if (!result) {
                 for (const key of KEYS.OPENAI) {
                     if (result) break;
                     try {
                         const text = await callOpenAICompatible(key, 'https://api.openai.com/v1', 'gpt-4o-mini', [{role: 'user', content: prompt}], isJson ? { type: 'json_object' } : undefined);
                         result = isJson ? JSON.parse(text) : { content: text, message: text };
                     } catch (e) { lastError = e; }
                 }
             }

             // 3. GEMINI POOL
             if (!result) {
                 for (const key of KEYS.GEMINI) {
                    if (result) break;
                    try {
                        const genAI = new GoogleGenerativeAI(key);
                        const r = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(prompt);
                        const text = r.response.text();
                        if (isJson) {
                            result = cleanAndParseJSON(text);
                        } else {
                            result = { content: text, message: text };
                        }
                    } catch (e) { lastError = e; }
                 }
             }
        }

        if (!result) throw new Error("All AI Providers failed.");

    } catch (finalError: any) {
        // === SAFETY REFUND ===
        // If the generation logic fails, we MUST refund the user immediately.
        if (cost > 0) {
            console.error("Critical Failure. Refunding...");
            const { data: currentProfile } = await supabaseAdmin.from('profiles').select('credits').eq('id', user.id).single();
            if (currentProfile) {
                await supabaseAdmin.from('profiles').update({ credits: currentProfile.credits + cost }).eq('id', user.id);
            }
        }
        return new Response(JSON.stringify({ error: `Generation Failed: ${lastError?.message || "Unknown error"}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});