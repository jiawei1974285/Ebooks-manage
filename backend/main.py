import json
import logging
import os
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, UploadFile, File, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import asyncio

import ai_service
import vector_search
import llm_providers
import settings_store
import rag
from config import COVERS_DIR
from database import Book, SessionLocal, get_db, init_db
from extractors.epub_extractor import extract_epub_metadata
from extractors.pdf_extractor import extract_pdf_metadata
from extractors.mobi_extractor import extract_mobi_metadata, mobi_available
from scanner import scan_directory, compute_file_hash
from text_extractor import extract_full_text
from chunking import chunk_segments
from pathlib import Path
from datetime import datetime
import string
import hashlib
import secrets

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="电子书管理系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/covers", StaticFiles(directory=COVERS_DIR), name="covers")


@app.on_event("startup")
def startup():
    init_db()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    directory: str


class UpdateBookRequest(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    publish_date: Optional[str] = None
    language: Optional[str] = None
    tags: Optional[list[str]] = None
    categories: Optional[list[str]] = None
    description: Optional[str] = None
    summary: Optional[str] = None
    rating: Optional[int] = None
    review: Optional[str] = None
    is_private: Optional[bool] = None


class ChatRequest(BaseModel):
    question: str
    mode: Optional[str] = "rag"  # rag | summary
    book_ids: Optional[list[int]] = None
    top_k: Optional[int] = 6


class SettingsUpdate(BaseModel):
    llm: Optional[dict] = None
    categories: Optional[list[str]] = None
    mineru: Optional[dict] = None


class MinerUTestRequest(BaseModel):
    api_token: str
    base_url: Optional[str] = "https://mineru.net"


class CategoriesUpdate(BaseModel):
    categories: list[str]


class LLMTestRequest(BaseModel):
    provider: str
    model: str
    api_key: Optional[str] = ""
    base_url: Optional[str] = ""


class BatchRequest(BaseModel):
    action: str  # summary | classify | embed
    book_ids: Optional[list[int]] = None  # None = all unprocessed


class ProgressUpdate(BaseModel):
    last_page: int


# ── Private shelf auth ────────────────────────────────────────────────────────

# In-memory session tokens (wiped on server restart)
PRIVATE_TOKENS: set[str] = set()


def _hash_pwd(pwd: str) -> str:
    return hashlib.sha256(pwd.encode("utf-8")).hexdigest()


def is_unlocked(token: Optional[str]) -> bool:
    return bool(token) and token in PRIVATE_TOKENS


class SetPasswordRequest(BaseModel):
    old_password: Optional[str] = None
    new_password: str


class UnlockRequest(BaseModel):
    password: str


@app.get("/api/private/status")
def private_status(x_private_token: Optional[str] = Header(default=None)):
    s = settings_store.load_settings()
    return {
        "has_password": bool(s.get("private_password_hash")),
        "unlocked": is_unlocked(x_private_token),
    }


@app.post("/api/private/set-password")
def private_set_password(req: SetPasswordRequest):
    if not req.new_password or len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="密码至少 4 位")
    s = settings_store.load_settings()
    cur_hash = s.get("private_password_hash", "")
    if cur_hash:
        if not req.old_password or _hash_pwd(req.old_password) != cur_hash:
            raise HTTPException(status_code=401, detail="原密码错误")
    settings_store.update_settings({"private_password_hash": _hash_pwd(req.new_password)})
    # invalidate all existing tokens when password changes
    PRIVATE_TOKENS.clear()
    return {"ok": True}


@app.post("/api/private/unlock")
def private_unlock(req: UnlockRequest):
    s = settings_store.load_settings()
    cur_hash = s.get("private_password_hash", "")
    if not cur_hash:
        raise HTTPException(status_code=400, detail="尚未设置密码")
    if _hash_pwd(req.password) != cur_hash:
        raise HTTPException(status_code=401, detail="密码错误")
    token = secrets.token_urlsafe(32)
    PRIVATE_TOKENS.add(token)
    return {"token": token}


@app.post("/api/private/lock")
def private_lock(x_private_token: Optional[str] = Header(default=None)):
    if x_private_token:
        PRIVATE_TOKENS.discard(x_private_token)
    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def book_to_dict(book: Book) -> dict:
    cover_url = None
    if book.cover_path and os.path.exists(book.cover_path):
        cover_url = f"/covers/{os.path.basename(book.cover_path)}"

    return {
        "id": book.id,
        "file_path": book.file_path,
        "title": book.title,
        "author": book.author,
        "publisher": book.publisher,
        "publish_date": book.publish_date,
        "language": book.language,
        "description": book.description,
        "cover_url": cover_url,
        "file_format": book.file_format,
        "file_size": book.file_size,
        "page_count": book.page_count,
        "summary": book.summary,
        "categories": json.loads(book.categories) if book.categories else [],
        "tags": json.loads(book.tags) if book.tags else [],
        "created_at": book.created_at.isoformat() if book.created_at else None,
        "embedding_done": book.embedding_done,
        "file_hash": book.file_hash,
        "last_page": book.last_page or 0,
        "last_read": book.last_read.isoformat() if book.last_read else None,
        "reading_progress": round((book.last_page or 0) / book.page_count * 100, 1) if book.page_count else 0,
        "indexed": bool(book.indexed),
        "chunk_count": book.chunk_count or 0,
        "rating": book.rating or 0,
        "review": book.review or "",
        "is_private": bool(book.is_private),
    }


