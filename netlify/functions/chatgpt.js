// netlify/functions/chatgpt.js

const fetch = require("node-fetch"); // v2 required for Netlify CJS functions

exports.handler = async (event) => {
  try {
    // ✅ Only accept POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "POST method required" })
      };
    }

    // ✅ Parse incoming JSON
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (err) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body" })
      };
    }

    const { message } = body;
    if (!message || !message.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No message provided" })
      };
    }

    // ✅ Check API key
    if (!process.env.MOONSHOT_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing MOONSHOT_API_KEY in environment" })
      };
    }

    // ✅ Call Moonshot Kimi API
    const apiRes = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MOONSHOT_API_KEY}`
      },
      body: JSON.stringify({
        model: "kimi-k2", // Your free Moonshot model
        messages: [{ role: "user", content: message }],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return {
        statusCode: apiRes.status,
        body: JSON.stringify({ error: errText })
      };
    }

    const data = await apiRes.json();
    const reply = data?.choices?.[0]?.message?.content || "No reply from AI";

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
