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
      max-width: 900px;
      margin: auto;
      margin-top: 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    footer {
      text-align: center;
      padding: 10px;
      background-color: #222;
      color: white;
      position: fixed;
      bottom: 0;
      width: 100%;
    }
    /* Floating chat styles */
    #chat-widget {
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 300px;
      max-height: 400px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 999;
    }
    #chat-header {
      background: #444;
      color: white;
      padding: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #chat-box {
      flex: 1;
      padding: 10px;
      overflow-y: auto;
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
      margin-left: auto;
    }
    .ai {
      background: #e2e3e5;
      margin-right: auto;
    }
    #chat-input {
      display: flex;
      gap: 5px;
      padding: 10px;
      background: #f4f4f4;
    }
    #chat-input input {
      flex: 1;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    #chat-input button {
      padding: 8px 12px;
      background: #444;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    #chat-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #444;
      color: white;
      padding: 12px 16px;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    @media (max-width: 500px) {
      #chat-widget {
        width: 95%;
        right: 2.5%;
        bottom: 70px;
        max-height: 70%;
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
    <p>Welcome to my AI-powered journey! Click the chat bubble at the bottom to talk with my AI assistant.</p>
  </section>

  <footer>
    <p>© 2025 Khwajai. All rights reserved.</p>
  </footer>

  <!-- Floating Chat Widget -->
  <div id="chat-widget">
    <div id="chat-header">
      <span>AI Assistant</span>
      <button onclick="toggleChat()" style="background:none;border:none;color:white;cursor:pointer;">✖</button>
    </div>
    <div id="chat-box"></div>
    <div id="chat-input">
      <input type="text" id="userMessage" placeholder="Type a message..." />
      <button onclick="sendMessage()">Send</button>
    </div>
  </div>

  <!-- Floating Chat Button -->
  <div id="chat-toggle" onclick="toggleChat()">💬</div>

  <script>
    function toggleChat() {
      const chatWidget = document.getElementById("chat-widget");
      chatWidget.style.display = (chatWidget.style.display === "flex") ? "none" : "flex";
    }

    async function sendMessage() {
      const input = document.getElementById("userMessage");
      const message = input.value.trim();
      if (!message) return;

      addMessage(message, "user");
      input.value = "";

      try {
        const res = await fetch("/.netlify/functions/chatgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (data.reply) {
          addMessage(data.reply, "ai");
        } else {
          addMessage("Error: " + JSON.stringify(data), "ai");
        }
      } catch (err) {
        addMessage("Error: " + err.message, "ai");
      }
    }

    function addMessage(text, sender) {
      const chatBox = document.getElementById("chat-box");
      const msgDiv = document.createElement("div");
      msgDiv.className = "msg " + sender;
      msgDiv.textContent = text;
      chatBox.appendChild(msgDiv);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Allow Enter key to send message
    document.getElementById("userMessage").addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  </script>

</body>
</html>
