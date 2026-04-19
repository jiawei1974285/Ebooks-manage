"""Unified LLM provider abstraction supporting Ollama + OpenAI-compatible APIs."""
import logging
from typing import Optional
import ollama
from settings_store import load_settings, PROVIDER_PRESETS

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
    _HAS_OPENAI = True
except ImportError:
    _HAS_OPENAI = False
    logger.warning("openai package not installed — 云端 provider 将不可用")


def _get_llm_config() -> dict:
    return load_settings()["llm"]


def _resolve_base_url(provider: str, override: str = "") -> str:
    if override:
        return override
    preset = PROVIDER_PRESETS.get(provider, {})
    return preset.get("base_url", "")


def chat_complete(messages: list[dict], temperature: float = 0.7) -> str:
    """Call the configured LLM with chat messages, return content string."""
    cfg = _get_llm_config()
    provider = cfg["provider"]
    model = cfg["model"]

    if provider == "ollama":
        base_url = _resolve_base_url("ollama", cfg.get("base_url"))
        client = ollama.Client(host=base_url)
        resp = client.chat(model=model, messages=messages, options={"temperature": temperature})
        return resp["message"]["content"].strip()

    # OpenAI-compatible providers
    if not _HAS_OPENAI:
        raise RuntimeError("未安装 openai 包，请运行: pip install openai")

    base_url = _resolve_base_url(provider, cfg.get("base_url"))
    api_key = cfg.get("api_key") or "EMPTY"
    if not base_url:
        raise RuntimeError(f"未配置 provider={provider} 的 base_url")

    client = OpenAI(api_key=api_key, base_url=base_url)
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
    )
    return resp.choices[0].message.content.strip()


def get_embedding(text: str) -> list[float]:
    """Call the configured embedding model."""
    cfg = _get_llm_config()
    provider = cfg.get("embed_provider", "ollama")
    model = cfg.get("embed_model", "nomic-embed-text")

    if provider == "ollama":
        base_url = cfg.get("embed_base_url") or _resolve_base_url("ollama", "")
        client = ollama.Client(host=base_url)
        resp = client.embeddings(model=model, prompt=text)
        return resp["embedding"]

    if provider == "openai":
        if not _HAS_OPENAI:
            raise RuntimeError("未安装 openai 包")
        base_url = cfg.get("embed_base_url") or "https://api.openai.com/v1"
        api_key = cfg.get("embed_api_key") or cfg.get("api_key") or ""
        client = OpenAI(api_key=api_key, base_url=base_url)
        resp = client.embeddings.create(model=model, input=text)
        return resp.data[0].embedding

    raise RuntimeError(f"不支持的 embedding provider: {provider}")


def test_connection(llm_config: dict) -> dict:
    """Test an arbitrary LLM config without saving. Returns {ok, message}."""
    provider = llm_config.get("provider", "ollama")
    model = llm_config.get("model")
    base_url = llm_config.get("base_url") or _resolve_base_url(provider, "")
    api_key = llm_config.get("api_key") or "EMPTY"

    try:
        if provider == "ollama":
            client = ollama.Client(host=base_url)
            resp = client.chat(
                model=model,
                messages=[{"role": "user", "content": "hi"}],
                options={"num_predict": 5},
            )
            return {"ok": True, "message": "连接成功", "sample": resp["message"]["content"][:80]}

        if not _HAS_OPENAI:
            return {"ok": False, "message": "未安装 openai 包"}

        client = OpenAI(api_key=api_key, base_url=base_url)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
        )
        return {"ok": True, "message": "连接成功", "sample": resp.choices[0].message.content[:80]}
    except Exception as e:
        return {"ok": False, "message": f"{type(e).__name__}: {e}"}
