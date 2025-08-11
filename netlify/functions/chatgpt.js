// netlify/functions/chatgpt.js
const fetch = require("node-fetch"); // Must be v2.x for Netlify CJS

exports.handler = async (event) => {
  try {
    // Only allow POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "POST method required" })
      };
    }

    // Parse request body
    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No message provided" })
      };
    }

    // Ensure API key exists
    if (!process.env.OPENROUTER_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OPENROUTER_API_KEY in environment variables" })
      };
    }

    // Call OpenRouter API
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://your-site.netlify.app", // Replace with your actual site URL
        "X-Title": "Khwajai AI Assistant"
      },
      body: JSON.stringify({
        model: "openchat/openchat-7b", // You can swap to another model if you want
        messages: [{ role: "user", content: message }],
        max_tokens: 300
      })
    });

    const data = await aiRes.json();

    if (data.error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.error.message || "Unknown API error" })
      };
    }

    const reply = data.choices?.[0]?.message?.content || "No response from AI.";

    return {
      statusCode: 200,
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