def _extract_meta(file_path: str) -> dict:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_pdf_metadata(file_path, COVERS_DIR)
    elif ext == ".epub":
        return extract_epub_metadata(file_path, COVERS_DIR)
    elif ext in (".mobi", ".azw3"):
        return extract_mobi_metadata(file_path, COVERS_DIR)
    raise ValueError(f"不支持的格式: {ext}")


# ── Routes: Books ─────────────────────────────────────────────────────────────

@app.get("/api/books")
def list_books(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    category: Optional[str] = None,
    format: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = Query("created_desc"),
    scope: str = Query("public"),  # public | private | all
    x_private_token: Optional[str] = Header(default=None),
):
    query = db.query(Book)
    unlocked = is_unlocked(x_private_token)
    if scope == "private":
        if not unlocked:
            raise HTTPException(status_code=401, detail="私密书架未解锁")
        query = query.filter(Book.is_private == True)
    elif scope == "all":
        if not unlocked:
            query = query.filter((Book.is_private == False) | (Book.is_private.is_(None)))
    else:  # public
        query = query.filter((Book.is_private == False) | (Book.is_private.is_(None)))
    if q:
        query = query.filter(
            Book.title.contains(q) | Book.author.contains(q)
        )
    if format:
        query = query.filter(Book.file_format == format.upper())
    if category:
        query = query.filter(Book.categories.contains(category))

    sort_map = {
        "created_desc": Book.created_at.desc(),
        "created_asc": Book.created_at.asc(),
        "title": Book.title.asc(),
        "author": Book.author.asc(),
        "size_desc": Book.file_size.desc(),
        "rating_desc": Book.rating.desc(),
        "last_read_desc": Book.last_read.desc(),
    }
    query = query.order_by(sort_map.get(sort, Book.created_at.desc()))

    total = query.count()
    books = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "books": [book_to_dict(b) for b in books]}


