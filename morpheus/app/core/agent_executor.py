import json
import asyncio
import contextvars
from typing import AsyncIterator, Optional, Callable
from app.config import settings
from app.core.chat_engine import stream_chat
from app.core import search_engine

# Per-request memory source (safe for concurrent async tasks)
_memory_source_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "memory_source", default="local"
)


TOOL_REGISTRY: dict[str, dict] = {}


def register_tool(name: str, description: str, parameters: dict, func: Callable):
    TOOL_REGISTRY[name] = {
        "name": name,
        "description": description,
        "parameters": parameters,
        "func": func,
    }


# ── Built-in tools ─────────────────────────────────────────────────────────────

async def _tool_web_search(query: str, num_results: int = 5) -> str:
    results = await search_engine.search(query, num_results)
    if not results:
        return "No results found."
    lines = []
    for r in results:
        lines.append(f"**{r.get('title', 'No title')}**\n{r.get('url', '')}\n{r.get('snippet', '')}\n")
    return "\n".join(lines)


async def _tool_shell(command: str, profile_id: Optional[int] = None) -> str:
    if profile_id:
        from app.core.ssh_client import execute_command
        out, err, rc = await execute_command(profile_id, command)
        result = out + err
        return result[:4000] if result else f"Exit code: {rc}"
    else:
        import subprocess
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            return stdout.decode("utf-8", errors="replace")[:4000]
        except asyncio.TimeoutError:
            return "Command timed out after 30s"
        except Exception as e:
            return f"Error: {e}"


async def _tool_read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(8000)
        return content
    except Exception as e:
        return f"Error reading file: {e}"


async def _tool_write_file(path: str, content: str) -> str:
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Wrote {len(content)} bytes to {path}"
    except Exception as e:
        return f"Error writing file: {e}"


register_tool(
    "web_search",
    "Search the web for information",
    {"type": "object", "properties": {"query": {"type": "string"}, "num_results": {"type": "integer", "default": 5}}, "required": ["query"]},
    _tool_web_search,
)

register_tool(
    "shell",
    "Execute a shell command on the local or remote machine",
    {"type": "object", "properties": {"command": {"type": "string"}, "profile_id": {"type": "integer"}}, "required": ["command"]},
    _tool_shell,
)

register_tool(
    "read_file",
    "Read the contents of a file",
    {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
    _tool_read_file,
)

register_tool(
    "write_file",
    "Write content to a file",
    {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]},
    _tool_write_file,
)


async def _tool_memory_search(query: str, n: int = 5) -> str:
    from app.core.memory import retrieve
    source = _memory_source_var.get()
    results = await retrieve(query, source=source, n=n)
    if not results:
        return "No relevant memories found."
    return "\n---\n".join(results)


async def _tool_remember(content: str) -> str:
    from app.core.memory import store
    ok = await store(content, metadata={"source": "agent"})
    return "Stored in memory." if ok else "Memory storage unavailable."


register_tool(
    "memory_search",
    "Search your personal memory (uploaded documents and Obsidian vault notes) for relevant information",
    {"type": "object", "properties": {"query": {"type": "string", "description": "What to search for"}, "n": {"type": "integer", "default": 5}}, "required": ["query"]},
    _tool_memory_search,
)

register_tool(
    "remember",
    "Save a piece of information to local memory for future retrieval",
    {"type": "object", "properties": {"content": {"type": "string", "description": "Text to remember"}}, "required": ["content"]},
    _tool_remember,
)


# ── ReAct Agent ────────────────────────────────────────────────────────────────

REACT_SYSTEM = """You are Morpheus, a capable AI assistant with access to tools.

Use this format:
Thought: reason about what to do
Action: tool_name
Action Input: {"key": "value"}

After getting a result:
Observation: <tool result>

When done:
Thought: I now have the answer
Final Answer: <answer to user>

Available tools:
{tools}
"""


async def run_agent(
    user_message: str,
    history: list[dict] = None,
    tools: list[str] = None,
    model: str = None,
    provider: str = None,
    max_iterations: int = 8,
    ssh_profile_id: Optional[int] = None,
    memory_source: str = None,
) -> AsyncIterator[str]:
    model = model or settings.default_model
    provider = provider or settings.default_provider
    available_tools = tools or list(TOOL_REGISTRY.keys())

    # Set memory source for this task's context
    _memory_source_var.set(memory_source or getattr(settings, "memory_source", "local"))

    tool_descriptions = "\n".join(
        f"- {name}: {TOOL_REGISTRY[name]['description']}"
        for name in available_tools
        if name in TOOL_REGISTRY
    )

    system_prompt = REACT_SYSTEM.format(tools=tool_descriptions)
    messages = list(history or []) + [{"role": "user", "content": user_message}]

    for iteration in range(max_iterations):
        full_response = ""
        async for chunk in stream_chat(messages, model, provider, system_prompt=system_prompt if iteration == 0 else None):
            full_response += chunk
            yield chunk

        messages.append({"role": "assistant", "content": full_response})

        # Check if we hit Final Answer
        if "Final Answer:" in full_response:
            break

        # Parse tool call
        action, action_input = _parse_react(full_response)
        if not action:
            break

        if action not in TOOL_REGISTRY:
            observation = f"Unknown tool: {action}"
        else:
            try:
                kwargs = json.loads(action_input) if action_input else {}
                if action == "shell" and ssh_profile_id:
                    kwargs["profile_id"] = ssh_profile_id
                tool_func = TOOL_REGISTRY[action]["func"]
                observation = await tool_func(**kwargs)
            except Exception as e:
                observation = f"Tool error: {e}"

        obs_msg = f"\nObservation: {observation}\n"
        yield obs_msg
        messages.append({"role": "user", "content": f"Observation: {observation}"})


def _parse_react(text: str) -> tuple[Optional[str], Optional[str]]:
    action = None
    action_input = None
    for line in text.splitlines():
        if line.startswith("Action:"):
            action = line[7:].strip()
        elif line.startswith("Action Input:"):
            action_input = line[13:].strip()
    return action, action_input
