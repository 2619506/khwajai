const fetch = require("node-fetch"); // v2 for Netlify CJS

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "POST method required" }) };
    }

    const { message } = JSON.parse(event.body || "{}");
    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: "No message provided" }) };
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENROUTER_API_KEY" }) };
    }

    const apiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct", // stable free model
        messages: [{ role: "user", content: message }],
        max_tokens: 300
      })
    });

    const data = await apiRes.json();
    console.log("OpenRouter Response:", data);

    if (!apiRes.ok) {
      return { statusCode: apiRes.status, body: JSON.stringify({ error: data }) };
    }

    const reply = data.choices?.[0]?.message?.content || "No reply from AI";
    return { statusCode: 200, body: JSON.stringify({ reply }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
