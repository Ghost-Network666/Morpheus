import os
import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_rag_upload_list_delete_roundtrip(client):
    """Document metadata must survive being read back from the DB (not an
    in-memory dict that resets on restart), and deleting must also remove
    the saved file from disk."""
    with patch("app.core.rag_engine.add_document", new=AsyncMock(return_value=2)), \
         patch("app.core.rag_engine.delete_document", new=AsyncMock(return_value=True)):
        r = await client.post(
            "/api/rag/documents",
            files={"file": ("note.txt", b"hello world", "text/plain")},
        )
        assert r.status_code == 200
        doc = r.json()
        assert doc["filename"] == "note.txt"
        assert doc["chunks"] == 2

        r = await client.get("/api/rag/documents")
        assert r.status_code == 200
        listed = r.json()
        assert any(d["id"] == doc["id"] for d in listed)

        from app.config import settings
        saved_path = os.path.join(settings.data_dir, "uploads", f"{doc['id']}_note.txt")
        assert os.path.isfile(saved_path)

        r = await client.delete(f"/api/rag/documents/{doc['id']}")
        assert r.status_code == 200
        assert not os.path.isfile(saved_path)

        r = await client.get("/api/rag/documents")
        assert all(d["id"] != doc["id"] for d in r.json())

        r = await client.delete(f"/api/rag/documents/{doc['id']}")
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_rag_query_empty(client):
    with patch("app.core.rag_engine.query", new=AsyncMock(return_value=[])):
        r = await client.post("/api/rag/query", json={"query": "test query"})
        assert r.status_code == 200
        assert r.json()["results"] == []


@pytest.mark.asyncio
async def test_rag_query_missing_body(client):
    r = await client.post("/api/rag/query", json={})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_rag_list_documents(client):
    r = await client.get("/api/rag/documents")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
