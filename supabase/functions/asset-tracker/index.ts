import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { url } = await req.json();

    if (!url || !url.includes('stock.adobe.com')) {
      throw new Error("Invalid URL. Please provide a valid Adobe Stock link.");
    }

    // 1. Fetch the HTML with a real browser User-Agent
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!resp.ok) throw new Error("Failed to reach Adobe Stock. Check the URL.");
    const html = await resp.text();

    // 2. SCRAPING MAGIC: Look for the hidden data
    // Adobe typically uses "content-media-download-count" or hidden JSON structures
    const downloadMatch = html.match(/"download_count":\s*(\d+)/) || 
                          html.match(/"num_downloads":\s*(\d+)/) ||
                          html.match(/"downloads":\s*(\d+)/);

    const viewMatch = html.match(/"view_count":\s*(\d+)/) || 
                      html.match(/"num_views":\s*(\d+)/);

    const result = {
      downloads: downloadMatch ? parseInt(downloadMatch[1]) : null,
      views: viewMatch ? parseInt(viewMatch[1]) : null,
      foundData: !!(downloadMatch || viewMatch),
      message: downloadMatch ? "Data found successfully." : "Could not extract specific numbers. Adobe may have changed their code."
    };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});