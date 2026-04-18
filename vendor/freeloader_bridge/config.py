from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency in some setups
    def load_dotenv(*_args, **_kwargs):
        return False


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_FILES = [
    PROJECT_ROOT / ".env.local",
    PROJECT_ROOT / ".env",
]


def _resolve_path(raw_value: str | None, fallback: Path) -> Path:
    if raw_value:
        candidate = Path(raw_value).expanduser()
        if not candidate.is_absolute():
            candidate = PROJECT_ROOT / candidate
        return candidate.resolve()
    return fallback.resolve()


def guess_brave_path() -> Path:
    candidates = [
        Path("C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"),
        Path("C:/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"),
        Path.home() / "AppData/Local/BraveSoftware/Brave-Browser/Application/brave.exe",
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return candidates[0]


@dataclass(slots=True)
class AppConfig:
    project_root: Path
    logs_dir: Path
    log_file: Path
    log_level: str
    chatgpt_url: str
    brave_path: Path
    cdp_endpoint: str
    type_delay_ms: int
    response_timeout_seconds: int
    response_poll_interval: float
    chat_input_selector: str
    response_selector: str


def load_config() -> AppConfig:
    for env_file in ENV_FILES:
        if env_file.exists():
            load_dotenv(env_file)

    logs_dir = _resolve_path(
        os.getenv("CHATGPT_BROWSER_LOGS_DIR"),
        PROJECT_ROOT / "logs" / "chatgpt-browser",
    )

    return AppConfig(
        project_root=PROJECT_ROOT,
        logs_dir=logs_dir,
        log_file=_resolve_path(
            os.getenv("CHATGPT_BROWSER_LOG_FILE"),
            logs_dir / "bridge.log",
        ),
        log_level=os.getenv("CHATGPT_BROWSER_LOG_LEVEL", os.getenv("LOG_LEVEL", "INFO")),
        chatgpt_url=os.getenv("CHATGPT_BROWSER_URL", os.getenv("CHATGPT_URL", "https://chatgpt.com/")),
        brave_path=_resolve_path(
            os.getenv("BRAVE_PATH"),
            guess_brave_path(),
        ),
        cdp_endpoint=os.getenv(
            "CHATGPT_BROWSER_CDP_ENDPOINT",
            os.getenv("BRAVE_CDP_URL", "http://127.0.0.1:9222"),
        ),
        type_delay_ms=max(0, int(os.getenv("CHATGPT_BROWSER_TYPE_DELAY_MS", "30"))),
        response_timeout_seconds=max(
            30, int(os.getenv("CHATGPT_BROWSER_RESPONSE_TIMEOUT_SECONDS", "240"))
        ),
        response_poll_interval=max(
            0.5, float(os.getenv("CHATGPT_BROWSER_RESPONSE_POLL_INTERVAL", "1.0"))
        ),
        chat_input_selector=os.getenv("CHATGPT_BROWSER_INPUT_SELECTOR", "#prompt-textarea"),
        response_selector=os.getenv(
            "CHATGPT_BROWSER_RESPONSE_SELECTOR",
            "[data-message-author-role='assistant']",
        ),
    )
