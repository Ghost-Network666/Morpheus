import pytest
from unittest.mock import patch, AsyncMock


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
