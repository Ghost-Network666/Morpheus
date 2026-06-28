import pytest


@pytest.mark.asyncio
async def test_vault_set_get_delete(client):
    # Set a secret
    r = await client.post("/api/connections/vault", json={
        "key": "TEST_API_KEY",
        "value": "sk-test-12345",
        "category": "api_key",
    })
    assert r.status_code == 200

    # Get it back
    r = await client.get("/api/connections/vault/TEST_API_KEY")
    assert r.status_code == 200
    assert r.json()["value"] == "sk-test-12345"

    # List (value not exposed)
    r = await client.get("/api/connections/vault")
    assert r.status_code == 200
    items = r.json()
    item = next((i for i in items if i["key"] == "TEST_API_KEY"), None)
    assert item is not None
    assert "value" not in item or item.get("value") is None

    # Delete
    r = await client.delete("/api/connections/vault/TEST_API_KEY")
    assert r.status_code == 200

    # Should be gone
    r = await client.get("/api/connections/vault/TEST_API_KEY")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_vault_encryption_roundtrip():
    from app.utils.vault import encrypt, decrypt
    original = "super-secret-value-12345"
    encrypted = encrypt(original)
    assert encrypted != original
    assert decrypt(encrypted) == original
