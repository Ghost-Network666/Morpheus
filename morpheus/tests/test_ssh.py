import pytest


@pytest.mark.asyncio
async def test_ssh_profile_crud(client):
    # Create
    r = await client.post("/api/ssh/profiles", json={
        "label": "Test Server",
        "host": "192.168.1.100",
        "port": 22,
        "username": "ubuntu",
        "auth_type": "password",
        "password": "testpass",
    })
    assert r.status_code == 200
    profile = r.json()
    assert profile["label"] == "Test Server"
    assert "password" not in profile  # password must not be exposed
    profile_id = profile["id"]

    # List
    r = await client.get("/api/ssh/profiles")
    assert r.status_code == 200
    assert any(p["id"] == profile_id for p in r.json())

    # Update
    r = await client.put(f"/api/ssh/profiles/{profile_id}", json={"label": "Updated Server"})
    assert r.status_code == 200
    assert r.json()["label"] == "Updated Server"

    # Delete
    r = await client.delete(f"/api/ssh/profiles/{profile_id}")
    assert r.status_code == 200

    # Confirm gone
    r = await client.get("/api/ssh/profiles")
    assert not any(p["id"] == profile_id for p in r.json())


@pytest.mark.asyncio
async def test_ssh_active_default(client):
    r = await client.get("/api/ssh/active")
    assert r.status_code == 200
    assert r.json()["active"] is None
