"""Full-text extraction with page/section info for RAG indexing."""
import os
import re
import logging
import fitz  # PyMuPDF
import ebooklib
from ebooklib import epub

logger = logging.getLogger(__name__)


def _strip_html(html: str) -> str:
    # drop style/script first, then tags, collapse whitespace
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_pdf_full_text(file_path: str) -> list[dict]:
    """Return list of {text, page} segments, one per page."""
    segments = []
    doc = fitz.open(file_path)
    try:
        for i, page in enumerate(doc):
            text = page.get_text().strip()
            if text:
                segments.append({"text": text, "page": i + 1})
    finally:
        doc.close()
    return segments


def extract_epub_full_text(file_path: str) -> list[dict]:
    """Return list of {text, page} segments, one per document item."""
    book = epub.read_epub(file_path, options={"ignore_ncx": True})
    segments = []
    for i, item in enumerate(book.get_items_of_type(ebooklib.ITEM_DOCUMENT)):
        try:
            content = item.get_content().decode("utf-8", errors="ignore")
            text = _strip_html(content)
            if text and len(text) > 30:
                segments.append({"text": text, "page": i + 1})
        except Exception as e:
            logger.warning(f"EPUB item parse failed: {e}")
    return segments


def extract_full_text(file_path: str) -> list[dict]:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_pdf_full_text(file_path)
    if ext == ".epub":
        return extract_epub_full_text(file_path)
    if ext in (".mobi", ".azw3"):
        from extractors.mobi_extractor import extract_mobi_full_text
        return extract_mobi_full_text(file_path)
    raise ValueError(f"不支持的格式: {ext}")
