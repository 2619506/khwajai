const fetch = require("node-fetch");

exports.handler = async function(event) {
  try {
    const { message } = JSON.parse(event.body);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2", // ✅ updated to Moonshot Kimi K2
        messages: [
          { role: "system", content: "You are a helpful AI assistant." },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: data.choices?.[0]?.message?.content || "No reply from AI"
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
