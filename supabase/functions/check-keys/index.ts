// File: supabase/functions/check-keys/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // 1. Define all keys to check from your Secrets
  const keysToCheck = [
    // OpenAI Keys
    { provider: "OpenAI", name: "OPENAI_API_KEY",   value: Deno.env.get("OPENAI_API_KEY") },
    { provider: "OpenAI", name: "OPENAI_API_KEY_2", value: Deno.env.get("OPENAI_API_KEY_2") },
    { provider: "OpenAI", name: "OPENAI_API_KEY_3", value: Deno.env.get("OPENAI_API_KEY_3") },
    
    // Google Gemini Keys
    { provider: "Gemini", name: "GEMINI_API_KEY",   value: Deno.env.get("GEMINI_API_KEY") },
    { provider: "Gemini", name: "GEMINI_API_KEY_2", value: Deno.env.get("GEMINI_API_KEY_2") },
    { provider: "Gemini", name: "GEMINI_API_KEY_3", value: Deno.env.get("GEMINI_API_KEY_3") },
  ];

  const report = [];
  console.log("🔍 Starting Full Key Diagnostic...");

  for (const keyData of keysToCheck) {
    // Check if key exists in Secrets
    if (!keyData.value) {
      report.push({ 
        key: keyData.name, 
        provider: keyData.provider,
        status: "❌ MISSING", 
        error: "Key not found in Supabase Secrets" 
      });
      continue;
    }

    const start = Date.now();
    let success = false;
    let errorMessage = "Unknown Error";

    try {
      let response;
      
      // --- OPENAI TEST ---
      if (keyData.provider === "OpenAI") {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${keyData.value}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo", // Fast model for ping
            messages: [{ role: "user", content: "Ping" }],
            max_tokens: 1,
          }),
        });
      } 
      
      // --- GEMINI TEST ---
      else if (keyData.provider === "Gemini") {
        // We use gemini-1.5-flash because it is the fastest/cheapest for testing
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${keyData.value}`;
        
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Ping" }] }]
          }),
        });
      }

      // Check result
      if (response && response.ok) {
        success = true;
      } else {
        const errorData = await response.json();
        // Normalize error messages between Google and OpenAI
        errorMessage = errorData.error?.message || errorData.error?.status || JSON.stringify(errorData);
      }

    } catch (err) {
      errorMessage = err.message;
    }

    const duration = (Date.now() - start) / 1000; // Seconds

    // Format the output
    if (success) {
      let speedRating = "⚡ FAST";
      if (duration > 1.5) speedRating = "⚠️ SLOW";
      if (duration > 4.0) speedRating = "🐌 VERY SLOW";

      report.push({ 
        key: keyData.name, 
        provider: keyData.provider,
        status: "✅ WORKING", 
        latency: `${duration.toFixed(2)}s`, 
        speed_rating: speedRating 
      });
    } else {
      report.push({ 
        key: keyData.name, 
        provider: keyData.provider,
        status: "❌ FAILED", 
        error: errorMessage 
      });
    }
  }

  return new Response(JSON.stringify(report, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});