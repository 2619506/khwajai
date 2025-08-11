const fetch = require("node-fetch");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST method required" }) };
  }

  const { message } = JSON.parse(event.body || "{}");
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: "No message provided" }) };
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing API key" }) };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openchat/openchat-7b",
        messages: [{ role: "user", content: message }],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      return { statusCode: response.status, body: await response.text() };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No reply";
    return { statusCode: 200, body: JSON.stringify({ reply }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
