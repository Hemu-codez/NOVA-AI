// ============================================================
//  Nova AI Chatbot — script.js
//  Features: Gemini API, localStorage, rename conversations
//
//  SETUP: Replace the API_KEY value below with your key
//  from https://aistudio.google.com/apikey
// ============================================================

const API_KEY = "api key"; // <-- Paste your key here

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

// ── State ──────────────────────────────────────────────────
let conversationHistory = []; // Current chat messages
let isLoading = false;        // Prevents double sending
let currentChatId = null;     // ID of the active chat

// ── localStorage Helpers ───────────────────────────────────

// Returns all saved chats as an array
function getAllChats() {
  return JSON.parse(localStorage.getItem("nova_chats") || "[]");
}

// Saves the full chats array back to localStorage
function saveAllChats(chats) {
  localStorage.setItem("nova_chats", JSON.stringify(chats));
}

// Saves/updates the current active chat in localStorage
function saveCurrentChat() {
  if (!currentChatId || conversationHistory.length === 0) return;

  const chats = getAllChats();
  const index = chats.findIndex(c => c.id === currentChatId);

  if (index !== -1) {
    chats[index].history = conversationHistory;
    chats[index].updatedAt = Date.now();
  }

  saveAllChats(chats);
}

// Creates a brand new chat entry in localStorage
function createNewChatEntry(title) {
  const id = "chat_" + Date.now();
  const newChat = {
    id,
    title,
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const chats = getAllChats();
  chats.unshift(newChat); // Add to top of list
  saveAllChats(chats);
  return id;
}

// ── DOM References ─────────────────────────────────────────
const messagesContainer = document.getElementById("messagesContainer");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const headerTitle = document.getElementById("headerTitle");
const historyList = document.getElementById("historyList");

// ── On Page Load ───────────────────────────────────────────
window.addEventListener("load", () => {
  renderSidebar(); // Load all past chats into sidebar
});

// ── Render Sidebar ─────────────────────────────────────────
function renderSidebar() {
  const chats = getAllChats();
  historyList.innerHTML = "";

  if (chats.length === 0) {
    historyList.innerHTML = `<li style="color: var(--text4); font-size:12px; padding: 8px 12px; cursor:default;">No past chats yet</li>`;
    return;
  }

  chats.forEach(chat => {
    const li = document.createElement("li");
    li.dataset.id = chat.id;
    li.title = "Click to open · Double-click to rename";
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.gap = "6px";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = chat.title;
    titleSpan.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

    li.appendChild(titleSpan);

    // Highlight active chat
    if (chat.id === currentChatId) {
      li.style.background = "var(--surface2)";
      li.style.borderColor = "var(--border)";
      li.style.color = "var(--text2)";
    }

    // Single click — load this chat
    li.addEventListener("click", () => loadChat(chat.id));

    // Double click — rename this chat
    li.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(li, chat.id);
    });

    historyList.appendChild(li);
  });
}

// ── Load a Past Chat ───────────────────────────────────────
function loadChat(id) {
  const chats = getAllChats();
  const chat = chats.find(c => c.id === id);
  if (!chat) return;

  currentChatId = id;
  conversationHistory = chat.history;
  headerTitle.textContent = chat.title;
  messagesContainer.innerHTML = "";

  if (chat.history.length === 0) {
    messagesContainer.innerHTML = getWelcomeHTML();
    return;
  }

  // Re-render all messages from history
  chat.history.forEach(msg => {
    const role = msg.role === "user" ? "user" : "bot";
    appendMessage(role, msg.parts[0].text);
  });

  renderSidebar();
  scrollToBottom();
}

// ── Rename a Chat ──────────────────────────────────────────
function startRename(li, id) {
  const currentTitle = li.querySelector("span").textContent;

  li.innerHTML = "";
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentTitle;
  input.style.cssText = `
    flex: 1; background: var(--surface); border: 1px solid var(--accent2);
    border-radius: 6px; padding: 3px 8px; font-size: 13px;
    color: var(--text); font-family: var(--font-body); outline: none;
    width: 100%; box-shadow: var(--shadow-neon);
  `;
  li.appendChild(input);
  input.focus();
  input.select();

  const saveRename = () => {
    const newTitle = input.value.trim() || currentTitle;
    applyRename(id, newTitle);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveRename();
    if (e.key === "Escape") applyRename(id, currentTitle);
  });
  input.addEventListener("blur", saveRename);
}

