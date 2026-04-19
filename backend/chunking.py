"""Sentence-aware sliding-window chunker for RAG."""
import re

# Sentence splitter works for Chinese and English.
_SENT_RE = re.compile(r"(?<=[。！？!?.])\s+|\n{2,}")


def split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    parts = _SENT_RE.split(text)
    return [p.strip() for p in parts if p and p.strip()]


def chunk_segments(
    segments: list[dict],
    chunk_size: int = 800,
    overlap: int = 120,
) -> list[dict]:
    """
    Merge page segments into chunks of ~chunk_size chars with overlap.
    Preserves the `page` of the first sentence in each chunk (for citation).
    Returns [{text, page, idx}, ...].
    """
    sentences: list[tuple[str, int]] = []  # (sentence, page)
    for seg in segments:
        for s in split_sentences(seg["text"]):
            sentences.append((s, seg["page"]))

    chunks: list[dict] = []
    buf: list[str] = []
    buf_page: int | None = None
    buf_len = 0

    def flush():
        nonlocal buf, buf_page, buf_len
        if buf:
            text = " ".join(buf).strip()
            if text:
                chunks.append({"text": text, "page": buf_page or 1, "idx": len(chunks)})
        buf = []
        buf_page = None
        buf_len = 0

    for sent, page in sentences:
        if buf_page is None:
            buf_page = page
        if buf_len + len(sent) + 1 > chunk_size and buf:
            # flush and start new buffer with overlap from end of previous
            prev_text = " ".join(buf)
            flush()
            tail = prev_text[-overlap:] if overlap > 0 else ""
            if tail:
                buf = [tail]
                buf_len = len(tail)
                buf_page = page
        buf.append(sent)
        buf_len += len(sent) + 1
        if buf_page is None:
            buf_page = page

    flush()
    return chunks
