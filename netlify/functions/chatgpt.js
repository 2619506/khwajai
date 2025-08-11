// netlify/functions/chatgpt.js
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const { message } = JSON.parse(event.body);

    const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MOONSHOT_API_KEY}`
      },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        messages: [{ role: "user", content: message }],
      })
    });

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ reply: data.choices[0].message.content })
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({ reply: "No response from AI." })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ reply: "Server error: " + error.message })
    };
  }
};
