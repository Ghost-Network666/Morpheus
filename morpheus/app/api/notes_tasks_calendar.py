from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.models.notes import Note, Task, CalendarEvent
from app.models.user import User
from app.api.auth import require_user

router = APIRouter(tags=["notes-tasks-calendar"])


# ── Notes ───────────────────────────────────────────────────────────────────

notes_router = APIRouter(prefix="/api/notes")


@notes_router.get("")
async def list_notes(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(Note).where(Note.user_id == user.id).order_by(desc(Note.pinned), desc(Note.updated_at)))
    return [_note_out(n) for n in result.scalars().all()]


@notes_router.post("")
async def create_note(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    note = Note(user_id=user.id, title=body.get("title", "Untitled"), content=body.get("content", ""), tags=body.get("tags"), pinned=body.get("pinned", False))
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _note_out(note)


@notes_router.get("/{note_id}")
async def get_note(note_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    return _note_out(note)


@notes_router.put("/{note_id}")
async def update_note(note_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    body = await request.json()
    for f in ["title", "content", "tags", "pinned"]:
        if f in body:
            setattr(note, f, body[f])
    note.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _note_out(note)


@notes_router.delete("/{note_id}")
async def delete_note(note_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    await db.delete(note)
    await db.commit()
    return {"ok": True}


def _note_out(n: Note):
    return {"id": n.id, "title": n.title, "content": n.content, "tags": n.tags, "pinned": n.pinned, "created_at": n.created_at, "updated_at": n.updated_at}


# ── Tasks ────────────────────────────────────────────────────────────────────

tasks_router = APIRouter(prefix="/api/tasks")


@tasks_router.get("")
async def list_tasks(
    status: Optional[str] = Query(None, description="Filter by status: pending | done | all (default: all)"),
    priority: Optional[str] = Query(None, description="Filter by priority: low | medium | high"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
):
    q = select(Task).where(Task.user_id == user.id)
    if status == "pending":
        q = q.where(Task.completed == False)  # noqa: E712
    elif status == "done":
        q = q.where(Task.completed == True)  # noqa: E712
    if priority in ("low", "medium", "high"):
        q = q.where(Task.priority == priority)
    q = q.order_by(Task.completed, Task.due_date, desc(Task.created_at))
    result = await db.execute(q)
    return [_task_out(t) for t in result.scalars().all()]


@tasks_router.get("/{task_id}")
async def get_task(task_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    return _task_out(task)


@tasks_router.post("")
async def create_task(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    task = Task(
        user_id=user.id,
        title=body["title"],
        description=body.get("description"),
        due_date=_parse_dt(body.get("due_date")),
        priority=body.get("priority", "medium"),
        cron_expression=body.get("cron_expression"),
        webhook_url=body.get("webhook_url"),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _task_out(task)


@tasks_router.put("/{task_id}")
async def update_task(task_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    body = await request.json()
    for f in ["title", "description", "completed", "priority", "cron_expression", "webhook_url"]:
        if f in body:
            setattr(task, f, body[f])
    if "due_date" in body:
        task.due_date = _parse_dt(body["due_date"])
    task.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _task_out(task)


@tasks_router.delete("/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    await db.delete(task)
    await db.commit()
    return {"ok": True}


def _task_out(t: Task):
    return {"id": t.id, "title": t.title, "description": t.description, "due_date": t.due_date, "completed": t.completed, "priority": t.priority, "cron_expression": t.cron_expression, "webhook_url": t.webhook_url, "created_at": t.created_at, "updated_at": t.updated_at}


# ── Calendar ─────────────────────────────────────────────────────────────────

calendar_router = APIRouter(prefix="/api/calendar")


@calendar_router.get("")
async def list_events(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(CalendarEvent).where(CalendarEvent.user_id == user.id).order_by(CalendarEvent.start))
    return [_event_out(e) for e in result.scalars().all()]


@calendar_router.post("")
async def create_event(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    event = CalendarEvent(
        user_id=user.id,
        summary=body["summary"],
        description=body.get("description"),
        start=_parse_dt(body["start"]),
        end=_parse_dt(body["end"]),
        all_day=body.get("all_day", False),
        location=body.get("location"),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return _event_out(event)


@calendar_router.put("/{event_id}")
async def update_event(event_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id, CalendarEvent.user_id == user.id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(404, "Event not found")
    body = await request.json()
    for f in ["summary", "description", "all_day", "location"]:
        if f in body:
            setattr(event, f, body[f])
    if "start" in body:
        event.start = _parse_dt(body["start"])
    if "end" in body:
        event.end = _parse_dt(body["end"])
    await db.commit()
    return _event_out(event)


@calendar_router.delete("/{event_id}")
async def delete_event(event_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(CalendarEvent).where(CalendarEvent.id == event_id, CalendarEvent.user_id == user.id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(404, "Event not found")
    await db.delete(event)
    await db.commit()
    return {"ok": True}


@calendar_router.get("/export.ics")
async def export_ics(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    from fastapi.responses import Response
    from icalendar import Calendar, Event
    import uuid as _uuid

    result = await db.execute(select(CalendarEvent).where(CalendarEvent.user_id == user.id))
    events = result.scalars().all()

    cal = Calendar()
    cal.add("prodid", "-//Morpheus//EN")
    cal.add("version", "2.0")

    for ev in events:
        ie = Event()
        ie.add("uid", ev.ics_uid or str(_uuid.uuid4()))
        ie.add("summary", ev.summary)
        ie.add("dtstart", ev.start)
        ie.add("dtend", ev.end)
        if ev.description:
            ie.add("description", ev.description)
        cal.add_component(ie)

    return Response(cal.to_ical(), media_type="text/calendar")


def _event_out(e: CalendarEvent):
    return {"id": e.id, "summary": e.summary, "description": e.description, "start": e.start, "end": e.end, "all_day": e.all_day, "location": e.location, "created_at": e.created_at}


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None
