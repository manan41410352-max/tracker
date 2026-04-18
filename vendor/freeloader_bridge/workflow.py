from __future__ import annotations

import time
from pathlib import Path

from playwright.sync_api import Locator, Page, TimeoutError as PlaywrightTimeoutError

from .browser import close_browser_session, launch_browser_session
from .page import FreeloaderPageTargets, build_page_targets


def _first_visible_locator(
    page: Page,
    selectors: tuple[str, ...],
    timeout_ms: int = 3000,
) -> Locator | None:
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            locator.wait_for(state="visible", timeout=timeout_ms)
            return locator
        except PlaywrightTimeoutError:
            continue
    return None


def _wait_for_chat_input(
    page: Page,
    targets: FreeloaderPageTargets,
    logger,
    timeout_seconds: int = 30,
) -> Locator:
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        input_locator = _first_visible_locator(
            page, targets.chat_input_selectors, timeout_ms=2000
        )
        if input_locator is not None:
            logger.info("ChatGPT input is ready.")
            return input_locator

        logger.info("Waiting for the ChatGPT composer to appear.")
        time.sleep(1.0)

    raise RuntimeError(
        "ChatGPT input box is not visible. Make sure Brave is open on chatgpt.com, you are logged in, and no modal or verification wall is blocking the page."
    )


def _clear_prompt_box(page: Page, input_locator: Locator) -> None:
    input_locator.click()
    try:
        input_locator.fill("")
    except Exception:
        page.keyboard.press("Control+A")
        page.keyboard.press("Backspace")


def _set_prompt_fast(input_locator: Locator, prompt: str) -> bool:
    try:
        input_locator.fill(prompt)
        return True
    except Exception:
        pass

    try:
        return bool(
            input_locator.evaluate(
                """
                (node, value) => {
                    const text = String(value ?? '');
                    node.focus();

                    if ('value' in node) {
                        node.value = text;
                        node.dispatchEvent(new Event('input', { bubbles: true }));
                        node.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }

                    if (node.isContentEditable) {
                        node.textContent = text;
                        node.dispatchEvent(new InputEvent('input', {
                            bubbles: true,
                            data: text,
                            inputType: 'insertText',
                        }));
                        return true;
                    }

                    return false;
                }
                """,
                prompt,
            )
        )
    except Exception:
        return False


def _type_prompt(page: Page, input_locator: Locator, prompt: str, logger, delay_ms: int) -> None:
    logger.info("Pasting prompt into ChatGPT.")
    if _set_prompt_fast(input_locator, prompt):
        return

    logger.info("Fast paste was unavailable, falling back to typed input.")
    for character in prompt:
        if character == "\n":
            page.keyboard.press("Shift+Enter")
        else:
            page.keyboard.type(character, delay=delay_ms)


def _submit_prompt(page: Page, input_locator: Locator, targets: FreeloaderPageTargets, logger) -> None:
    try:
        input_locator.focus()
    except Exception:
        pass

    try:
        input_locator.press("Enter")
        logger.info("Prompt submitted with Enter.")
        return
    except Exception:
        logger.debug("Enter submit failed, falling back to the send button.", exc_info=True)

    send_button = _first_visible_locator(page, targets.send_button_selectors, timeout_ms=400)
    if send_button is not None:
        try:
            send_button.click()
            logger.info("Prompt submitted with the send button.")
            return
        except Exception:
            logger.debug("Send button click also failed.", exc_info=True)

    page.keyboard.press("Enter")
    logger.info("Prompt submitted with page-level Enter fallback.")


def _attach_files(page: Page, targets: FreeloaderPageTargets, file_paths: list[Path], logger) -> None:
    resolved_paths = [str(path.resolve()) for path in file_paths if path.exists()]
    if not resolved_paths:
        return

    file_input = None
    for selector in targets.file_input_selectors:
        locator = page.locator(selector).first
        try:
            locator.wait_for(state="attached", timeout=2000)
            file_input = locator
            break
        except PlaywrightTimeoutError:
            continue

    if file_input is None:
        raise RuntimeError(
            "ChatGPT file upload control was not found. Make sure the current ChatGPT composer supports attachments."
        )

    logger.info("Uploading %s file(s) to ChatGPT.", len(resolved_paths))
    file_input.set_input_files(resolved_paths)
    page.wait_for_timeout(700)


def _clean_text(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.splitlines()).strip()


def _extract_locator_text(locator: Locator) -> str:
    try:
        return _clean_text(locator.inner_text(timeout=1000))
    except PlaywrightTimeoutError:
        return ""


def _assistant_turn_locator(page: Page, targets: FreeloaderPageTargets) -> Locator:
    fallback = page.locator(targets.assistant_turn_selectors[0])
    for selector in targets.assistant_turn_selectors:
        locator = page.locator(selector)
        if locator.count() > 0:
            return locator
    return fallback


