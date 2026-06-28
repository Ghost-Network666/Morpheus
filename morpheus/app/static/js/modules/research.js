import API from "../api.js";
import { toast, renderMarkdown } from "../app.js";

export function initResearch() {
  const form = document.getElementById("research-form");
  if (!form) return;

  // Populate model selector with provider options
  _populateModelSelect();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const topic = document.getElementById("research-topic")?.value.trim();
    const depth = parseInt(document.getElementById("research-depth")?.value || "3");
    if (!topic) return;
    await runResearch(topic, depth);
  });
}

function _populateModelSelect() {
  const sel = document.getElementById("research-model-select");
  if (!sel || sel.dataset.populated) return;
  sel.dataset.populated = "1";

  // Fetch available Ollama models
  API.cookbook.models().then(models => {
    const names = (models || []).map(m => m.name || m.model || m).filter(Boolean);
    if (names.length) {
      sel.innerHTML = "";
      for (const m of names) {
        const opt = document.createElement("option");
        opt.value = m + "|ollama";
        opt.textContent = m;
        sel.appendChild(opt);
      }
    }
  }).catch(() => {});
}

async function runResearch(topic, depth) {
  const output = document.getElementById("research-output");
  const startBtn = document.getElementById("research-start-btn");
  const modelSel = document.getElementById("research-model-select");

  if (output) output.innerHTML = "";
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "Researching…";
  }

  let accumulated = "";

  // Parse model|provider from selector
  let model, provider;
  const selVal = modelSel?.value || "";
  if (selVal.includes("|")) {
    [model, provider] = selVal.split("|");
  }

  try {
    await API.research.run({ topic, depth, model, provider }, (chunk) => {
      accumulated += chunk.content || "";
      if (output) {
        output.innerHTML = renderMarkdown(accumulated);
        output.scrollTop = output.scrollHeight;
      }
    });
  } catch (e) {
    toast(e.message, "error");
    if (output && !accumulated) {
      output.innerHTML = `<p style="color:var(--red)">Research failed: ${e.message}</p>`;
    }
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Research";
    }
  }
}
