# Morpheus Agent Setup

Morpheus ships with a built-in AI agent that can use tools, browse the web, run code, and reason step-by-step. This document covers how to configure models and get the most out of agent mode.

---

## Quick Start

1. Start Morpheus and open the chat page.
2. Enable **Agent mode** in the chat toolbar toggle.
3. Type a task — the agent will plan, use tools, and report back.

Agent mode works with any model, but performs best with large reasoning models (70B+ or cloud APIs).

---

## Model Providers

### Ollama (local, default)

Ollama runs models on your own hardware. Install it first:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Then pull a model:

```bash
ollama pull llama3.2:3b      # fast, good for chat
ollama pull llama3.1:70b     # best for agents (needs ~40 GB RAM)
ollama pull qwen2.5:32b      # good balance of speed and quality
ollama pull mistral-nemo:12b # efficient multilingual model
```

Set your default model in Settings → AI Providers or in `.env`:

```env
DEFAULT_MODEL=llama3.1:70b
DEFAULT_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
```

### OpenAI

```env
OPENAI_API_KEY=sk-...
DEFAULT_MODEL=gpt-4o
DEFAULT_PROVIDER=openai
```

GPT-4o is recommended for agent tasks. GPT-4o-mini is faster and cheaper for simple queries.

### Anthropic

```env
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_MODEL=claude-sonnet-4-6
DEFAULT_PROVIDER=anthropic
```

Claude Sonnet is an excellent agent model with strong reasoning and long context.

### Custom OpenAI-compatible endpoint

Point Morpheus at any OpenAI-compatible server (LM Studio, vLLM, Together AI, etc.):

```env
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_API_KEY=not-needed
DEFAULT_MODEL=your-model-name
DEFAULT_PROVIDER=openai
```

---

## Agent Tools

When agent mode is enabled, the model has access to:

| Tool | What it does |
|------|-------------|
| `web_search` | Searches via SearXNG (or Brave/Tavily/Google PSE if configured) |
| `memory_search` | Queries your personal knowledge base (uploaded docs + Obsidian vault) |
| `remember` | Saves a piece of information to local memory for future retrieval |
| `calculator` | Evaluates math expressions (arithmetic, trig, logarithms, etc.) |
| `read_file` | Reads a file from the local filesystem |
| `write_file` | Writes content to a file in the uploads directory |
| `shell` | Executes a shell command locally or on a remote SSH host |
| `create_note` | Creates a new note with a title and optional markdown content |
| `create_task` | Creates a task in the task list with priority and optional due date |

---

## RAG / Memory

The agent can remember and retrieve information you've stored:

1. Go to **Settings → RAG / ChromaDB** and enable in-process ChromaDB.
2. Upload documents in the **Documents** page — they are automatically indexed.
3. In chat, the agent will automatically retrieve relevant context from your knowledge base.

For larger deployments, run ChromaDB externally:

```env
CHROMA_IN_PROCESS=false
CHROMA_HOST=localhost
CHROMA_PORT=8000
```

---

## Research Mode

The **Research** page runs a multi-step agent that:

1. Breaks your topic into sub-questions
2. Searches the web for each sub-question
3. Synthesizes a comprehensive report with citations

Set **Depth** (1–10) to control how many search iterations to run. Higher depth = more thorough but slower.

---

## Multi-Device Setup

Run Morpheus on a server and access it from any device:

### systemd service (Linux)

```bash
# from the morpheus/morpheus directory (see Server Setup in README.md)
sudo cp scripts/morpheus.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now morpheus
```

### Tailscale (recommended for remote access)

Install Tailscale on both the server and client devices, then set `TAILSCALE_DETECT=true`. Morpheus will display its Tailscale URL at the top of the interface.

## WebSocket Sync

Morpheus keeps all connected clients in sync over WebSocket at `/ws/sync`. When you create a note, complete a task, or make any change, all your browser tabs and devices update instantly — no refresh needed.

---

## Tips

- **Model selection per chat**: Use the model dropdown in the chat toolbar to override the default for individual conversations.
- **Context length**: For long research tasks, use a model with at least 32k context (Llama 3.1, Qwen 2.5, Claude, GPT-4o all qualify).
- **Speed vs quality**: llama3.2:3b answers in seconds; llama3.1:70b takes longer but reasons better. Use 3b for quick tasks and 70b for complex agent workflows.
- **Offline use**: All local models work completely offline once pulled. Only cloud providers (OpenAI, Anthropic) require internet.