def _generation_in_progress(page: Page, targets: FreeloaderPageTargets) -> bool:
    for selector in targets.stop_button_selectors:
        locator = page.locator(selector).first
        try:
            if locator.is_visible():
                return True
        except Exception:
            continue
    return False


def _assistant_turn_count(page: Page, targets: FreeloaderPageTargets) -> int:
    return _assistant_turn_locator(page, targets).count()


def _conversation_turn_count(page: Page, targets: FreeloaderPageTargets) -> int:
    return page.locator(targets.conversation_turn_selector).count()


def _wait_for_new_assistant_turn(
    page: Page,
    targets: FreeloaderPageTargets,
    logger,
    previous_turn_count: int,
    previous_assistant_count: int,
    timeout_seconds: int,
) -> Locator:
    logger.info("Waiting for a new assistant turn.")

    page.wait_for_function(
        """
        ({ turnSelector, assistantSelectors, previousTurnCount, previousAssistantCount }) => {
            const turnCount = document.querySelectorAll(turnSelector).length;
            let assistantCount = 0;

            for (const selector of assistantSelectors) {
                const count = document.querySelectorAll(selector).length;
                if (count > 0) {
                    assistantCount = count;
                    break;
                }
            }

            return turnCount > previousTurnCount || assistantCount > previousAssistantCount;
        }
        """,
        arg={
            "turnSelector": targets.conversation_turn_selector,
            "assistantSelectors": list(targets.assistant_turn_selectors),
            "previousTurnCount": previous_turn_count,
            "previousAssistantCount": previous_assistant_count,
        },
        timeout=timeout_seconds * 1000,
    )

    assistant_turns = _assistant_turn_locator(page, targets)
    assistant_turn = assistant_turns.nth(previous_assistant_count)
    assistant_turn.wait_for(state="attached", timeout=5000)

    logger.info(
        "New assistant turn detected. Previous assistant count=%s, current count=%s.",
        previous_assistant_count,
        assistant_turns.count(),
    )
    return assistant_turn


def _wait_for_completed_response_text_for_turn(
    page: Page,
    targets: FreeloaderPageTargets,
    logger,
    assistant_turn: Locator,
    timeout_seconds: int,
    poll_interval: float,
) -> str:
    logger.info("Waiting for the assistant reply to finish.")
    deadline = time.time() + timeout_seconds
    latest_text = ""
    stable_cycles = 0
    saw_any_text = False

    while time.time() < deadline:
        current_text = _extract_locator_text(assistant_turn)
        generating = _generation_in_progress(page, targets)

        if current_text:
            saw_any_text = True
            if current_text != latest_text:
                latest_text = current_text
                stable_cycles = 0
            else:
                stable_cycles += 1

        if saw_any_text and not generating and stable_cycles >= 2:
            logger.info("Assistant reply is complete and stable.")
            return latest_text

        time.sleep(poll_interval)

    if latest_text:
        logger.warning("Timed out while waiting for completion; returning the latest text seen.")
        return latest_text

    raise RuntimeError("Timed out while waiting for a ChatGPT response.")


def warm_browser(config, logger) -> dict[str, str | bool]:
    targets = build_page_targets(config)
    session = launch_browser_session(config, logger)
    try:
        _wait_for_chat_input(session.page, targets, logger)
        return {
            "warmed": True,
            "provider": "chatgpt",
            "url": session.page.url,
        }
    finally:
        close_browser_session(session, logger)


def send_prompt_and_wait(
    prompt: str,
    config,
    logger,
    attachments: list[Path] | None = None,
) -> str:
    targets = build_page_targets(config)
    session = launch_browser_session(config, logger)

    try:
        page = session.page

        input_locator = _wait_for_chat_input(page, targets, logger)
        previous_turn_count = _conversation_turn_count(page, targets)
        previous_assistant_count = _assistant_turn_count(page, targets)

        _clear_prompt_box(page, input_locator)
        _attach_files(page, targets, list(attachments or []), logger)
        _type_prompt(page, input_locator, prompt, logger, config.type_delay_ms)
        _submit_prompt(page, input_locator, targets, logger)

        assistant_turn = _wait_for_new_assistant_turn(
            page,
            targets,
            logger,
            previous_turn_count=previous_turn_count,
            previous_assistant_count=previous_assistant_count,
            timeout_seconds=config.response_timeout_seconds,
        )

        return _wait_for_completed_response_text_for_turn(
            page,
            targets,
            logger,
            assistant_turn,
            timeout_seconds=config.response_timeout_seconds,
            poll_interval=config.response_poll_interval,
        )
    finally:
        close_browser_session(session, logger)
