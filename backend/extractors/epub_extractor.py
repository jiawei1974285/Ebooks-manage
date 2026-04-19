import os
import re
import logging
import ebooklib
from ebooklib import epub

logger = logging.getLogger(__name__)


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)


def extract_epub_metadata(file_path: str, covers_dir: str) -> dict:
    book = epub.read_epub(file_path, options={"ignore_ncx": True})

    def _get(namespace, key):
        items = book.get_metadata(namespace, key)
        return items[0][0].strip() if items else ""

    title = _get("DC", "title") or os.path.splitext(os.path.basename(file_path))[0]
    author = _get("DC", "creator") or "Unknown"
    publisher = _get("DC", "publisher")
    publish_date = _get("DC", "date")
    language = _get("DC", "language")
    description = _strip_html(_get("DC", "description"))

    # Extract cover image
    cover_path = None
    try:
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_COVER or (
                hasattr(item, "get_name") and "cover" in item.get_name().lower()
                and item.get_type() == ebooklib.ITEM_IMAGE
            ):
                safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in os.path.splitext(os.path.basename(file_path))[0])
                cover_filename = f"{safe_name}_cover.png"
                cover_path = os.path.join(covers_dir, cover_filename)
                with open(cover_path, "wb") as f:
                    f.write(item.get_content())
                break
    except Exception as e:
        logger.warning(f"Cover extraction failed for {file_path}: {e}")

    # Extract text from document items
    text_parts = []
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        content = item.get_content().decode("utf-8", errors="ignore")
        text_parts.append(_strip_html(content))
        if sum(len(t) for t in text_parts) > 4000:
            break
    excerpt = " ".join(text_parts)[:4000]

    doc_items = list(book.get_items_of_type(ebooklib.ITEM_DOCUMENT))

    return {
        "title": title,
        "author": author,
        "publisher": publisher,
        "publish_date": publish_date,
        "language": language,
        "description": description,
        "cover_path": cover_path,
        "page_count": len(doc_items),
        "file_format": "EPUB",
        "excerpt": excerpt,
    }
