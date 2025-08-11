// netlify/functions/chatgpt.js
const fetch = require("node-fetch"); // v2.x for Netlify functions

exports.handler = async (event) => {
  try {
    // Allow only POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "POST method required" })
      };
    }

    // Get message from request
    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No message provided" })
      };
    }

    // Ensure API key exists
    if (!process.env.MOONSHOT_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing MOONSHOT_API_KEY in environment variables" })
      };
    }

    // Call Moonshot Kimi API
    const aiRes = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MOONSHOT_API_KEY}`
      },
      body: JSON.stringify({
        model: "moonshot-v1-8k", // free model
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
