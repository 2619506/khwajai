const fetch = require("node-fetch"); // v2 for Netlify CJS

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

    // Read API key from your Netlify env var 'khwajai'
    const apiKey = process.env.khwajai;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing khwajai API key in environment variables" })
      };
    }

    // Call OpenRouter API (DeepSeek R1 0528 free)
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1:free",
        messages: [{ role: "user", content: message }],
        max_tokens: 300
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return {
        statusCode: aiRes.status,
        body: JSON.stringify({ error: errText })
      };
    }

    const data = await aiRes.json();
    const reply = data.choices?.[0]?.message?.content || "No reply from AI";

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
