import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();

    if (!url || !url.includes('stock.adobe.com')) {
      throw new Error("Invalid URL. Please provide a valid Adobe Stock link.");
    }

    // --- SMART FIX: EXTRACT ASSET ID ---
    // The user might paste a search link or contributor link. We need the raw Asset ID.
    // Example: ...?asset_id=1649546036 OR .../images/title/1649546036
    let assetId = null;
    
    // Pattern 1: Look for "asset_id=" param
    const idParamMatch = url.match(/asset_id=(\d+)/);
    if (idParamMatch) {
        assetId = idParamMatch[1];
    } else {
        // Pattern 2: Look for the last number in the path
        const pathNumbers = url.match(/\/(\d+)(?:\?|$)/);
        if (pathNumbers) assetId = pathNumbers[1];
    }

    // If we found an ID, construct the "Canonical" URL (The one that always has data)
    // If not, use the original URL and hope for the best.
    const targetUrl = assetId ? `https://stock.adobe.com/images/${assetId}` : url;

    console.log(`Processing: ${url}`);
    console.log(`Targeting Canonical URL: ${targetUrl}`);

    // 1. Fetch the HTML
    const resp = await fetch(targetUrl, {
      headers: {
        // Use a generic browser User-Agent to avoid being blocked
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!resp.ok) {
        // If Adobe blocks us (403), return a specific message
        if (resp.status === 403) throw new Error("Adobe Stock blocked the connection. Please try again in a few seconds.");
        throw new Error(`Failed to load page (Status: ${resp.status})`);
    }

    const html = await resp.text();

    // 2. SCRAPING MAGIC V2 (More Robust)
    // We look for specific patterns Adobe uses in the source code
    
    // Pattern A: Standard Metadata block
    let downloadMatch = html.match(/"download_count":\s*(\d+)/) || 
                        html.match(/"num_downloads":\s*(\d+)/) ||
                        html.match(/"downloads":\s*(\d+)/);

    let viewMatch = html.match(/"view_count":\s*(\d+)/) || 
                    html.match(/"num_views":\s*(\d+)/) ||
                    html.match(/"views":\s*(\d+)/);

    // Pattern B: Fallback (Sometimes it's inside a JSON structure)
    if (!downloadMatch) {
         // Look for the "content-media-download-count" CSS class or data attribute
         // This is a rough fallback regex
         const rawTextMatch = html.match(/Downloads.*?(\d{1,3}(?:,\d{3})*)/); 
         if (rawTextMatch) {
             // Create a fake match object with the number cleaned up
             downloadMatch = [rawTextMatch[0], rawTextMatch[1].replace(/,/g, '')];
         }
    }

    const result = {
      downloads: downloadMatch ? parseInt(downloadMatch[1]) : null,
      views: viewMatch ? parseInt(viewMatch[1]) : null,
      foundData: !!(downloadMatch || viewMatch),
      message: downloadMatch ? "Success" : "Could not retrieve hidden data. Adobe may have updated their security."
    };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Tracker Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});