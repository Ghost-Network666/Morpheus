import pytest


@pytest.mark.asyncio
async def test_notes_crud(client):
    # Create
    r = await client.post("/api/notes", json={"title": "Test Note", "content": "Hello world"})
    assert r.status_code == 200
    note = r.json()
    assert note["title"] == "Test Note"
    note_id = note["id"]

    # List
    r = await client.get("/api/notes")
    assert r.status_code == 200
    assert any(n["id"] == note_id for n in r.json())

    # Update
    r = await client.put(f"/api/notes/{note_id}", json={"title": "Updated Note"})
    assert r.status_code == 200
    assert r.json()["title"] == "Updated Note"

    # Delete
    r = await client.delete(f"/api/notes/{note_id}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_tasks_crud(client):
    # Create
    r = await client.post("/api/tasks", json={"title": "Test Task", "priority": "high", "webhook_url": "https://example.com/hook"})
    assert r.status_code == 200
    task = r.json()
    assert task["title"] == "Test Task"
    assert task["priority"] == "high"
    assert task["webhook_url"] == "https://example.com/hook"
    assert "updated_at" in task
    task_id = task["id"]

    # Get single task
    r = await client.get(f"/api/tasks/{task_id}")
    assert r.status_code == 200
    assert r.json()["id"] == task_id

    # List all
    r = await client.get("/api/tasks")
    assert r.status_code == 200
    assert any(t["id"] == task_id for t in r.json())

    # Filter pending — task should appear
    r = await client.get("/api/tasks?status=pending")
    assert r.status_code == 200
    assert any(t["id"] == task_id for t in r.json())

    # Complete
    r = await client.put(f"/api/tasks/{task_id}", json={"completed": True})
    assert r.status_code == 200
    assert r.json()["completed"] is True

    # Filter pending — completed task should not appear
    r = await client.get("/api/tasks?status=pending")
    assert r.status_code == 200
    assert not any(t["id"] == task_id for t in r.json())

    # Filter done — task should appear
    r = await client.get("/api/tasks?status=done")
    assert r.status_code == 200
    assert any(t["id"] == task_id for t in r.json())

    # Filter by priority
    r = await client.get("/api/tasks?priority=high")
    assert r.status_code == 200
    assert any(t["id"] == task_id for t in r.json())

    r = await client.get("/api/tasks?priority=low")
    assert r.status_code == 200
    assert not any(t["id"] == task_id for t in r.json())

    # 404 for nonexistent task
    r = await client.get("/api/tasks/999999")
    assert r.status_code == 404

    # Delete
    r = await client.delete(f"/api/tasks/{task_id}")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_calendar_crud(client):
    r = await client.post("/api/calendar", json={
        "summary": "Team Meeting",
        "start": "2025-01-01T10:00:00",
        "end": "2025-01-01T11:00:00",
    })
    assert r.status_code == 200
    ev = r.json()
    assert ev["summary"] == "Team Meeting"
    ev_id = ev["id"]

    r = await client.get("/api/calendar")
    assert r.status_code == 200
    assert any(e["id"] == ev_id for e in r.json())

    r = await client.delete(f"/api/calendar/{ev_id}")
    assert r.status_code == 200
