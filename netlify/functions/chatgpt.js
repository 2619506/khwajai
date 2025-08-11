<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Khwajai | Home</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #f4f4f4;
    }
    header {
      background-color: #222;
      color: white;
      padding: 10px 0;
      text-align: center;
    }
    nav {
      display: flex;
      justify-content: center;
      background-color: #444;
      flex-wrap: wrap;
    }
    nav a {
      color: white;
      padding: 14px 20px;
      text-decoration: none;
      text-align: center;
    }
    nav a:hover {
      background-color: #555;
    }
    section {
      padding: 20px;
      background: white;
      max-width: 900px;
      margin: auto;
      margin-top: 20px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    footer {
      text-align: center;
      padding: 10px;
      background-color: #222;
      color: white;
      margin-top: 20px;
    }
    /* Chat widget styles */
    #chat-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      max-width: 90%;
      box-shadow: 0 0 10px rgba(0,0,0,0.2);
      border-radius: 10px;
      overflow: hidden;
      background: white;
      display: flex;
      flex-direction: column;
    }
    #chat-header {
      background: #444;
      color: white;
      padding: 10px;
      cursor: pointer;
      font-weight: bold;
    }
    #chat-body {
      display: none;
      flex-direction: column;
      height: 350px;
    }
    #chat-box {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      background: #fafafa;
    }
    .msg {
      margin: 5px 0;
      padding: 8px;
      border-radius: 6px;
      max-width: 80%;
      word-wrap: break-word;
    }
    .user {
      background: #d1e7dd;
      align-self: flex-end;
    }
    .ai {
      background: #e2e3e5;
      align-self: flex-start;
    }
    #chat-input {
      display: flex;
      gap: 5px;
      padding: 8px;
      border-top: 1px solid #ccc;
      background: white;
    }
    #chat-input input {
      flex: 1;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
    }
    #chat-input button {
      padding: 8px 12px;
      border: none;
      background: #444;
      color: white;
      border-radius: 4px;
      cursor: pointer;
    }
    #chat-input button:hover {
      background: #333;
    }
    @media (max-width: 600px) {
      section {
        margin: 10px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Welcome to Khwajai</h1>
    <p>AI-Powered projects for the Business and Finance World</p>
  </header>

  <nav>
    <a href="#">Home</a>
    <a href="#">Projects</a>
    <a href="#">About</a>
    <a href="#">Contact</a>
  </nav>

  <section>
    <h2>Home</h2>
    <p>This is the home section. Welcome to my AI-powered journey!</p>
  </section>

  <!-- Chat widget -->
  <div id="chat-widget">
    <div id="chat-header" onclick="toggleChat()">💬 AI Assistant</div>
    <div id="chat-body">
      <div id="chat-box"></div>
      <div id="chat-input">
        <input type="text" id="userMessage" placeholder="Type your message..." />
        <button onclick="sendMessage()">Send</button>
      </div>
    </div>
  </div>

  <footer>
    <p>© 2025 Khwajai. All rights reserved.</p>
  </footer>

  <script>
    function toggleChat() {
      const chatBody = document.getElementById("chat-body");
      chatBody.style.display = chatBody.style.display === "flex" ? "none" : "flex";
    }

    async function sendMessage() {
      const input = document.getElementById("userMessage");
      const message = input.value.trim();
      if (!message) return;

      appendMessage(message, "user");
      input.value = "";

      try {
        const res = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message })
        });

        const data = await res.json();
        if (res.ok) {
          appendMessage(data.reply || "⚠️ No reply from AI", "ai");
        } else {
          appendMessage("❌ Error: " + (data.error?.message || JSON.stringify(data.error)), "ai");
        }
      } catch (err) {
        appendMessage("🚨 Error: " + err.message, "ai");
      }
    }

    function appendMessage(text, sender) {
      const box = document.getElementById("chat-box");
      const msgDiv = document.createElement("div");
      msgDiv.className = "msg " + sender;
      msgDiv.textContent = text;
      box.appendChild(msgDiv);
      box.scrollTop = box.scrollHeight;
    }

    document.getElementById("userMessage").addEventListener("keypress", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  </script>
</body>
</html>
