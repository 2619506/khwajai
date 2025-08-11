const fetch = require("node-fetch"); // Must use v2 for Netlify CJS functions

exports.handler = async (event) => {
  try {
    // Allow only POST requests
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

    // Ensure API key is available
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OpenAI API key not set in environment variables" })
      };
    }

    // Call OpenAI API
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
        max_tokens: 300
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return {
        statusCode: openaiRes.status,
        body: JSON.stringify({ error: errText })
      };
    }

    const data = await openaiRes.json();
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
