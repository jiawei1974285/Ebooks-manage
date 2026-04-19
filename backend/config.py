import os
from dotenv import load_dotenv

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
# Force ollama python client to use IPv4 (避免 IPv6 localhost 解析问题)
os.environ["OLLAMA_HOST"] = OLLAMA_BASE_URL
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e4b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
COVERS_DIR = os.path.join(BASE_DIR, "covers")
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

os.makedirs(COVERS_DIR, exist_ok=True)
os.makedirs(CHROMA_DIR, exist_ok=True)
