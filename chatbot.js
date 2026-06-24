const conversation = [];
let requestInProgress = false;

const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const CHAT_API_URL = isLocalDevelopment
  ? "/api/chat"
  : "https://ek-nai-pehchaan-api.onrender.com/api/chat";

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const chatBox = document.getElementById("chat-box");
  const sendButton = document.querySelector("#chat-window .send-btn");
  const userText = input.value.trim();

  if (!userText || requestInProgress) return;

  appendMessage("user-msg", userText);
  conversation.push({ role: "user", content: userText });
  input.value = "";

  requestInProgress = true;
  input.disabled = true;
  sendButton.disabled = true;

  const waitingMessage = appendMessage("bot-msg", "Thinking...");

  try {
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation.slice(-10) })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The assistant could not answer.");
    }

    waitingMessage.textContent = data.reply;
    conversation.push({ role: "assistant", content: data.reply });
  } catch (error) {
    console.error("Chat request failed:", error);
    waitingMessage.textContent =
      "The online assistant is temporarily unavailable. Please try again shortly.";
    waitingMessage.style.color = "#b91c1c";
  } finally {
    requestInProgress = false;
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

function appendMessage(className, text) {
  const chatBox = document.getElementById("chat-box");
  const message = document.createElement("div");
  message.className = className;
  message.textContent = text;
  chatBox.appendChild(message);
  chatBox.scrollTop = chatBox.scrollHeight;
  return message;
}
