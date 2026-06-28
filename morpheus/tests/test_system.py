import pytest


@pytest.mark.asyncio
async def test_system_info(client):
    r = await client.get("/api/system/info")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data
    assert "modules" in data
    assert data["auth_enabled"] is False


@pytest.mark.asyncio
async def test_auth_me_no_auth(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert "username" in data


@pytest.mark.asyncio
async def test_settings_get(client):
    r = await client.get("/api/settings")
    assert r.status_code == 200
    data = r.json()
    assert "default_model" in data
    assert "theme" in data
