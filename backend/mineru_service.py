"""MinerU cloud-API integration for OCR/image-PDF extraction.

Flow (mineru.net public API):
  1. POST {base}/api/v4/file-urls/batch   → batch_id + per-file upload URLs
  2. PUT each upload URL with raw bytes   (no auth header)
  3. GET {base}/api/v4/extract-results/batch/{batch_id}  → poll until done
  4. Download full_zip_url, extract markdown text from zip

Docs: https://mineru.net/apiManage/docs
"""
import io
import logging
import os
import time
import zipfile
from typing import Callable, Optional

import requests

import settings_store

logger = logging.getLogger(__name__)

DEFAULT_BASE = "https://mineru.net"


def _cfg() -> dict:
    s = settings_store.load_settings()
    return s.get("mineru") or {}


def is_configured() -> bool:
    c = _cfg()
    return bool(c.get("enabled")) and bool(c.get("api_token"))


def test_connection(base_url: str, token: str) -> dict:
    """Quick auth check by hitting the batch-create endpoint with empty payload
    (should return 400 if auth works, 401 if not)."""
    url = (base_url or DEFAULT_BASE).rstrip("/") + "/api/v4/file-urls/batch"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        r = requests.post(url, headers=headers, json={"files": []}, timeout=15)
        if r.status_code == 401 or r.status_code == 403:
            return {"ok": False, "message": "Token 无效或无权限"}
        # Any other response means endpoint + auth are reachable
        return {"ok": True, "message": f"连接成功（HTTP {r.status_code}）"}
    except requests.RequestException as e:
        return {"ok": False, "message": f"连接失败: {e}"}


def extract_pdf(
    file_path: str,
    *,
    is_ocr: bool = True,
    enable_formula: bool = True,
    enable_table: bool = True,
    language: str = "ch",
    poll_interval: float = 5.0,
    timeout: float = 600.0,
    progress: Optional[Callable[[str], None]] = None,
) -> str:
    """Run PDF through MinerU and return extracted markdown text.

    Raises RuntimeError on any non-recoverable failure.
    """
    cfg = _cfg()
    if not cfg.get("api_token"):
        raise RuntimeError("未配置 MinerU API Token")
    base = (cfg.get("base_url") or DEFAULT_BASE).rstrip("/")
    token = cfg["api_token"]
    headers = {"Authorization": f"Bearer {token}"}

    def log(msg: str):
        logger.info(f"[MinerU] {msg}")
        if progress:
            try: progress(msg)
            except Exception: pass

    file_name = os.path.basename(file_path)

    # 1. Create batch
    log(f"创建批次: {file_name}")
    create_resp = requests.post(
        f"{base}/api/v4/file-urls/batch",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "enable_formula": enable_formula,
            "enable_table": enable_table,
            "language": language,
            "files": [{"name": file_name, "is_ocr": is_ocr, "data_id": "book"}],
        },
        timeout=30,
    )
    if create_resp.status_code != 200:
        raise RuntimeError(f"MinerU 创建任务失败: HTTP {create_resp.status_code} {create_resp.text[:300]}")
    body = create_resp.json()
    if body.get("code") not in (0, 200):
        raise RuntimeError(f"MinerU 创建任务失败: {body.get('msg') or body}")
    data = body.get("data") or {}
    batch_id = data.get("batch_id")
    urls = data.get("file_urls") or []
    if not batch_id or not urls:
        raise RuntimeError(f"MinerU 返回异常: {body}")

    # 2. Upload file
    log("上传文件...")
    with open(file_path, "rb") as f:
        put = requests.put(urls[0], data=f, timeout=300)
    if put.status_code not in (200, 204):
        raise RuntimeError(f"MinerU 上传失败: HTTP {put.status_code}")

    # 3. Poll
    log(f"等待解析（batch_id={batch_id}）...")
    start = time.time()
    result_url = f"{base}/api/v4/extract-results/batch/{batch_id}"
    full_zip_url = None
    last_state = ""
    while time.time() - start < timeout:
        time.sleep(poll_interval)
        r = requests.get(result_url, headers=headers, timeout=30)
        if r.status_code != 200:
            log(f"轮询失败 HTTP {r.status_code}")
            continue
        resp = r.json()
        items = ((resp.get("data") or {}).get("extract_result")) or []
        if not items:
            continue
        item = items[0]
        state = item.get("state", "")
        if state != last_state:
            log(f"状态: {state}")
            last_state = state
        if state == "done":
            full_zip_url = item.get("full_zip_url")
            break
        if state in ("failed", "error"):
            raise RuntimeError(f"MinerU 解析失败: {item.get('err_msg') or item}")
    if not full_zip_url:
        raise RuntimeError(f"MinerU 解析超时（{timeout}s）")

    # 4. Download + extract markdown
    log("下载结果...")
    zip_resp = requests.get(full_zip_url, timeout=120)
    if zip_resp.status_code != 200:
        raise RuntimeError(f"下载结果失败: HTTP {zip_resp.status_code}")
    zf = zipfile.ZipFile(io.BytesIO(zip_resp.content))
    md_names = [n for n in zf.namelist() if n.lower().endswith(".md")]
    if not md_names:
        raise RuntimeError("MinerU 结果中未找到 markdown 文件")
    # Prefer full.md or the largest .md
    md_names.sort(key=lambda n: -zf.getinfo(n).file_size)
    with zf.open(md_names[0]) as f:
        text = f.read().decode("utf-8", errors="ignore")
    log(f"完成，提取 {len(text)} 字")
    return text


def segments_from_markdown(text: str, chars_per_seg: int = 2500) -> list[dict]:
    """Split MinerU markdown into pseudo-page segments for chunking/RAG.
    MinerU's markdown is single-flow (no page markers), so we slice by size
    and use sequential fake-page numbers.
    """
    text = text.strip()
    if not text:
        return []
    segs = []
    i = 0
    page = 1
    while i < len(text):
        chunk = text[i:i + chars_per_seg]
        segs.append({"text": chunk, "page": page})
        i += chars_per_seg
        page += 1
    return segs
