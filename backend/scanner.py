import hashlib
from pathlib import Path

SUPPORTED_EXTENSIONS = {".pdf", ".epub", ".mobi", ".azw3"}


def scan_directory(directory: str) -> list[str]:
    path = Path(directory)
    if not path.exists():
        raise FileNotFoundError(f"目录不存在: {directory}")
    if not path.is_dir():
        raise NotADirectoryError(f"不是目录: {directory}")

    return [
        str(f)
        for f in path.rglob("*")
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS
    ]


def compute_file_hash(file_path: str, chunk_size: int = 1024 * 1024) -> str:
    """Return md5 of first `chunk_size` bytes + file size. Fast and collision-resistant enough for dedup."""
    h = hashlib.md5()
    try:
        size = Path(file_path).stat().st_size
        h.update(str(size).encode())
        with open(file_path, "rb") as f:
            h.update(f.read(chunk_size))
        return h.hexdigest()
    except Exception:
        return ""
