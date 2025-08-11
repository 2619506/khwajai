// netlify/functions/chatgpt.js
const fetch = require("node-fetch"); // v2 for Netlify CJS

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "POST method required" })
      };
    }

    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No message provided" })
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OpenAI API key not set" })
      };
    }

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

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return {
        statusCode: openaiRes.status,
        body: JSON.stringify({ error: data.error?.message || "OpenAI API error" })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: data.choices?.[0]?.message?.content || "No reply" })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
