import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { prompt, aspectRatio } = await req.json();

    if (!REPLICATE_API_TOKEN) {
       // Allow the frontend simulation to catch this
       throw new Error("Missing Server API Key");
    }

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "flux-dev-version-hash-here", // You'll paste the specific hash for Flux Dev
        input: { 
            prompt, 
            aspect_ratio: aspectRatio,
            disable_safety_checker: true 
        }
      }),
    });
    
    // ... polling logic would go here ... 
    // For now, let's stick to the simulation in the frontend until you deploy this.

    const result = await response.json();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});