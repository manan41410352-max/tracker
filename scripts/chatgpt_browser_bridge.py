from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VENDOR_ROOT = ROOT / "vendor"
if str(VENDOR_ROOT) not in sys.path:
    sys.path.insert(0, str(VENDOR_ROOT))

from freeloader_bridge.config import load_config
from freeloader_bridge.logger import setup_logging
from freeloader_bridge.workflow import send_prompt_and_wait, warm_browser


def _resolve_attachments(raw_attachments: object) -> tuple[list[Path], list[str]]:
    attachments = raw_attachments if isinstance(raw_attachments, list) else []
    resolved: list[Path] = []
    warnings: list[str] = []

    for attachment in attachments:
        next_path = Path(str(attachment)).expanduser()
        if not next_path.is_absolute():
            next_path = (ROOT / next_path).resolve()
        if not next_path.exists():
            warnings.append(f"Attachment not found: {attachment}")
            continue
        resolved.append(next_path)

    return resolved, warnings


def main() -> int:
    payload = json.load(sys.stdin)
    config = load_config()
    logger = setup_logging(config)

    if payload.get("warmup"):
        result = warm_browser(config, logger)
        json.dump(
            {
                "ok": True,
                "status": 200,
                "url": result.get("url"),
            },
            sys.stdout,
            ensure_ascii=False,
        )
        return 0

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("Prompt text is required before the ChatGPT browser fallback can run.")

    attachments, warnings = _resolve_attachments(payload.get("attachments"))
    content = send_prompt_and_wait(
        prompt=prompt,
        config=config,
        logger=logger,
        attachments=attachments,
    )

    json.dump(
        {
            "ok": True,
            "status": 200,
            "content": content,
            "browserUrl": config.chatgpt_url,
            "usedAttachments": [str(path) for path in attachments],
            "warnings": warnings,
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
