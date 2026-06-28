import API from "../api.js";
import { toast, escapeHtml } from "../app.js";

let _models = [];

export async function initCookbook() {
  await loadHardware();
  await loadModels();
  setupDownloadForm();
}

async function loadHardware() {
  try {
    const hw = await API.cookbook.hardware();
    document.getElementById("hw-ram")?.setAttribute("data-value", `${hw.ram_gb}GB`);
    document.getElementById("hw-cpu")?.setAttribute("data-value", hw.cpu || "Unknown");
    const gpus = hw.gpu || [];
    document.getElementById("hw-gpu")?.setAttribute("data-value", gpus.length ? gpus[0].name : "None");
    document.getElementById("hw-vram")?.setAttribute("data-value", hw.vram_gb ? `${hw.vram_gb.toFixed(1)}GB` : "—");

    // Update display
    ["hw-ram", "hw-cpu", "hw-gpu", "hw-vram"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = el.getAttribute("data-value");
    });

    // Recommendations
    const recs = await API.cookbook.recommendations();
    const recContainer = document.getElementById("model-recommendations");
    if (recContainer) {
      recContainer.innerHTML = (recs.recommendations || []).map(r => `
        <div class="card" style="display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-weight:600">${escapeHtml(r.model)}</div>
            <div style="font-size:12px;color:var(--text2)">${escapeHtml(r.reason)} · ~${r.size_gb}GB</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="downloadModel('${escapeHtml(r.model)}')">Download</button>
        </div>
      `).join("");
    }
  } catch (e) { toast(e.message, "error"); }
}

async function loadModels() {
  try {
    _models = await API.cookbook.models();
    renderModels();
  } catch (e) {
    document.getElementById("installed-models")?.innerHTML =
      '<div class="empty-state"><p>Ollama not running. <a href="https://ollama.com" target="_blank">Install Ollama</a> to manage models.</p></div>';
  }
}

function renderModels() {
  const container = document.getElementById("installed-models");
  if (!container) return;
  if (!_models.length) {
    container.innerHTML = '<div class="empty-state"><p>No models installed yet.</p></div>';
    return;
  }
  container.innerHTML = _models.map(m => {
    const name = m.name || m;
    const size = m.size ? `${(m.size / 1e9).toFixed(1)}GB` : "";
    return `<div class="model-card">
      <div class="model-card-info">
        <div class="model-card-name">${escapeHtml(name)}</div>
        ${size ? `<div class="model-card-meta">${size}</div>` : ""}
      </div>
      <button class="btn btn-danger btn-sm" onclick="window._deleteModel('${escapeHtml(name)}')">Remove</button>
    </div>`;
  }).join("");
}

function setupDownloadForm() {
  const form = document.getElementById("download-model-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("download-model-input");
    const modelName = input?.value.trim();
    if (!modelName) return;
    await downloadModel(modelName);
    if (input) input.value = "";
  });
}

async function downloadModel(modelName) {
  const logEl = document.getElementById("download-log");
  if (logEl) { logEl.style.display = "block"; logEl.textContent = `Pulling ${modelName}...\n`; }

  try {
    await API.cookbook.download(modelName, (chunk) => {
      if (logEl && chunk.log) {
        logEl.textContent += chunk.log;
        logEl.scrollTop = logEl.scrollHeight;
      }
    });
    toast(`Downloaded ${modelName}`, "success");
    await loadModels();
  } catch (e) { toast(e.message, "error"); }
}

window._deleteModel = async function(name) {
  if (!confirm(`Delete ${name}?`)) return;
  try {
    await API.cookbook.delete(name);
    toast(`Deleted ${name}`, "success");
    await loadModels();
  } catch (e) { toast(e.message, "error"); }
};

window.downloadModel = downloadModel;
