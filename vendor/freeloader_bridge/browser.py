from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright


@dataclass(slots=True)
class FreeloaderBrowserSession:
    playwright: Playwright
    browser: Browser
    context: BrowserContext
    page: Page


def _is_truthy_env(value: str | None, default: bool = False) -> bool:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return default
    return normalized not in {"0", "false", "off", "no"}


def _background_browser_mode_enabled() -> bool:
    return _is_truthy_env(os.getenv("BRAVE_RUN_IN_BACKGROUND"), True)


def _allow_opening_new_chat_tab() -> bool:
    return _is_truthy_env(
        os.getenv("CHATGPT_BROWSER_ALLOW_NEW_TAB"),
        not _background_browser_mode_enabled(),
    )


def _cdp_endpoint_is_ready(cdp_endpoint: str, timeout_seconds: float = 2.0) -> bool:
    version_url = f"{cdp_endpoint.rstrip('/')}/json/version"
    try:
        with urlopen(version_url, timeout=timeout_seconds) as response:
            return response.status == 200
    except URLError:
        return False


def get_browser_status(config) -> dict[str, str | bool]:
    brave_path = Path(config.brave_path)
    cdp_endpoint = getattr(config, "cdp_endpoint", "http://127.0.0.1:9222")
    path_exists = brave_path.exists()
    endpoint_ready = _cdp_endpoint_is_ready(cdp_endpoint) if path_exists else False

    if path_exists and endpoint_ready:
        message = "Attached to Brave"
    elif not path_exists:
        message = f"Brave not found at {brave_path}"
    else:
        message = "Brave is not exposing remote debugging on port 9222"

    return {
        "connected": path_exists and endpoint_ready,
        "message": message,
        "cdp_endpoint": cdp_endpoint,
        "brave_path": str(brave_path),
    }


def _find_or_create_chat_page(context: BrowserContext, chat_url: str, logger) -> Page:
    for page in context.pages:
        current_url = page.url or ""
        if current_url.startswith(chat_url) or "chatgpt.com" in current_url:
            logger.info("Reusing existing ChatGPT tab: %s", current_url)
            return page

    if not _allow_opening_new_chat_tab():
        raise RuntimeError(
            "No existing ChatGPT tab was found in Brave. Open chatgpt.com in Brave once and retry to keep the browser running in the background."
        )

    logger.info("Opening a new ChatGPT tab.")
    page = context.new_page()
    page.goto(chat_url, wait_until="domcontentloaded", timeout=60000)
    return page


def launch_browser_session(config, logger) -> FreeloaderBrowserSession:
    brave_path = Path(config.brave_path)
    cdp_endpoint = getattr(config, "cdp_endpoint", "http://127.0.0.1:9222")

    if not brave_path.exists():
        raise FileNotFoundError(
            f"Brave executable not found at: {brave_path}. Update BRAVE_PATH before retrying."
        )

    if not _cdp_endpoint_is_ready(cdp_endpoint):
        raise RuntimeError(
            "Brave is not exposing a remote debugging endpoint on port 9222.\n"
            "Close all Brave windows, then start Brave manually with:\n"
            f'"{brave_path}" --remote-debugging-port=9222\n'
            "After Brave is running, make sure ChatGPT is open in that browser and retry."
        )

    logger.info("Connecting to existing Brave via CDP: %s", cdp_endpoint)
    playwright = sync_playwright().start()

    try:
        browser = playwright.chromium.connect_over_cdp(cdp_endpoint, timeout=15000)
        if not browser.contexts:
            raise RuntimeError(
                "Connected to Brave, but no default browser context was exposed over CDP. Restart Brave with remote debugging enabled and try again."
            )

        context = browser.contexts[0]
        context.set_default_timeout(15000)
        page = _find_or_create_chat_page(context, config.chatgpt_url, logger)

        if not page.url.startswith(config.chatgpt_url):
            logger.info("Navigating to ChatGPT: %s", config.chatgpt_url)
            page.goto(config.chatgpt_url, wait_until="domcontentloaded", timeout=60000)

        return FreeloaderBrowserSession(
            playwright=playwright,
            browser=browser,
            context=context,
            page=page,
        )
    except Exception:
        playwright.stop()
        raise


def close_browser_session(session: FreeloaderBrowserSession, logger) -> None:
    logger.info("Detaching from Brave.")
    try:
        session.playwright.stop()
    except Exception:
        pass
