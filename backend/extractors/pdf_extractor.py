import os
import fitz  # PyMuPDF
import logging

logger = logging.getLogger(__name__)


def extract_pdf_metadata(file_path: str, covers_dir: str) -> dict:
    doc = fitz.open(file_path)
    try:
        metadata = doc.metadata
        page_count = len(doc)

        title = (metadata.get("title") or "").strip() or os.path.splitext(os.path.basename(file_path))[0]
        author = (metadata.get("author") or "").strip() or "Unknown"
        publisher = (metadata.get("producer") or "").strip()
        publish_date = (metadata.get("creationDate") or "").strip()

        # Extract first-page cover
        cover_path = None
        if page_count > 0:
            try:
                page = doc[0]
                mat = fitz.Matrix(0.6, 0.6)
                pix = page.get_pixmap(matrix=mat)
                safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in os.path.splitext(os.path.basename(file_path))[0])
                cover_filename = f"{safe_name}_cover.png"
                cover_path = os.path.join(covers_dir, cover_filename)
                pix.save(cover_path)
            except Exception as e:
                logger.warning(f"Cover extraction failed for {file_path}: {e}")

        # Extract text from first 10 pages for AI processing
        text_parts = []
        for i, page in enumerate(doc):
            if i >= 10:
                break
            text_parts.append(page.get_text())
        excerpt = "\n".join(text_parts)[:4000]

        return {
            "title": title,
            "author": author,
            "publisher": publisher,
            "publish_date": publish_date,
            "language": "",
            "description": "",
            "cover_path": cover_path,
            "page_count": page_count,
            "file_format": "PDF",
            "excerpt": excerpt,
        }
    finally:
        doc.close()