@app.get("/api/books/{book_id}")
def get_book(book_id: int, db: Session = Depends(get_db),
             x_private_token: Optional[str] = Header(default=None)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    if book.is_private and not is_unlocked(x_private_token):
        raise HTTPException(status_code=403, detail="该书籍为私密，需要解锁")
    return book_to_dict(book)


@app.put("/api/books/{book_id}")
def update_book(book_id: int, req: UpdateBookRequest, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    if req.title is not None:
        book.title = req.title
    if req.author is not None:
        book.author = req.author
    if req.publisher is not None:
        book.publisher = req.publisher
    if req.publish_date is not None:
        book.publish_date = req.publish_date
    if req.language is not None:
        book.language = req.language
    if req.description is not None:
        book.description = req.description
    if req.summary is not None:
        book.summary = req.summary
    if req.rating is not None:
        book.rating = max(0, min(5, int(req.rating)))
    if req.review is not None:
        book.review = req.review
    if req.is_private is not None:
        book.is_private = bool(req.is_private)
    if req.tags is not None:
        book.tags = json.dumps(req.tags, ensure_ascii=False)
    if req.categories is not None:
        book.categories = json.dumps(req.categories, ensure_ascii=False)
    db.commit()
    return book_to_dict(book)


@app.delete("/api/books/{book_id}")
def delete_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    vector_search.delete_book_embedding(book_id)
    db.delete(book)
    db.commit()
    return {"ok": True}


# ── Routes: Scan ──────────────────────────────────────────────────────────────

@app.post("/api/scan")
def scan(req: ScanRequest, db: Session = Depends(get_db)):
    try:
        files = scan_directory(req.directory)
    except (FileNotFoundError, NotADirectoryError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    added, skipped, errors = 0, 0, []

    duplicates = 0
    for file_path in files:
        if db.query(Book).filter(Book.file_path == file_path).first():
            skipped += 1
            continue
        try:
            file_hash = compute_file_hash(file_path)
            # detect duplicates by hash
            if file_hash and db.query(Book).filter(Book.file_hash == file_hash).first():
                duplicates += 1
                skipped += 1
                continue
            meta = _extract_meta(file_path)
            book = Book(
                file_path=file_path,
                file_hash=file_hash,
                title=meta.get("title", os.path.splitext(os.path.basename(file_path))[0]),
                author=meta.get("author", "Unknown"),
                publisher=meta.get("publisher", ""),
                publish_date=meta.get("publish_date", ""),
                language=meta.get("language", ""),
                description=meta.get("description", ""),
                cover_path=meta.get("cover_path"),
                file_format=meta.get("file_format"),
                file_size=os.path.getsize(file_path),
                page_count=meta.get("page_count", 0),
                categories=json.dumps([]),
                tags=json.dumps([]),
            )
            db.add(book)
            db.commit()
            added += 1
        except Exception as e:
            errors.append({"file": os.path.basename(file_path), "error": str(e)})
            logger.error(f"Error processing {file_path}: {e}")

    return {"found": len(files), "added": added, "skipped": skipped, "duplicates": duplicates, "errors": errors}


# ── Routes: AI ────────────────────────────────────────────────────────────────

@app.post("/api/books/{book_id}/summary")
def generate_summary(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    try:
        meta = _extract_meta(book.file_path)
        excerpt = meta.get("excerpt", "")
        summary = ai_service.generate_summary(book.title, book.author, excerpt)
        book.summary = summary
        db.commit()
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/books/{book_id}/classify")
def classify_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    try:
        categories = ai_service.classify_book(
            book.title, book.author,
            book.description or "",
            book.summary or "",
        )
        book.categories = json.dumps(categories, ensure_ascii=False)
        db.commit()
        return {"categories": categories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/books/{book_id}/embed")
def embed_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    try:
        categories = json.loads(book.categories) if book.categories else []
        vector_search.add_book_embedding(
            book.id, book.title, book.author,
            book.summary or book.description or "",
            categories,
        )
        book.embedding_done = True
        db.commit()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/embed-all")
def embed_all(db: Session = Depends(get_db)):
    books = db.query(Book).filter(Book.embedding_done == False).all()
    success, failed = 0, 0
    for book in books:
        try:
            categories = json.loads(book.categories) if book.categories else []
            vector_search.add_book_embedding(
                book.id, book.title, book.author,
                book.summary or book.description or "",
                categories,
            )
            book.embedding_done = True
            success += 1
        except Exception as e:
            failed += 1
            logger.error(f"Embed failed for book {book.id}: {e}")
    db.commit()
    return {"success": success, "failed": failed}


# ── Routes: Search ────────────────────────────────────────────────────────────

@app.get("/api/search")
def search(
    q: str,
    mode: str = Query("hybrid", pattern="^(keyword|semantic|hybrid)$"),
    db: Session = Depends(get_db),
):
    keyword_books, semantic_books = [], []

    if mode in ("keyword", "hybrid"):
        rows = db.query(Book).filter(
            Book.title.contains(q) | Book.author.contains(q) |
            Book.summary.contains(q) | Book.description.contains(q)
        ).limit(30).all()
        keyword_books = rows

    if mode in ("semantic", "hybrid"):
        book_ids = vector_search.search_books(q, n_results=10)
        if book_ids:
            id_map = {b.id: b for b in db.query(Book).filter(Book.id.in_(book_ids)).all()}
            semantic_books = [id_map[bid] for bid in book_ids if bid in id_map]

    seen, merged = set(), []
    for book in semantic_books + keyword_books:
        if book.id not in seen:
            seen.add(book.id)
            merged.append(book_to_dict(book))

    return {"results": merged, "total": len(merged)}


# ── Routes: Categories & Graph ────────────────────────────────────────────────

@app.get("/api/categories")
def get_categories(db: Session = Depends(get_db),
                   scope: str = Query("public"),
                   x_private_token: Optional[str] = Header(default=None)):
    q = db.query(Book)
    unlocked = is_unlocked(x_private_token)
    if scope == "private":
        if not unlocked:
            raise HTTPException(status_code=401, detail="私密书架未解锁")
        q = q.filter(Book.is_private == True)
    elif scope == "all":
        if not unlocked:
            q = q.filter((Book.is_private == False) | (Book.is_private.is_(None)))
    else:
        q = q.filter((Book.is_private == False) | (Book.is_private.is_(None)))
    counts: dict[str, int] = {}
    for book in q.all():
        for cat in (json.loads(book.categories) if book.categories else []):
            counts[cat] = counts.get(cat, 0) + 1
    return [{"name": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]


@app.get("/api/graph")
def get_graph(db: Session = Depends(get_db)):
    books = db.query(Book).all()

    nodes = []
    for b in books:
        cats = json.loads(b.categories) if b.categories else []
        nodes.append({
            "id": b.id,
            "title": b.title,
            "author": b.author,
            "category": cats[0] if cats else "未分类",
            "cover_url": f"/covers/{os.path.basename(b.cover_path)}" if b.cover_path and os.path.exists(b.cover_path) else None,
        })

    edges = []

    # Same-author edges
    author_map: dict[str, list[int]] = {}
    for b in books:
        if b.author and b.author not in ("Unknown", ""):
            author_map.setdefault(b.author, []).append(b.id)
    for author, ids in author_map.items():
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                edges.append({"source": ids[i], "target": ids[j], "type": "same_author", "label": author})

    # Same-category edges (limit fan-out to avoid clutter)
    cat_map: dict[str, list[int]] = {}
    for b in books:
        for cat in (json.loads(b.categories) if b.categories else []):
            cat_map.setdefault(cat, []).append(b.id)
    for cat, ids in cat_map.items():
        for i in range(len(ids)):
            for j in range(i + 1, min(len(ids), i + 5)):
                edges.append({"source": ids[i], "target": ids[j], "type": "same_category", "label": cat})

    return {"nodes": nodes, "edges": edges}


# ── Routes: Chat ──────────────────────────────────────────────────────────────

@app.post("/api/chat")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    try:
        if req.mode == "rag":
            result = rag.answer_with_rag(req.question, top_k=req.top_k or 6, book_ids=req.book_ids)
            # attach related books (from sources)
            src_ids = list({s["book_id"] for s in result["sources"] if s.get("book_id")})
            books = db.query(Book).filter(Book.id.in_(src_ids)).all() if src_ids else []
            return {
                "answer": result["answer"],
                "sources": result["sources"],
                "used_rag": result["used_rag"],
                "related_books": [book_to_dict(b) for b in books],
            }

        # fallback: summary-based chat
        book_ids = vector_search.search_books(req.question, n_results=5)
        if book_ids:
            books = db.query(Book).filter(Book.id.in_(book_ids)).all()
        else:
            books = db.query(Book).limit(5).all()
        ctx = [{"title": b.title, "author": b.author, "summary": b.summary} for b in books]
        answer = ai_service.answer_question(req.question, ctx)
        return {"answer": answer, "sources": [], "used_rag": False,
                "related_books": [book_to_dict(b) for b in books]}
    except Exception as e:
        logger.exception("Chat error")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


# ── Routes: RAG full-text indexing ───────────────────────────────────────

def _index_one_book(book: Book, db: Session, segments: Optional[list[dict]] = None) -> int:
    """Extract → chunk → embed → persist. Returns chunk count."""
    if segments is None:
        segments = extract_full_text(book.file_path)
    chunks = chunk_segments(segments, chunk_size=800, overlap=120)
    n = vector_search.add_book_chunks(book.id, book.title, book.author or "", chunks)
    book.indexed = True
    book.chunk_count = n
    db.commit()
    return n


@app.post("/api/books/{book_id}/mineru")
def mineru_parse_book(book_id: int,
                      auto_summary: bool = True,
                      auto_index: bool = True,
                      db: Session = Depends(get_db)):
    """Run MinerU OCR extraction on an image-PDF, then optionally generate
    summary and full-text index (RAG)."""
    import mineru_service
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    if not book.file_format or book.file_format.upper() != "PDF":
        raise HTTPException(status_code=400, detail="仅支持 PDF")
    if not mineru_service.is_configured():
        raise HTTPException(status_code=400, detail="MinerU 未启用或未配置 Token")
    cfg = settings_store.load_settings().get("mineru") or {}
    try:
        text = mineru_service.extract_pdf(
            book.file_path,
            is_ocr=bool(cfg.get("is_ocr", True)),
            enable_formula=bool(cfg.get("enable_formula", True)),
            enable_table=bool(cfg.get("enable_table", True)),
            language=cfg.get("language", "ch"),
        )
    except Exception as e:
        logger.exception("MinerU failed")
        raise HTTPException(status_code=500, detail=f"MinerU 解析失败: {e}")

    result = {"ok": True, "text_length": len(text)}

    # Save first 2000 chars as description if book has none
    if not book.description:
        book.description = text[:2000]

    if auto_summary:
        try:
            excerpt = text[:4000]
            summary = ai_service.generate_summary(book.title, book.author, excerpt)
            book.summary = summary
            result["summary"] = summary
        except Exception as e:
            logger.warning(f"auto-summary failed: {e}")
            result["summary_error"] = str(e)

    if auto_index:
        try:
            segments = mineru_service.segments_from_markdown(text)
            n = _index_one_book(book, db, segments=segments)
            result["chunks"] = n
        except Exception as e:
            logger.warning(f"auto-index failed: {e}")
            result["index_error"] = str(e)

    db.commit()
    return result


@app.post("/api/books/{book_id}/index")
def index_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    try:
        n = _index_one_book(book, db)
        return {"ok": True, "chunks": n}
    except Exception as e:
        logger.exception("Index failed")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.delete("/api/books/{book_id}/index")
def unindex_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    vector_search.delete_book_chunks(book_id)
    book.indexed = False
    book.chunk_count = 0
    db.commit()
    return {"ok": True}


@app.get("/api/index/stream")
async def index_stream(book_ids: Optional[str] = None):
    """SSE: index multiple books. book_ids='1,2,3' or omit to index all un-indexed."""
    async def gen():
        db = SessionLocal()
        loop = asyncio.get_event_loop()
        try:
            q = db.query(Book)
            if book_ids:
                ids = [int(x) for x in book_ids.split(",") if x.strip()]
                books = q.filter(Book.id.in_(ids)).all()
            else:
                books = q.filter((Book.indexed == False) | (Book.indexed == None)).all()

            yield _sse({"type": "start", "total": len(books)})
            ok, fail = 0, 0
            for i, b in enumerate(books, 1):
                try:
                    n = await loop.run_in_executor(None, _index_one_book, b, db)
                    ok += 1
                    yield _sse({"type": "progress", "i": i, "total": len(books),
                                "book_id": b.id, "title": b.title, "chunks": n, "status": "ok"})
                except Exception as e:
                    fail += 1
                    logger.exception(f"index failed for {b.id}")
                    yield _sse({"type": "progress", "i": i, "total": len(books),
                                "book_id": b.id, "title": b.title, "status": "error", "error": str(e)})
                await asyncio.sleep(0)
            yield _sse({"type": "done", "ok": ok, "failed": fail, "total": len(books)})
        finally:
            db.close()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Routes: Export / backup ──────────────────────────────────────────────

@app.get("/api/export")
def export_library(db: Session = Depends(get_db)):
    """Export full library metadata as JSON (for backup / migration)."""
    books = db.query(Book).all()
    data = {
        "version": 1,
        "exported_at": datetime.utcnow().isoformat(),
        "count": len(books),
        "books": [book_to_dict(b) for b in books],
    }
    return data


# ── Routes: System info ─────────────────────────────────────────────────

@app.get("/api/system")
def get_system():
    return {
        "mobi_available": mobi_available(),
        "supported_formats": ["PDF", "EPUB"] + (["MOBI", "AZW3"] if mobi_available() else []),
    }


# ── Routes: Settings ─────────────────────────────────────────────────────────

@app.get("/api/settings")
def get_settings():
    s = settings_store.load_settings()
    # 不回传 api_key 明文（前端用占位符表示已设置）
    llm = dict(s["llm"])
    for k in ("api_key", "embed_api_key"):
        llm[f"{k}_set"] = bool(llm.get(k))
        llm[k] = ""
    mineru = dict(s.get("mineru") or {})
    mineru["api_token_set"] = bool(mineru.get("api_token"))
    mineru["api_token"] = ""
    return {"llm": llm, "presets": settings_store.PROVIDER_PRESETS, "mineru": mineru}


@app.put("/api/settings")
def update_settings_route(req: SettingsUpdate):
    patch = {}
    if req.llm is not None:
        cur = settings_store.load_settings()["llm"]
        # 空字符串的 api_key 保留原值（避免前端占位覆盖）
        new_llm = {**cur, **req.llm}
        if req.llm.get("api_key", None) == "" and cur.get("api_key"):
            new_llm["api_key"] = cur["api_key"]
        if req.llm.get("embed_api_key", None) == "" and cur.get("embed_api_key"):
            new_llm["embed_api_key"] = cur["embed_api_key"]
        patch["llm"] = new_llm
    if req.categories is not None:
        patch["categories"] = [c.strip() for c in req.categories if c.strip()]
    if req.mineru is not None:
        cur_m = settings_store.load_settings().get("mineru") or {}
        new_m = {**cur_m, **req.mineru}
        # preserve stored token if frontend sends empty (placeholder)
        if req.mineru.get("api_token", None) == "" and cur_m.get("api_token"):
            new_m["api_token"] = cur_m["api_token"]
        patch["mineru"] = new_m
    settings_store.update_settings(patch)
    return {"ok": True}


@app.post("/api/mineru/test")
def mineru_test(req: MinerUTestRequest):
    import mineru_service
    token = req.api_token
    if not token:
        cur = settings_store.load_settings().get("mineru") or {}
        token = cur.get("api_token", "")
    if not token:
        raise HTTPException(status_code=400, detail="未提供 API Token")
    return mineru_service.test_connection(req.base_url or "https://mineru.net", token)


# ── Routes: Categories config ────────────────────────────────────────────

@app.get("/api/categories/config")
def get_categories_config():
    s = settings_store.load_settings()
    return {"categories": s.get("categories", [])}


@app.put("/api/categories/config")
def set_categories_config(req: CategoriesUpdate):
    cleaned = []
    seen = set()
    for c in req.categories:
        c = (c or "").strip()
        if c and c not in seen:
            seen.add(c)
            cleaned.append(c)
    settings_store.update_settings({"categories": cleaned})
    return {"ok": True, "categories": cleaned}


@app.post("/api/categories/suggest")
def suggest_categories_route(db: Session = Depends(get_db)):
    """LLM suggests a taxonomy based on the current library."""
    # pick a representative sample (up to 60 books, prefer ones with summaries)
    books = db.query(Book).order_by(Book.id.desc()).limit(200).all()
    with_sum = [b for b in books if b.summary]
    without = [b for b in books if not b.summary]
    sample_books = (with_sum[:40] + without[:20])[:60]
    samples = [{"title": b.title, "author": b.author, "summary": b.summary} for b in sample_books]

    existing = settings_store.load_settings().get("categories", [])
    try:
        suggested = ai_service.suggest_categories(samples, existing)
        return {"suggested": suggested, "current": existing, "sample_size": len(samples)}
    except Exception as e:
        logger.exception("category suggest failed")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


# ── Routes: Duplicate scan ───────────────────────────────────────────────

@app.post("/api/duplicates/scan")
def rescan_duplicates(db: Session = Depends(get_db)):
    """Backfill file_hash for any book missing one, then return duplicate groups."""
    books = db.query(Book).filter((Book.file_hash == None) | (Book.file_hash == "")).all()
    updated, missing = 0, 0
    for b in books:
        if not b.file_path or not os.path.exists(b.file_path):
            missing += 1
            continue
        h = compute_file_hash(b.file_path)
        if h:
            b.file_hash = h
            updated += 1
    db.commit()

    # recompute duplicate groups
    from collections import defaultdict
    groups = defaultdict(list)
    for b in db.query(Book).filter(Book.file_hash != None, Book.file_hash != "").all():
        groups[b.file_hash].append(b)
    dup_groups = [
        {"hash": h, "books": [book_to_dict(b) for b in bs]}
        for h, bs in groups.items() if len(bs) > 1
    ]
    return {
        "scanned": len(books),
        "updated": updated,
        "missing_files": missing,
        "duplicate_groups": len(dup_groups),
        "groups": dup_groups,
    }


@app.post("/api/settings/test")
def test_llm(req: LLMTestRequest):
    cfg = req.dict()
    # 若 api_key 为空，尝试用已保存的
    if not cfg.get("api_key"):
        cfg["api_key"] = settings_store.load_settings()["llm"].get("api_key", "")
    return llm_providers.test_connection(cfg)


# ── Routes: File browser ─────────────────────────────────────────────────────

@app.get("/api/browse")
def browse(path: str = ""):
    """List drives (empty path on Windows) or subdirectories of the given path."""
    try:
        if not path:
            # list Windows drives
            if os.name == "nt":
                drives = []
                for letter in string.ascii_uppercase:
                    d = f"{letter}:\\"
                    if os.path.exists(d):
                        drives.append({"name": f"{letter}:", "path": d, "type": "drive"})
                return {"path": "", "parent": None, "entries": drives}
            else:
                path = "/"

        p = Path(path).resolve()
        if not p.exists() or not p.is_dir():
            raise HTTPException(status_code=400, detail="目录不存在")

        entries = []
        try:
            for item in sorted(p.iterdir(), key=lambda x: x.name.lower()):
                try:
                    if item.is_dir() and not item.name.startswith("."):
                        entries.append({
                            "name": item.name,
                            "path": str(item),
                            "type": "dir",
                        })
                except (PermissionError, OSError):
                    continue
        except PermissionError:
            raise HTTPException(status_code=403, detail="无权限访问此目录")

        parent = str(p.parent) if p.parent != p else None
        # On Windows, if we're at a drive root, parent should show drive list
        if os.name == "nt" and p.parent == p:
            parent = ""

        return {"path": str(p), "parent": parent, "entries": entries}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Routes: Batch operations ────────────────────────────────────────────────

@app.post("/api/batch")
def batch_action(req: BatchRequest, db: Session = Depends(get_db)):
    action = req.action
    if action not in ("summary", "classify", "embed", "index"):
        raise HTTPException(status_code=400, detail="invalid action")

    # Select target books
    query = db.query(Book)
    if req.book_ids:
        books = query.filter(Book.id.in_(req.book_ids)).all()
    else:
        # default: rows missing this field
        if action == "summary":
            books = query.filter((Book.summary == None) | (Book.summary == "")).all()
        elif action == "classify":
            books = query.filter((Book.categories == None) | (Book.categories == "[]")).all()
        elif action == "embed":
            books = query.filter(Book.embedding_done == False).all()
        else:  # index
            books = query.filter((Book.indexed == False) | (Book.indexed == None)).all()

    success, failed, errors = 0, 0, []
    for book in books:
        try:
            if action == "summary":
                meta = _extract_meta(book.file_path)
                book.summary = ai_service.generate_summary(book.title, book.author, meta.get("excerpt", ""))
            elif action == "classify":
                cats = ai_service.classify_book(
                    book.title, book.author,
                    book.description or "", book.summary or "",
                )
                book.categories = json.dumps(cats, ensure_ascii=False)
            elif action == "embed":
                cats = json.loads(book.categories) if book.categories else []
                vector_search.add_book_embedding(
                    book.id, book.title, book.author,
                    book.summary or book.description or "", cats,
                )
                book.embedding_done = True
            elif action == "index":
                _index_one_book(book, db)
            db.commit()
            success += 1
        except Exception as e:
            failed += 1
            errors.append({"book_id": book.id, "title": book.title, "error": str(e)})
            logger.exception(f"batch {action} failed for book {book.id}")

    return {"success": success, "failed": failed, "total": len(books), "errors": errors[:10]}


# ── Routes: Stats ────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    books = db.query(Book).all()
    total = len(books)
    pdf_count = sum(1 for b in books if b.file_format == "PDF")
    epub_count = sum(1 for b in books if b.file_format == "EPUB")
    total_size = sum(b.file_size or 0 for b in books)
    with_summary = sum(1 for b in books if b.summary)
    with_categories = sum(1 for b in books if b.categories and b.categories != "[]")
    embedded = sum(1 for b in books if b.embedding_done)
    authors = len(set(b.author for b in books if b.author and b.author != "Unknown"))

    cat_counts = {}
    for b in books:
        for c in (json.loads(b.categories) if b.categories else []):
            cat_counts[c] = cat_counts.get(c, 0) + 1

    return {
        "total": total,
        "pdf": pdf_count,
        "epub": epub_count,
        "total_size_mb": round(total_size / (1024 * 1024), 1),
        "authors": authors,
        "with_summary": with_summary,
        "with_categories": with_categories,
        "embedded": embedded,
        "category_distribution": [{"name": k, "count": v} for k, v in sorted(cat_counts.items(), key=lambda x: -x[1])],
    }


# ── File serving ─────────────────────────────────────────────────────────────

from fastapi.responses import FileResponse

@app.get("/api/books/{book_id}/file")
def get_book_file(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book or not os.path.exists(book.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    media = "application/pdf" if book.file_format == "PDF" else "application/epub+zip"
    # inline disposition → browser previews in-place instead of downloading.
    # Use RFC 5987 encoding to handle non-ASCII filenames.
    from urllib.parse import quote
    fname = os.path.basename(book.file_path)
    disp = f"inline; filename*=UTF-8''{quote(fname)}"
    return FileResponse(
        book.file_path,
        media_type=media,
        headers={"Content-Disposition": disp},
    )


@app.post("/api/books/{book_id}/open-local")
def open_book_local(book_id: int, reveal: bool = False, db: Session = Depends(get_db)):
    """用本机默认程序打开原文件（reveal=true 则定位到所在文件夹）。仅限本地访问。"""
    import sys
    import subprocess
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book or not os.path.exists(book.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    path = os.path.abspath(book.file_path)
    try:
        if sys.platform.startswith("win"):
            if reveal:
                subprocess.Popen(["explorer", "/select,", path])
            else:
                os.startfile(path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R" if reveal else path, path] if reveal else ["open", path])
        else:
            target = os.path.dirname(path) if reveal else path
            subprocess.Popen(["xdg-open", target])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打开失败: {e}")
    return {"ok": True, "path": path, "reveal": reveal}


# ── Routes: SSE scan with progress ───────────────────────────────────────────

def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _scan_event_stream(directory: str):
    """Async generator yielding SSE events. Uses its own DB session."""
    import concurrent.futures
    import functools

    loop = asyncio.get_event_loop()
    db = SessionLocal()
    try:
        try:
            files = scan_directory(directory)
        except (FileNotFoundError, NotADirectoryError) as e:
            yield _sse({"type": "error", "message": str(e)})
            return

        yield _sse({"type": "start", "total": len(files)})

        added, skipped, duplicates, errors = 0, 0, 0, []

        for i, file_path in enumerate(files, 1):
            filename = os.path.basename(file_path)

            if db.query(Book).filter(Book.file_path == file_path).first():
                skipped += 1
                yield _sse({"type": "progress", "i": i, "total": len(files), "file": filename, "status": "skipped"})
                await asyncio.sleep(0)
                continue

            try:
                # Run CPU-heavy work in thread to avoid blocking event loop
                file_hash = await loop.run_in_executor(None, compute_file_hash, file_path)
                if file_hash and db.query(Book).filter(Book.file_hash == file_hash).first():
                    duplicates += 1
                    skipped += 1
                    yield _sse({"type": "progress", "i": i, "total": len(files), "file": filename, "status": "duplicate"})
                    continue

                meta = await loop.run_in_executor(None, functools.partial(_extract_meta, file_path))
                book = Book(
                    file_path=file_path,
                    file_hash=file_hash,
                    title=meta.get("title") or os.path.splitext(filename)[0],
                    author=meta.get("author", "Unknown"),
                    publisher=meta.get("publisher", ""),
                    publish_date=meta.get("publish_date", ""),
                    language=meta.get("language", ""),
                    description=meta.get("description", ""),
                    cover_path=meta.get("cover_path"),
                    file_format=meta.get("file_format"),
                    file_size=os.path.getsize(file_path),
                    page_count=meta.get("page_count", 0),
                    categories=json.dumps([]),
                    tags=json.dumps([]),
                )
                db.add(book)
                db.commit()
                added += 1
                yield _sse({
                    "type": "progress", "i": i, "total": len(files), "file": filename, "status": "added",
                    "book": {"id": book.id, "title": book.title, "author": book.author, "file_format": book.file_format},
                })
            except Exception as e:
                errors.append({"file": filename, "error": str(e)})
                yield _sse({"type": "progress", "i": i, "total": len(files), "file": filename, "status": "error", "error": str(e)})
                logger.exception(f"Error processing {file_path}")

        yield _sse({
            "type": "done", "found": len(files), "added": added, "skipped": skipped,
            "duplicates": duplicates, "errors": errors,
        })
    finally:
        db.close()


@app.get("/api/scan/stream")
async def scan_stream(directory: str):
    return StreamingResponse(
        _scan_event_stream(directory),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Routes: Duplicates ──────────────────────────────────────────────────────

@app.get("/api/duplicates")
def list_duplicates(db: Session = Depends(get_db)):
    """Find groups of books with the same file_hash."""
    from collections import defaultdict
    groups = defaultdict(list)
    for b in db.query(Book).filter(Book.file_hash != None, Book.file_hash != "").all():
        groups[b.file_hash].append(b)
    return {
        "groups": [
            {"hash": h, "books": [book_to_dict(b) for b in bs]}
            for h, bs in groups.items() if len(bs) > 1
        ]
    }


# ── Routes: Reading progress ────────────────────────────────────────────────

from datetime import datetime as _dt

@app.post("/api/books/{book_id}/progress")
def update_progress(book_id: int, req: ProgressUpdate, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在")
    book.last_page = req.last_page
    book.last_read = _dt.utcnow()
    db.commit()
    return book_to_dict(book)


# ── Routes: Upload (drag-and-drop import) ───────────────────────────────────

UPLOADS_DIR = os.path.join(os.path.dirname(COVERS_DIR), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


@app.post("/api/upload")
async def upload_books(files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    added, skipped, duplicates, errors = 0, 0, 0, []
    for f in files:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in (".pdf", ".epub"):
            errors.append({"file": f.filename, "error": "不支持的格式"})
            continue
        save_path = os.path.join(UPLOADS_DIR, f.filename)
        # avoid overwriting
        base, e = os.path.splitext(save_path)
        i = 1
        while os.path.exists(save_path):
            save_path = f"{base}_{i}{e}"
            i += 1
        content = await f.read()
        with open(save_path, "wb") as out:
            out.write(content)

        # dedup by hash
        file_hash = compute_file_hash(save_path)
        if file_hash and db.query(Book).filter(Book.file_hash == file_hash).first():
            os.remove(save_path)
            duplicates += 1
            skipped += 1
            continue

        try:
            meta = _extract_meta(save_path)
            book = Book(
                file_path=save_path,
                file_hash=file_hash,
                title=meta.get("title") or os.path.splitext(f.filename)[0],
                author=meta.get("author", "Unknown"),
                publisher=meta.get("publisher", ""),
                publish_date=meta.get("publish_date", ""),
                language=meta.get("language", ""),
                description=meta.get("description", ""),
                cover_path=meta.get("cover_path"),
                file_format=meta.get("file_format"),
                file_size=os.path.getsize(save_path),
                page_count=meta.get("page_count", 0),
                categories=json.dumps([]),
                tags=json.dumps([]),
            )
            db.add(book)
            db.commit()
            added += 1
        except Exception as e:
            errors.append({"file": f.filename, "error": str(e)})

    return {"added": added, "skipped": skipped, "duplicates": duplicates, "errors": errors}
