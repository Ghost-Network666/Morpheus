import os
import uuid
from typing import Optional
from app.config import settings

_client = None
_collection = None
_embed_model = None  # singleton — loading fastembed is expensive


def reset_client():
    """Clear cached ChromaDB client so next call re-initialises with current settings."""
    global _client, _collection
    _client = None
    _collection = None


def _get_collection():
    global _client, _collection
    if _collection:
        return _collection

    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        if settings.chroma_in_process:
            persist_path = os.path.join(settings.data_dir, "chroma")
            os.makedirs(persist_path, exist_ok=True)
            _client = chromadb.PersistentClient(path=persist_path)
        else:
            _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)

        _collection = _client.get_or_create_collection(
            name="morpheus_docs",
            metadata={"hnsw:space": "cosine"},
        )
    except Exception as e:
        print(f"ChromaDB unavailable: {e}")
        return None

    return _collection


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from fastembed import TextEmbedding
        _embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _embed_model


def _embed(texts: list[str]) -> list[list[float]]:
    try:
        return [list(e) for e in _get_embed_model().embed(texts)]
    except Exception:
        return [[0.0] * 384 for _ in texts]


async def add_document(
    content: str,
    metadata: dict = None,
    doc_id: Optional[str] = None,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> int:
    col = _get_collection()
    if not col:
        return 0

    chunks = _chunk_text(content, chunk_size, chunk_overlap)
    if not chunks:
        return 0

    doc_id = doc_id or str(uuid.uuid4())
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    embeddings = _embed(chunks)
    metas = [{**(metadata or {}), "doc_id": doc_id, "chunk": i} for i in range(len(chunks))]

    col.add(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metas)
    return len(chunks)


async def query(text: str, n_results: int = 5, filter_metadata: dict = None) -> list[dict]:
    col = _get_collection()
    if not col:
        return []

    embeddings = _embed([text])
    kwargs = {"query_embeddings": embeddings, "n_results": n_results}
    if filter_metadata:
        kwargs["where"] = filter_metadata

    try:
        results = col.query(**kwargs)
        output = []
        for i, doc in enumerate(results.get("documents", [[]])[0]):
            output.append({
                "content": doc,
                "metadata": results.get("metadatas", [[]])[0][i] if results.get("metadatas") else {},
                "distance": results.get("distances", [[]])[0][i] if results.get("distances") else 0,
            })
        return output
    except Exception:
        return []


async def delete_document(doc_id: str) -> bool:
    col = _get_collection()
    if not col:
        return False
    try:
        col.delete(where={"doc_id": doc_id})
        return True
    except Exception:
        return False


def _chunk_text(text: str, size: int, overlap: int) -> list[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + size])
        chunks.append(chunk)
        i += size - overlap
    return chunks
