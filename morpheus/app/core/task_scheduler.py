import asyncio
import logging
from datetime import datetime, timezone

log = logging.getLogger("morpheus.scheduler")


async def start_scheduler():
    """Background loop: check for due cron tasks every 60 seconds."""
    while True:
        try:
            await _run_due_tasks()
        except Exception as e:
            log.warning("Scheduler error: %s", e)
        await asyncio.sleep(60)


async def _run_due_tasks():
    from app.database import AsyncSessionLocal
    from app.models.notes import Task
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Task).where(Task.cron_expression.isnot(None), Task.completed == False)  # noqa: E712
        )
        for task in result.scalars().all():
            if _is_due(task.cron_expression):
                await _execute_task(task)


def _is_due(cron_expr: str) -> bool:
    """
    Matches @hourly / @daily / @weekly / @monthly aliases and
    standard 5-field cron (minute hour dom month dow).
    """
    now = datetime.now(timezone.utc)
    aliases = {
        "@hourly":  lambda n: n.minute == 0,
        "@daily":   lambda n: n.hour == 0 and n.minute == 0,
        "@weekly":  lambda n: n.weekday() == 0 and n.hour == 0 and n.minute == 0,
        "@monthly": lambda n: n.day == 1 and n.hour == 0 and n.minute == 0,
    }
    if cron_expr in aliases:
        return aliases[cron_expr](now)
    try:
        parts = cron_expr.strip().split()
        if len(parts) != 5:
            return False
        minute, hour, dom, month, dow = parts
        return (
            _match(minute, now.minute)
            and _match(hour, now.hour)
            and _match(dom, now.day)
            and _match(month, now.month)
            and _match(dow, now.weekday())
        )
    except Exception:
        return False


def _match(field: str, value: int) -> bool:
    if field == "*":
        return True
    try:
        if "," in field:
            return value in [int(x) for x in field.split(",")]
        if "-" in field:
            lo, hi = field.split("-", 1)
            return int(lo) <= value <= int(hi)
        if "/" in field:
            _, step = field.split("/", 1)
            return value % int(step) == 0
        return int(field) == value
    except Exception:
        return False


async def _execute_task(task):
    log.info("Running cron task id=%s title=%r", task.id, task.title)
    if task.webhook_url:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(task.webhook_url, json={"task_id": task.id, "title": task.title})
            log.debug("Webhook fired for task %s", task.id)
        except Exception as e:
            log.warning("Webhook failed for task %s: %s", task.id, e)
    elif task.assigned_agent:
        try:
            from app.core.agent_executor import run_agent
            result = ""
            async for chunk in run_agent(
                f"Execute task: {task.title}\n{task.description or ''}",
            ):
                result += chunk
            log.info("Agent task %s completed (%d chars)", task.id, len(result))
        except Exception as e:
            log.warning("Agent task %s failed: %s", task.id, e)
