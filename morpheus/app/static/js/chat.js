import API from "./api.js";
import { toast, escapeHtml, renderMarkdown } from "./app.js";

let _sessions = [];
let _activeSession = null;
let _models = [];
let _streaming = false;

export async function initChat() {
  await loadSessions();
  await loadModels();
  setupInputHandlers();
}

async function loadSessions() {
  try {
    _sessions = await API.chat.sessions();
    renderSessionList();
    if (_sessions.length > 0 && !_activeSession) {
      await selectSession(_sessions[0].id);
    } else if (_sessions.length === 0) {
      await newSession();
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadModels() {
  try {
    const models = await API.cookbook.models();
    _models = models.map(m => m.name || m.model || m);
  } catch {}

  const sel = document.getElementById("model-select");
  if (!sel) return;
  sel.innerHTML = "";
  const allModels = _models.length ? _models : ["llama3.2:3b", "llama3.1:8b", "mistral:7b", "gemma2:9b"];
  for (const m of allModels) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  }

  const providers = [
    { value: "gpt-4o", label: "GPT-4o (OpenAI)" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Anthropic)" },
  ];
  const sep = document.createElement("option");
  sep.disabled = true;
  sep.textContent = "── Remote ──";
  sel.appendChild(sep);
  for (const p of providers) {
    const opt = document.createElement("option");
    opt.value = p.value;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
}

function renderSessionList() {
  const list = document.getElementById("chat-session-list");
  if (!list) return;
  list.innerHTML = "";
  for (const s of _sessions) {
    const div = document.createElement("div");
    div.className = "chat-item" + (_activeSession?.id === s.id ? " active" : "");
    div.innerHTML = `<div class="chat-item-title">${escapeHtml(s.title)}</div>
      <div class="chat-item-date">${new Date(s.created_at).toLocaleDateString()}</div>`;
    div.addEventListener("click", () => selectSession(s.id));
    list.appendChild(div);
  }
}

async function selectSession(id) {
  try {
    const session = await API.chat.getSession(id);
    _activeSession = session;
    renderSessionList();
    renderMessages(session.messages);
  } catch (e) {
    toast(e.message, "error");
  }
}

function renderMessages(messages) {
  const container = document.getElementById("chat-messages");
  if (!container) return;
  container.innerHTML = "";
  for (const msg of messages) {
    appendMessage(msg.role, msg.content);
  }
  container.scrollTop = container.scrollHeight;
}

// Build a message group row with avatar + bubble
export function appendMessage(role, content) {
  const container = document.getElementById("chat-messages");
  if (!container) return null;

  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const initial = isUser ? "U" : isAssistant ? "M" : "S";

  const group = document.createElement("div");
  group.className = `msg-group ${role}`;

  const row = document.createElement("div");
  row.className = "msg-row";

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = initial;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = renderMarkdown(content);

  row.appendChild(avatar);
  row.appendChild(bubble);
  group.appendChild(row);

  const time = document.createElement("div");
  time.className = "msg-time";
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  group.appendChild(time);

  container.appendChild(group);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

// Wave typing indicator — 3 animated dots
function createTypingIndicator() {
  const container = document.getElementById("chat-messages");
  if (!container) return null;

  const group = document.createElement("div");
  group.className = "msg-group assistant";
  group.id = "typing-indicator-group";

  const row = document.createElement("div");
  row.className = "msg-row";

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = "M";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;

  row.appendChild(avatar);
  row.appendChild(bubble);
  group.appendChild(row);
  container.appendChild(group);
  container.scrollTop = container.scrollHeight;
  return group;
}

function removeTypingIndicator() {
  document.getElementById("typing-indicator-group")?.remove();
}

async function newSession() {
  try {
    const session = await API.chat.createSession({ title: "New Chat" });
    _sessions.unshift(session);
    _activeSession = { ...session, messages: [] };
    renderSessionList();
    renderMessages([]);
  } catch (e) {
    toast(e.message, "error");
  }
}

function setupInputHandlers() {
  const newBtn = document.getElementById("chat-new-btn");
  if (newBtn) newBtn.addEventListener("click", newSession);

  const sendBtn = document.getElementById("chat-send-btn");
  if (sendBtn) sendBtn.addEventListener("click", sendMessage);

  const input = document.getElementById("chat-input");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 200) + "px";
    });
  }

  const deleteBtn = document.getElementById("chat-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!_activeSession || !confirm("Delete this chat?")) return;
      await API.chat.deleteSession(_activeSession.id);
      _sessions = _sessions.filter(s => s.id !== _activeSession.id);
      _activeSession = null;
      renderSessionList();
      if (_sessions.length) await selectSession(_sessions[0].id);
      else await newSession();
    });
  }
}

async function sendMessage() {
  if (_streaming) return;
  const input = document.getElementById("chat-input");
  const modelSel = document.getElementById("model-select");
  const agentToggle = document.getElementById("agent-toggle");

  const content = input?.value.trim();
  if (!content || !_activeSession) return;

  const model = modelSel?.value || "llama3.2:3b";
  const useAgent = agentToggle?.checked || false;

  input.value = "";
  if (input) input.style.height = "auto";

  appendMessage("user", content);

  // Show wave typing indicator while waiting for first token
  createTypingIndicator();

  _streaming = true;
  let accumulated = "";
  let assistantBubble = null;

  try {
    const provider = _getProvider(model);
    const streamFn = useAgent
      ? (cb) => API.chat.runAgent({ message: content, model, provider }, cb)
      : (cb) => API.chat.sendMessage(_activeSession.id, { content, model, provider }, cb);

    await streamFn((chunk) => {
      accumulated += chunk.content || "";

      // Replace typing indicator with the real bubble on first chunk
      if (!assistantBubble) {
        removeTypingIndicator();
        assistantBubble = appendMessage("assistant", accumulated);
      } else {
        assistantBubble.innerHTML = renderMarkdown(accumulated);
      }

      const container = document.getElementById("chat-messages");
      if (container) container.scrollTop = container.scrollHeight;
    });
  } catch (e) {
    removeTypingIndicator();
    if (!assistantBubble) assistantBubble = appendMessage("assistant", "");
    assistantBubble.innerHTML = `<span style="color:var(--red)">${escapeHtml(e.message)}</span>`;
    toast(e.message, "error");
  } finally {
    removeTypingIndicator(); // safety — in case stream was empty
    _streaming = false;
  }
}

function _getProvider(model) {
  if (model.startsWith("gpt-")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  return "ollama";
}