function applyRename(id, newTitle) {
  const chats = getAllChats();
  const index = chats.findIndex(c => c.id === id);
  if (index !== -1) {
    chats[index].title = newTitle;
    saveAllChats(chats);
  }

  if (id === currentChatId) {
    headerTitle.textContent = newTitle;
  }

  renderSidebar();
}

// ── Send Message ───────────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  // Remove welcome screen on first message
  const welcome = document.getElementById("welcomeScreen");
  if (welcome) welcome.remove();

  // Create new chat entry on first message
  if (conversationHistory.length === 0) {
    const title = text.length > 32 ? text.slice(0, 32) + "…" : text;
    currentChatId = createNewChatEntry(title);
    headerTitle.textContent = title;
    renderSidebar();
  }

  appendMessage("user", text);
  conversationHistory.push({ role: "user", parts: [{ text }] });

  userInput.value = "";
  userInput.style.height = "auto";

  const typingEl = showTyping();
  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: `You are Nova, a friendly and helpful AI assistant.
            You are Nova, a smart, confident, and slightly witty AI assistant.
            You help users with coding, learning, and productivity.
            Keep responses clear, helpful, and modern.
            Use a friendly but intelligent tone.
            Be concise but thorough. Use a warm, conversational tone.
            Format responses clearly — use bullet points or line breaks
            when listing multiple items. Never say you're made by Google;
            just say you're Nova.`
          }]
        },
        contents: conversationHistory,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
      || "Sorry, I couldn't generate a response. Please try again.";

    conversationHistory.push({ role: "model", parts: [{ text: reply }] });
    typingEl.remove();
    appendMessage("bot", reply);

    // Save to localStorage after every reply
    saveCurrentChat();

  } catch (error) {
    typingEl.remove();
    appendMessage("bot", `⚠️ Error: ${error.message}. Check your API key and try again.`);
    console.error("Gemini API error:", error);
  }

  setLoading(false);
  scrollToBottom();
}

// ── Append Message Bubble ──────────────────────────────────
function appendMessage(role, text) {
  const msgEl = document.createElement("div");
  msgEl.classList.add("message", role);

  const avatar = document.createElement("div");
  avatar.classList.add("avatar", role === "bot" ? "bot" : "user-av");
  avatar.textContent = role === "bot" ? "N" : "U";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.innerHTML = formatText(text);

  msgEl.appendChild(avatar);
  msgEl.appendChild(bubble);
  messagesContainer.appendChild(msgEl);
  scrollToBottom();
}

// ── Format Text (basic markdown) ──────────────────────────
function formatText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

// ── Typing Indicator ───────────────────────────────────────
function showTyping() {
  const msgEl = document.createElement("div");
  msgEl.classList.add("message", "bot");

  const avatar = document.createElement("div");
  avatar.classList.add("avatar", "bot");
  avatar.textContent = "N";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;

  msgEl.appendChild(avatar);
  msgEl.appendChild(bubble);
  messagesContainer.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

// ── Welcome Screen HTML ────────────────────────────────────
function getWelcomeHTML() {
  return `
    <div class="welcome-screen" id="welcomeScreen">
      <div class="welcome-orb">✦</div>
      <h1 class="welcome-title">Hello, I'm <span>Nova</span> ✨</h1>
      <p class="welcome-sub">Your AI assistant. Ask me anything.</p>
      <div class="suggestions">
        <button class="suggestion-chip" onclick="useSuggestion(this)">What can you help me with?</button>
        <button class="suggestion-chip" onclick="useSuggestion(this)">Write me a short poem</button>
        <button class="suggestion-chip" onclick="useSuggestion(this)">Explain quantum computing simply</button>
        <button class="suggestion-chip" onclick="useSuggestion(this)">Give me 5 productivity tips</button>
      </div>
    </div>`;
}

// ── New Chat ───────────────────────────────────────────────
function newChat() {
  saveCurrentChat();
  conversationHistory = [];
  currentChatId = null;
  headerTitle.textContent = "New Conversation";
  userInput.value = "";
  userInput.style.height = "auto";
  messagesContainer.innerHTML = getWelcomeHTML();
  renderSidebar();
}

// ── Suggestion Chips ───────────────────────────────────────
function useSuggestion(btn) {
  userInput.value = btn.textContent;
  sendMessage();
}

// ── Sidebar Toggle (mobile) ────────────────────────────────
function toggleSidebar() {
  document.querySelector(".sidebar").classList.toggle("open");
}

// ── Helpers ───────────────────────────────────────────────
function handleKey(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

function setLoading(state) {
  isLoading = state;
  sendBtn.disabled = state;
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}