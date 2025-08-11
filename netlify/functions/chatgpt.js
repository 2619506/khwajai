const fetch = require("node-fetch");

exports.handler = async function (event) {
  try {
    const { message } = JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Message is required" })
      };
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2", // ✅ using Kimi K2
        messages: [
          { role: "system", content: "You are a helpful AI assistant." },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    console.log("OpenRouter API response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: data.choices?.[0]?.message?.content || "⚠️ API returned no text"
      })
    };

  } catch (error) {
    console.error("Server error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
