import pytest


@pytest.mark.asyncio
async def test_create_session(client):
    r = await client.post("/api/chat/sessions", json={"title": "Test Chat"})
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Test Chat"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_sessions(client):
    r = await client.get("/api/chat/sessions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_get_session(client):
    # Create a session first
    r = await client.post("/api/chat/sessions", json={"title": "Get Test"})
    session_id = r.json()["id"]

    r = await client.get(f"/api/chat/sessions/{session_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == session_id
    assert "messages" in data


@pytest.mark.asyncio
async def test_delete_session(client):
    r = await client.post("/api/chat/sessions", json={"title": "Delete Me"})
    session_id = r.json()["id"]

    r = await client.delete(f"/api/chat/sessions/{session_id}")
    assert r.status_code == 200

    r = await client.get(f"/api/chat/sessions/{session_id}")
    assert r.status_code == 404
