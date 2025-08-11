const fetch = require("node-fetch"); // v2 for Netlify CJS functions

exports.handler = async (event) => {
  try {
    // Allow only POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "POST method required" })
      };
    }

    // Parse request
    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No message provided" })
      };
    }

    // Check API key
    if (!process.env.OPENROUTER_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OPENROUTER_API_KEY in environment variables" })
      };
    }

    // Call OpenRouter with DeepSeek R1 0528
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://khwajai.netlify.app", // your site
        "X-Title": "Khwajai Assistant"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1:free",
        messages: [
          { role: "system", content: "You are Khwajai's helpful AI assistant." },
          { role: "user", content: message }
        ],
        max_tokens: 300
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return { statusCode: aiRes.status, body: errText };
    }

    const data = await aiRes.json();
    const reply = data.choices?.[0]?.message?.content || "No reply from AI";

    return {
      statusCode: 200,
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
