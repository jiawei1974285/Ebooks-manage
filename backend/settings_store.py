"""Persistent user settings (LLM provider config, etc.)"""
import json
import os
from typing import Any
from config import BASE_DIR

SETTINGS_PATH = os.path.join(BASE_DIR, "user_settings.json")

DEFAULT_CATEGORIES = [
    "文学小说", "历史传记", "科学技术", "计算机编程", "哲学心理",
    "经济管理", "艺术设计", "教育学习", "生活健康", "法律政治",
    "数学物理", "社会文化", "自然科学", "工程技术", "其他",
]

DEFAULT_SETTINGS = {
    "llm": {
        "provider": "ollama",        # ollama | deepseek | kimi | qwen | minimax | openai
        "model": "gemma4:e4b",
        "api_key": "",
        "base_url": "",               # 留空使用 provider 默认
        "embed_provider": "ollama",   # ollama | openai
        "embed_model": "nomic-embed-text",
        "embed_api_key": "",
        "embed_base_url": "",
    },
    "categories": DEFAULT_CATEGORIES.copy(),
    "private_password_hash": "",  # sha256 hex; empty = not set
    "mineru": {
        "enabled": False,
        "api_token": "",
        "base_url": "https://mineru.net",
        "is_ocr": True,          # treat as scanned/image PDF
        "enable_formula": True,
        "enable_table": True,
        "language": "ch",        # ch | en | auto
    },
}

# Provider presets (base_url + 默认模型)
PROVIDER_PRESETS = {
    "ollama":   {"base_url": "http://127.0.0.1:11434", "model": "gemma4:e4b"},
    "deepseek": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat"},
    "kimi":     {"base_url": "https://api.moonshot.cn/v1", "model": "moonshot-v1-8k"},
    "qwen":     {"base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen-turbo"},
    "minimax":  {"base_url": "https://api.minimaxi.com/v1", "model": "MiniMax-Text-01"},
    "openai":   {"base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
}


def load_settings() -> dict:
    if not os.path.exists(SETTINGS_PATH):
        save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS.copy()
    try:
        with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # merge with defaults in case of missing fields
        merged = {**DEFAULT_SETTINGS, **data}
        merged["llm"] = {**DEFAULT_SETTINGS["llm"], **(data.get("llm") or {})}
        merged["mineru"] = {**DEFAULT_SETTINGS["mineru"], **(data.get("mineru") or {})}
        if not merged.get("categories"):
            merged["categories"] = DEFAULT_CATEGORIES.copy()
        return merged
    except Exception:
        return DEFAULT_SETTINGS.copy()


def save_settings(settings: dict):
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)


def update_settings(patch: dict) -> dict:
    cur = load_settings()
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(cur.get(k), dict):
            cur[k].update(v)
        else:
            cur[k] = v
    save_settings(cur)
    return cur
