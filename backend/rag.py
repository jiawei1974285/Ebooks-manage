"""RAG (retrieval augmented generation) service."""
import logging
from llm_providers import chat_complete
import vector_search

logger = logging.getLogger(__name__)


def build_context(chunks: list[dict], max_chars: int = 5000) -> str:
    parts = []
    total = 0
    for i, c in enumerate(chunks, 1):
        header = f"[来源 {i}]《{c.get('title','')}》 第 {c.get('page',0)} 页"
        body = c.get("text", "")
        piece = f"{header}\n{body}"
        if total + len(piece) > max_chars:
            break
        parts.append(piece)
        total += len(piece)
    return "\n\n---\n\n".join(parts)


def answer_with_rag(question: str, top_k: int = 6, book_ids: list[int] | None = None) -> dict:
    chunks = vector_search.search_chunks(question, n_results=top_k, book_ids=book_ids)
    if not chunks:
        return {
            "answer": "抱歉，没有找到与问题相关的内容。请先为书籍建立全文索引，或换一个问法。",
            "sources": [],
            "used_rag": False,
        }

    context = build_context(chunks)
    prompt = f"""你是一位严谨的书库助手。请基于下面提供的【书摘片段】回答用户的问题。

要求：
- 回答必须基于提供的片段内容，不要编造。如果信息不足，请明确说明。
- 在关键结论后用 [来源 N] 的形式标注引用，比如「... [来源 1]」。
- 使用简洁自然的中文，分段清晰。

【书摘片段】
{context}

【用户问题】
{question}

【你的回答】"""

    answer = chat_complete([{"role": "user", "content": prompt}], temperature=0.3)
    sources = [
        {
            "idx": i + 1,
            "book_id": c["book_id"],
            "title": c.get("title", ""),
            "author": c.get("author", ""),
            "page": c.get("page", 0),
            "snippet": (c["text"][:200] + "…") if len(c["text"]) > 200 else c["text"],
        }
        for i, c in enumerate(chunks)
    ]
    return {"answer": answer, "sources": sources, "used_rag": True}
