import logging
import chromadb
from chromadb import EmbeddingFunction, Embeddings
from config import CHROMA_DIR
from llm_providers import get_embedding

logger = logging.getLogger(__name__)


class ConfiguredEmbedding(EmbeddingFunction):
    """Uses the currently configured embedding provider."""
    def __call__(self, input: list[str]) -> Embeddings:
        result = []
        for text in input:
            try:
                result.append(get_embedding(text))
            except Exception as e:
                logger.error(f"Embedding failed: {e}")
                result.append([0.0] * 768)
        return result


_client = None
_collection = None
_chunks_collection = None


def _get_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=CHROMA_DIR)
    return _client


def _get_collection():
    global _collection
    if _collection is None:
        _collection = _get_client().get_or_create_collection(
            name="books",
            embedding_function=ConfiguredEmbedding(),
        )
    return _collection


def _get_chunks_collection():
    global _chunks_collection
    if _chunks_collection is None:
        _chunks_collection = _get_client().get_or_create_collection(
            name="book_chunks",
            embedding_function=ConfiguredEmbedding(),
        )
    return _chunks_collection


def add_book_embedding(book_id: int, title: str, author: str, summary: str, categories: list[str]):
    col = _get_collection()
    text = f"{title} {author} {' '.join(categories)} {summary}"
    col.upsert(
        ids=[str(book_id)],
        documents=[text],
        metadatas=[{"book_id": book_id, "title": title, "author": author}],
    )


def search_books(query: str, n_results: int = 10) -> list[int]:
    col = _get_collection()
    try:
        count = col.count()
        if count == 0:
            return []
        results = col.query(query_texts=[query], n_results=min(n_results, count))
        if results["ids"] and results["ids"][0]:
            return [int(i) for i in results["ids"][0]]
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
    return []


def delete_book_embedding(book_id: int):
    col = _get_collection()
    try:
        col.delete(ids=[str(book_id)])
    except Exception as e:
        logger.warning(f"Delete embedding failed: {e}")
    # also drop any chunk embeddings
    try:
        delete_book_chunks(book_id)
    except Exception as e:
        logger.warning(f"Delete chunks failed: {e}")


# ── Chunk collection (for RAG) ──────────────────────────────────────────

def add_book_chunks(book_id: int, title: str, author: str, chunks: list[dict], batch_size: int = 32):
    """chunks: [{text, page, idx}, ...]"""
    col = _get_chunks_collection()
    # clear old first so re-indexing doesn't leave stale chunks
    try:
        col.delete(where={"book_id": book_id})
    except Exception:
        pass
    if not chunks:
        return 0

    total = 0
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        ids = [f"{book_id}_{c['idx']}" for c in batch]
        docs = [c["text"] for c in batch]
        metas = [
            {"book_id": book_id, "chunk_idx": c["idx"], "page": c.get("page", 0),
             "title": title, "author": author or ""}
            for c in batch
        ]
        col.upsert(ids=ids, documents=docs, metadatas=metas)
        total += len(batch)
    return total


def search_chunks(query: str, n_results: int = 6, book_ids: list[int] | None = None) -> list[dict]:
    """Return top-K chunks: [{text, page, book_id, chunk_idx, title, author, distance}, ...]"""
    col = _get_chunks_collection()
    try:
        if col.count() == 0:
            return []
        kwargs = {"query_texts": [query], "n_results": n_results}
        if book_ids:
            kwargs["where"] = {"book_id": {"$in": book_ids}}
        res = col.query(**kwargs)
        out = []
        ids = (res.get("ids") or [[]])[0]
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0] if res.get("distances") else [0.0] * len(ids)
        for i in range(len(ids)):
            m = metas[i] or {}
            out.append({
                "text": docs[i],
                "page": m.get("page", 0),
                "book_id": m.get("book_id"),
                "chunk_idx": m.get("chunk_idx"),
                "title": m.get("title", ""),
                "author": m.get("author", ""),
                "distance": dists[i] if i < len(dists) else 0.0,
            })
        return out
    except Exception as e:
        logger.error(f"Chunk search failed: {e}")
        return []


def delete_book_chunks(book_id: int):
    col = _get_chunks_collection()
    try:
        col.delete(where={"book_id": book_id})
    except Exception as e:
        logger.warning(f"Delete chunks failed: {e}")


def count_book_chunks(book_id: int) -> int:
    col = _get_chunks_collection()
    try:
        res = col.get(where={"book_id": book_id}, include=[])
        return len(res.get("ids", []))
    except Exception:
        return 0
