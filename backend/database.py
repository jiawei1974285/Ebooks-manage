from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'ebook_manager.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String, unique=True, index=True)
    file_hash = Column(String, index=True)  # md5 of first 1MB for dedup
    title = Column(String, index=True)
    author = Column(String, index=True)
    publisher = Column(String)
    publish_date = Column(String)
    language = Column(String)
    description = Column(Text)
    cover_path = Column(String)
    file_format = Column(String)
    file_size = Column(Integer)
    page_count = Column(Integer)
    summary = Column(Text)
    categories = Column(Text)
    tags = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    embedding_done = Column(Boolean, default=False)
    last_page = Column(Integer, default=0)
    last_read = Column(DateTime)
    indexed = Column(Boolean, default=False)  # full-text indexed for RAG
    chunk_count = Column(Integer, default=0)
    rating = Column(Integer, default=0)  # 0 = unrated, 1~5 stars
    review = Column(Text)                 # user's free-form review/notes
    is_private = Column(Boolean, default=False)  # hidden from main shelf; require password


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


MIGRATIONS = [
    ("file_hash", "ALTER TABLE books ADD COLUMN file_hash TEXT"),
    ("last_page", "ALTER TABLE books ADD COLUMN last_page INTEGER DEFAULT 0"),
    ("last_read", "ALTER TABLE books ADD COLUMN last_read DATETIME"),
    ("indexed", "ALTER TABLE books ADD COLUMN indexed BOOLEAN DEFAULT 0"),
    ("chunk_count", "ALTER TABLE books ADD COLUMN chunk_count INTEGER DEFAULT 0"),
    ("rating", "ALTER TABLE books ADD COLUMN rating INTEGER DEFAULT 0"),
    ("review", "ALTER TABLE books ADD COLUMN review TEXT"),
    ("is_private", "ALTER TABLE books ADD COLUMN is_private BOOLEAN DEFAULT 0"),
]


def migrate():
    """Add missing columns to an existing DB (simple SQLite migration)."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(books)")).fetchall()
        existing = {r[1] for r in rows}
        for col, sql in MIGRATIONS:
            if col not in existing:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    logger.info(f"Migrated: added column {col}")
                except Exception as e:
                    logger.error(f"Migration failed for {col}: {e}")


def init_db():
    Base.metadata.create_all(bind=engine)
    migrate()
