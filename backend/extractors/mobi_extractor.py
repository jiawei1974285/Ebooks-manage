"""Mobi/AZW3 support via Calibre's `ebook-convert` CLI.

Requires Calibre to be installed and `ebook-convert` on PATH, or set
CALIBRE_PATH env var to the Calibre install dir.
"""
import os
import shutil
import subprocess
import tempfile
import logging
from .epub_extractor import extract_epub_metadata

logger = logging.getLogger(__name__)


def _find_ebook_convert() -> str | None:
    # explicit env override
    cal = os.environ.get("CALIBRE_PATH")
    if cal:
        exe = os.path.join(cal, "ebook-convert.exe" if os.name == "nt" else "ebook-convert")
        if os.path.exists(exe):
            return exe
    # PATH lookup
    return shutil.which("ebook-convert") or shutil.which("ebook-convert.exe")


def mobi_available() -> bool:
    return _find_ebook_convert() is not None


def convert_mobi_to_epub(mobi_path: str) -> str:
    """Convert .mobi/.azw3 → .epub in a temp dir. Returns path to epub."""
    exe = _find_ebook_convert()
    if not exe:
        raise RuntimeError("未找到 Calibre `ebook-convert`。请安装 Calibre 或设置 CALIBRE_PATH")

    tmp_dir = tempfile.mkdtemp(prefix="mobi2epub_")
    out_path = os.path.join(tmp_dir, os.path.splitext(os.path.basename(mobi_path))[0] + ".epub")
    try:
        result = subprocess.run(
            [exe, mobi_path, out_path],
            capture_output=True, text=True, timeout=180,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ebook-convert 失败: {result.stderr[-500:]}")
        return out_path
    except subprocess.TimeoutExpired:
        raise RuntimeError("ebook-convert 超时（>180s）")


def extract_mobi_metadata(file_path: str, covers_dir: str) -> dict:
    epub_path = convert_mobi_to_epub(file_path)
    try:
        meta = extract_epub_metadata(epub_path, covers_dir)
        meta["file_format"] = "MOBI"
        return meta
    finally:
        try:
            os.remove(epub_path)
            os.rmdir(os.path.dirname(epub_path))
        except Exception:
            pass


def extract_mobi_full_text(file_path: str) -> list[dict]:
    from text_extractor import extract_epub_full_text
    epub_path = convert_mobi_to_epub(file_path)
    try:
        return extract_epub_full_text(epub_path)
    finally:
        try:
            os.remove(epub_path)
            os.rmdir(os.path.dirname(epub_path))
        except Exception:
            pass
