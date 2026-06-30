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
    import os
    from app.config import settings
    allowed_base = os.path.abspath(os.path.join(settings.data_dir, "uploads"))
    target = os.path.abspath(
        path if os.path.isabs(path) else os.path.join(allowed_base, path)
    )
    if not target.startswith(allowed_base + os.sep) and target != allowed_base:
        return "Error: write_file is restricted to the uploads directory"
    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        rel = os.path.relpath(target, allowed_base)
        return f"Wrote {len(content)} bytes to uploads/{rel}"
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


async def _tool_calculator(expression: str) -> str:
    import math
    safe_globals = {
        "__builtins__": {},
        "abs": abs, "round": round, "min": min, "max": max, "sum": sum,
        "pow": pow, "int": int, "float": float, "len": len,
        "sqrt": math.sqrt, "ceil": math.ceil, "floor": math.floor,
        "log": math.log, "log10": math.log10, "log2": math.log2,
        "sin": math.sin, "cos": math.cos, "tan": math.tan,
        "asin": math.asin, "acos": math.acos, "atan": math.atan, "atan2": math.atan2,
        "exp": math.exp, "factorial": math.factorial,
        "pi": math.pi, "e": math.e, "inf": math.inf,
    }
    try:
        result = eval(expression, safe_globals)
        return str(result)
    except ZeroDivisionError:
        return "Error: division by zero"
    except Exception as exc:
        return f"Error: {exc}"


register_tool(
    "calculator",
    "Evaluate a mathematical expression (arithmetic, trig, logarithms, etc.)",
    {"type": "object", "properties": {"expression": {"type": "string", "description": "Python-style math expression, e.g. '2**10', 'sqrt(144)', 'sin(pi/2)'"}}, "required": ["expression"]},
    _tool_calculator,
)


async def _tool_create_note(title: str, content: str = "") -> str:
    from app.database import AsyncSessionLocal
    from app.models.notes import Note
    from app.models.user import User
    from app.core.sync import broadcast
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).limit(1))).scalar_one_or_none()
        if not user:
            return "Error: no owner user found"
        note = Note(user_id=user.id, title=title, content=content or f"# {title}\n\n")
        db.add(note)
        await db.commit()
        await db.refresh(note)
    await broadcast(user.id, "notes_changed", {"action": "create", "id": note.id})
    return f"Note created: '{title}' (id={note.id})"


register_tool(
    "create_note",
    "Create a new note with a title and optional markdown content",
    {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string", "description": "Markdown content (optional)"}}, "required": ["title"]},
    _tool_create_note,
)


async def _tool_create_task(title: str, description: str = "", priority: str = "medium", due_date: str = "") -> str:
    from app.database import AsyncSessionLocal
    from app.models.notes import Task
    from app.models.user import User
    from app.core.sync import broadcast
    from sqlalchemy import select
    from datetime import datetime as _dt
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).limit(1))).scalar_one_or_none()
        if not user:
            return "Error: no owner user found"
        due = None
        if due_date:
            try:
                due = _dt.fromisoformat(due_date)
            except Exception:
                pass
        task = Task(
            user_id=user.id,
            title=title,
            description=description or None,
            priority=priority if priority in ("low", "medium", "high") else "medium",
            due_date=due,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
    await broadcast(user.id, "tasks_changed", {"action": "create", "id": task.id})
    return f"Task created: '{title}' (id={task.id}, priority={task.priority})"


register_tool(
    "create_task",
    "Create a new task in the task list",
    {"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}, "priority": {"type": "string", "enum": ["low", "medium", "high"], "default": "medium"}, "due_date": {"type": "string", "description": "ISO datetime e.g. 2024-12-31T09:00:00 (optional)"}}, "required": ["title"]},
    _tool_create_task,
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
