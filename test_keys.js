require('dotenv').config(); // Load your .env file
const OpenAI = require('openai');

// List your keys from the environment variables
const apiKeys = [
    { name: "KEY_1", key: process.env.OPENAI_API_KEY },
    { name: "KEY_2", key: process.env.OPENAI_API_KEY_2 },
    { name: "KEY_3", key: process.env.OPENAI_API_KEY_3 }
];

async function testKeys() {
    console.log("🔍 Starting API Key Diagnostics...\n");

    for (const keyData of apiKeys) {
        if (!keyData.key) {
            console.log(`❌ ${keyData.name}: Missing in .env file`);
            continue;
        }

        const openai = new OpenAI({ apiKey: keyData.key });
        const start = Date.now();

        try {
            // We send a tiny prompt to minimize cost and isolate connection speed
            await openai.chat.completions.create({
                model: "gpt-3.5-turbo", // Use a fast model for the ping test
                messages: [{ role: "user", content: "Ping" }],
                max_tokens: 5
            });

            const duration = (Date.now() - start) / 1000; // Time in seconds
            
            // Color-coded feedback based on speed
            let speedStatus = "⚡ FAST";
            if (duration > 2.0) speedStatus = "⚠️ SLOW";
            if (duration > 5.0) speedStatus = "🐌 VERY SLOW";

            console.log(`✅ ${keyData.name}: Working | Time: ${duration.toFixed(2)}s | Status: ${speedStatus}`);

        } catch (error) {
            console.log(`❌ ${keyData.name}: FAILED`);
            console.log(`   Error: ${error.message}`);
            
            // specific check for Quota/Billing issues
            if (error.code === 'insufficient_quota') {
                console.log("   -> CAUSE: You have run out of credits on this key.");
            }
        }
    }
    console.log("\nDiagnostics Complete.");
}

testKeys();