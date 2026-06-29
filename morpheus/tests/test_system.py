import pytest


@pytest.mark.asyncio
async def test_system_info(client):
    r = await client.get("/api/system/info")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data
    assert "modules" in data


@pytest.mark.asyncio
async def test_system_info_no_auth_field(client):
    """Auth was removed — system info must not expose auth_enabled."""
    r = await client.get("/api/system/info")
    assert r.status_code == 200
    assert "auth_enabled" not in r.json()


@pytest.mark.asyncio
async def test_auth_endpoints_removed(client):
    """All /api/auth/* routes must return 404 — no auth in this app."""
    for path in ["/api/auth/me", "/api/auth/login", "/api/auth/register"]:
        r = await client.get(path)
        assert r.status_code == 404, f"Expected 404 for {path}, got {r.status_code}"


@pytest.mark.asyncio
async def test_settings_get(client):
    r = await client.get("/api/settings")
    assert r.status_code == 200
    data = r.json()
    assert "default_model" in data
    assert "theme" in data
