import API from "../api.js";
import { toast, escapeHtml, showModal, closeModal } from "../app.js";

let _accounts = [];
let _activeAccount = null;
let _messages = [];

export async function initEmail() {
  await loadAccounts();
  document.getElementById("email-add-account-btn")?.addEventListener("click", () => showModal("add-account-modal"));
  document.getElementById("email-fetch-btn")?.addEventListener("click", fetchMessages);
  document.getElementById("email-triage-btn")?.addEventListener("click", triageInbox);

  document.getElementById("add-account-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = ["email", "imap_host", "imap_port", "smtp_host", "smtp_port", "password", "label"];
    const body = {};
    for (const f of fields) {
      const el = document.getElementById(`account-${f}`);
      if (el) body[f] = el.value;
    }
    body.imap_port = parseInt(body.imap_port) || 993;
    body.smtp_port = parseInt(body.smtp_port) || 587;
    try {
      const acc = await API.email.addAccount(body);
      _accounts.push(acc);
      renderAccounts();
      closeModal("add-account-modal");
      toast("Account added", "success");
    } catch (err) { toast(err.message, "error"); }
  });
}

async function loadAccounts() {
  try {
    _accounts = await API.email.accounts();
    renderAccounts();
    if (_accounts.length) selectAccount(_accounts[0]);
  } catch (e) { toast(e.message, "error"); }
}

function renderAccounts() {
  const sel = document.getElementById("email-account-select");
  if (!sel) return;
  sel.innerHTML = _accounts.map(a => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join("");
  sel.addEventListener("change", () => {
    const acc = _accounts.find(a => a.id === +sel.value);
    if (acc) selectAccount(acc);
  });
}

async function selectAccount(acc) {
  _activeAccount = acc;
  await fetchMessages();
}

async function fetchMessages() {
  if (!_activeAccount) return;
  try {
    await API.email.fetch(_activeAccount.id);
    _messages = await API.email.messages(_activeAccount.id);
    renderMessages();
  } catch (e) { toast(e.message, "error"); }
}

function renderMessages() {
  const list = document.getElementById("email-list");
  if (!list) return;
  if (!_messages.length) {
    list.innerHTML = '<div class="empty-state"><p>No messages</p></div>';
    return;
  }
  list.innerHTML = _messages.map(m => `
    <div class="email-item ${!m.is_read ? 'unread' : ''}" data-id="${m.id}">
      <div class="email-from">${escapeHtml(m.from_addr || "Unknown")}</div>
      <div class="email-subject">${escapeHtml(m.subject || "(no subject)")}</div>
      ${m.summary_ai ? `<div class="email-summary">${escapeHtml(m.summary_ai.slice(0, 100))}</div>` : ""}
    </div>
  `).join("");
  list.querySelectorAll(".email-item").forEach(el =>
    el.addEventListener("click", () => showMessage(_messages.find(m => m.id === +el.dataset.id)))
  );
}

function showMessage(msg) {
  const detail = document.getElementById("email-detail");
  if (!detail || !msg) return;
  detail.innerHTML = `
    <h3 style="margin-bottom:8px">${escapeHtml(msg.subject || "(no subject)")}</h3>
    <div style="font-size:12px;color:var(--text2);margin-bottom:16px">From: ${escapeHtml(msg.from_addr || "")} · ${msg.date ? new Date(msg.date).toLocaleString() : ""}</div>
    ${msg.summary_ai ? `<div class="card" style="margin-bottom:16px"><div style="font-size:12px;color:var(--accent);margin-bottom:6px">AI Summary</div>${escapeHtml(msg.summary_ai)}</div>` : ""}
  `;
}

async function triageInbox() {
  if (!_activeAccount) return;
  try {
    const result = await API.email.triage(_activeAccount.id);
    toast(`Triaged ${result.triaged} messages`, "success");
    await fetchMessages();
  } catch (e) { toast(e.message, "error"); }
}
