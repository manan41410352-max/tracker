import dns from "node:dns/promises";
import process from "node:process";

const DEFAULT_CHATGPT_URL = "https://chatgpt.com/";
const DEFAULT_INPUT_SELECTORS = [
  process.env.CHATGPT_BROWSER_INPUT_SELECTOR || "#prompt-textarea",
  "textarea[placeholder*='Message']",
  "textarea[placeholder*='Ask anything']",
  "textarea",
  "[contenteditable='true'][role='textbox']",
  "div.ProseMirror[contenteditable='true']",
].filter(Boolean);

const DEFAULT_SEND_BUTTON_SELECTORS = [
  "button[data-testid='send-button']",
  "button[aria-label*='Send']",
  "button[data-testid*='send']",
];

const DEFAULT_FILE_INPUT_SELECTORS = [
  "input#upload-files",
  "input[type='file']#upload-files",
  "input[type='file']:not([accept='image/*'])",
  "input[type='file']",
];

const DEFAULT_STOP_BUTTON_SELECTORS = [
  "button[data-testid='stop-button']",
  "button[aria-label*='Stop']",
  "button[data-testid*='stop']",
];

const DEFAULT_ASSISTANT_TURN_SELECTORS = [
  process.env.CHATGPT_BROWSER_RESPONSE_SELECTOR ||
    "[data-message-author-role='assistant']",
  "[data-testid='conversation-turn'] [data-message-author-role='assistant']",
  "[data-testid*='conversation-turn'] [data-message-author-role='assistant']",
  "[data-message-author-role='assistant']",
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTruthyEnv(value, defaultValue = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  return !["0", "false", "off", "no"].includes(normalized);
}

function isBackgroundBrowserModeEnabled() {
  return isTruthyEnv(process.env.BRAVE_RUN_IN_BACKGROUND, true);
}

function shouldAllowOpeningNewChatGptTab() {
  return isTruthyEnv(
    process.env.CHATGPT_BROWSER_ALLOW_NEW_TAB,
    !isBackgroundBrowserModeEnabled()
  );
}

function normalizeSelectorList(selectors) {
  return [...new Set(selectors.map((selector) => String(selector || "").trim()).filter(Boolean))];
}

function isLoopbackHost(hostname) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(hostname || "").trim().toLowerCase());
}

function isIpLiteral(hostname) {
  return /^[0-9.]+$/.test(hostname) || /^[a-f0-9:]+$/i.test(hostname);
}

async function resolveCdpEndpoint() {
  const isDocker = process.env.DOCKER_ENV === "true";
  const configured =
    process.env.CHATGPT_BROWSER_CDP_ENDPOINT?.trim() ||
    (isDocker
      ? process.env.BRAVE_CDP_URL_DOCKER?.trim()
      : "") ||
    process.env.BRAVE_CDP_URL?.trim() ||
    "http://127.0.0.1:9222";
  const originalUrl = new URL(configured);

  if (isDocker && isLoopbackHost(originalUrl.hostname)) {
    originalUrl.hostname = process.env.BRAVE_CDP_DOCKER_HOST?.trim() || "host.docker.internal";
  }

  const reachableUrl = new URL(originalUrl.toString());
  if (isDocker && !isLoopbackHost(reachableUrl.hostname) && !isIpLiteral(reachableUrl.hostname)) {
    const resolved = await dns.lookup(reachableUrl.hostname, { family: 4 });
    reachableUrl.hostname = resolved.address;
  }

  return {
    configuredUrl: originalUrl.toString().replace(/\/$/, ""),
    reachableUrl: reachableUrl.toString().replace(/\/$/, ""),
  };
}

async function readJsonFromStdin() {
  let raw = "";
  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  return raw.trim() ? JSON.parse(raw) : {};
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      typeof parsed === "string"
        ? parsed
        : parsed?.message || parsed?.error || `${response.status} ${response.statusText}`
    );
  }

  return parsed;
}

function rewriteWebSocketUrl(rawUrl, reachableBaseUrl) {
  const rewritten = new URL(rawUrl);
  const reachable = new URL(reachableBaseUrl);

  if (isLoopbackHost(rewritten.hostname)) {
    rewritten.hostname = reachable.hostname;
  }

  if (!rewritten.port) {
    rewritten.port = reachable.port;
  }

  return rewritten.toString();
}

async function getVersionPayload(reachableBaseUrl) {
  return await fetchJson(`${reachableBaseUrl}/json/version`);
}

async function findOrCreateChatTarget({ reachableBaseUrl, chatgptUrl }) {
  const targets = await fetchJson(`${reachableBaseUrl}/json`);
  const pages = Array.isArray(targets)
    ? targets.filter((target) => String(target?.type || "") === "page")
    : [];

  const existingTarget =
    pages.find((target) => String(target?.url || "").startsWith(chatgptUrl)) ||
    pages.find((target) => String(target?.url || "").includes("chatgpt.com"));

  if (existingTarget?.webSocketDebuggerUrl) {
    return existingTarget;
  }

  if (!shouldAllowOpeningNewChatGptTab()) {
    throw new Error(
      "No existing ChatGPT tab was found in Brave. Open chatgpt.com in Brave once and retry to keep the browser running in the background."
    );
  }

  return await fetchJson(`${reachableBaseUrl}/json/new?${encodeURIComponent(chatgptUrl)}`, {
    method: "PUT",
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      let settled = false;

      const fail = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error || "CDP connection failed.")));
      };

      ws.addEventListener("open", () => {
        if (settled) {
          return;
        }
        settled = true;
        this.ws = ws;
        resolve(undefined);
      });

      ws.addEventListener("message", (event) => {
        const payload = JSON.parse(String(event.data || "{}"));
        if (!payload?.id) {
          return;
        }

        const pending = this.pending.get(payload.id);
        if (!pending) {
          return;
        }

        this.pending.delete(payload.id);
        if (payload.error) {
          pending.reject(new Error(String(payload.error?.message || "CDP request failed.")));
          return;
        }

        pending.resolve(payload.result);
      });

      ws.addEventListener("error", (event) => {
        fail(new Error(String(event?.message || "CDP socket error.")));
      });

      ws.addEventListener("close", () => {
        const error = new Error("CDP socket closed.");
        for (const pending of this.pending.values()) {
          pending.reject(error);
        }
        this.pending.clear();
      });
    });
  }

  async send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP socket is not open.");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({
      id,
      method,
      params,
    });

    const responsePromise = new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
      });
    });

    this.ws.send(payload);
    return await responsePromise;
  }

  async evaluate(expressionFactory, args) {
    const expression = `(${expressionFactory})(${JSON.stringify(args ?? null)})`;
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });

    if (result?.exceptionDetails) {
      const description =
        result.exceptionDetails?.exception?.description ||
        result.exceptionDetails?.text ||
        "Page evaluation failed.";
      throw new Error(String(description));
    }

    return result?.result?.value;
  }

  async close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

const FIND_PAGE_STATE = function ({
  inputSelectors,
  assistantSelectors,
  stopSelectors,
}) {
  const normalizeText = (value) =>
    String(value || "")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();

  const isVisible = (element) => {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return Boolean(element.getClientRects().length || element.offsetWidth || element.offsetHeight);
  };

  const findVisible = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (isVisible(element)) {
        return element;
      }
    }
    return null;
  };

  const collectAssistantTurns = () => {
    for (const selector of assistantSelectors) {
      const matches = Array.from(document.querySelectorAll(selector)).filter(isVisible);
      if (matches.length) {
        return matches;
      }
    }
    return [];
  };

  const assistantTurns = collectAssistantTurns();
  const lastAssistant = assistantTurns.at(-1);
  const input = findVisible(inputSelectors);
  const generating = stopSelectors.some((selector) =>
    Array.from(document.querySelectorAll(selector)).some(isVisible)
  );

  return {
    url: window.location.href,
    title: document.title,
    inputReady: Boolean(input),
    assistantCount: assistantTurns.length,
    lastAssistantText: normalizeText(lastAssistant?.innerText || lastAssistant?.textContent || ""),
    generating,
  };
};

const FOCUS_INPUT = function ({ inputSelectors }) {
  const isVisible = (element) => {
    if (!element || !(element instanceof Element)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return Boolean(element.getClientRects().length || element.offsetWidth || element.offsetHeight);
  };

  for (const selector of inputSelectors) {
    const element = document.querySelector(selector);
    if (!isVisible(element)) {
      continue;
    }

    element.focus();

    if ("value" in element) {
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element.isContentEditable) {
      element.textContent = "";
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: "",
          inputType: "deleteContentBackward",
        })
      );
    }

    return {
      ok: true,
      selector,
    };
  }

  return {
    ok: false,
  };
};

const CLICK_SEND = function ({ sendSelectors }) {
  const isVisible = (element) => {
    if (!element || !(element instanceof Element)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return Boolean(element.getClientRects().length || element.offsetWidth || element.offsetHeight);
  };

  for (const selector of sendSelectors) {
    const button = document.querySelector(selector);
    if (!isVisible(button)) {
      continue;
    }

    const disabled =
      button.hasAttribute("disabled") ||
      button.getAttribute("aria-disabled") === "true";
    if (disabled) {
      continue;
    }

    button.click();
    return {
      ok: true,
      method: "button",
      selector,
    };
  }

  return {
    ok: false,
  };
};

async function ensureChatPage(client, chatgptUrl, selectors) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  const initialState = await client.evaluate(FIND_PAGE_STATE, selectors);
  const currentUrl = String(initialState?.url || "");
  if (!currentUrl.startsWith(chatgptUrl) && !currentUrl.includes("chatgpt.com")) {
    await client.send("Page.navigate", {
      url: chatgptUrl,
    });
  }

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const state = await client.evaluate(FIND_PAGE_STATE, selectors);
    if (state?.inputReady) {
      return state;
    }
    await sleep(1_000);
  }

  throw new Error(
    "ChatGPT input box is not visible. Make sure Brave is open on chatgpt.com, you are logged in, and no modal or verification wall is blocking the page."
  );
}

async function resolveFileInputBackendNodeId(client, selectors) {
  await client.send("DOM.enable");
  const document = await client.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  const rootNodeId = document?.root?.nodeId;

  if (!rootNodeId) {
    return null;
  }

  for (const selector of selectors.fileInputSelectors) {
    const match = await client.send("DOM.querySelector", {
      nodeId: rootNodeId,
      selector,
    });
    const nodeId = Number(match?.nodeId || 0);

    if (!nodeId) {
      continue;
    }

    const described = await client.send("DOM.describeNode", { nodeId });
    const backendNodeId = described?.node?.backendNodeId;

    if (backendNodeId) {
      return {
        backendNodeId,
        selector,
      };
    }
  }

  return null;
}

async function attachFiles(client, attachments, selectors) {
  const resolvedAttachments = Array.isArray(attachments)
    ? attachments.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (!resolvedAttachments.length) {
    return {
      usedAttachments: [],
      warnings: [],
    };
  }

  const target = await resolveFileInputBackendNodeId(client, selectors);
  if (!target?.backendNodeId) {
    throw new Error(
      "ChatGPT file upload control was not found. Make sure the current ChatGPT composer supports attachments."
    );
  }

  await client.send("DOM.setFileInputFiles", {
    backendNodeId: target.backendNodeId,
    files: resolvedAttachments,
  });
  await sleep(700);

  return {
    usedAttachments: resolvedAttachments,
    warnings: [],
  };
}

async function submitPrompt(client, prompt, selectors) {
  const focusResult = await client.evaluate(FOCUS_INPUT, {
    inputSelectors: selectors.inputSelectors,
  });

  if (!focusResult?.ok) {
    throw new Error(
      "ChatGPT input box is not visible. Make sure Brave is open on chatgpt.com, you are logged in, and no modal or verification wall is blocking the page."
    );
  }

  await client.send("Input.insertText", {
    text: prompt,
  });

  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "char",
    text: "\r",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });

  await sleep(200);

  const clickResult = await client.evaluate(CLICK_SEND, {
    sendSelectors: selectors.sendSelectors,
  });

  if (clickResult?.ok) {
    await sleep(100);
  }
}

async function waitForAssistantReply(client, selectors, previousAssistantCount, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  let latestText = "";
  let stableCycles = 0;

  while (Date.now() < deadline) {
    const state = await client.evaluate(FIND_PAGE_STATE, selectors);
    const assistantCount = Number(state?.assistantCount || 0);
    const nextText = String(state?.lastAssistantText || "").trim();
    const generating = Boolean(state?.generating);

    if (assistantCount > previousAssistantCount && nextText) {
      if (nextText === latestText) {
        stableCycles += 1;
      } else {
        latestText = nextText;
        stableCycles = 0;
      }

      if (!generating && stableCycles >= 2) {
        return {
          content: latestText,
          state,
        };
      }
    }

    await sleep(1_000);
  }

  if (latestText) {
    return {
      content: latestText,
      state: await client.evaluate(FIND_PAGE_STATE, selectors),
    };
  }

  throw new Error("Timed out while waiting for a ChatGPT response.");
}

async function run() {
  const payload = await readJsonFromStdin();
  const chatgptUrl = String(
    process.env.CHATGPT_BROWSER_URL || process.env.CHATGPT_URL || DEFAULT_CHATGPT_URL
  ).trim() || DEFAULT_CHATGPT_URL;
  const selectors = {
    inputSelectors: normalizeSelectorList(DEFAULT_INPUT_SELECTORS),
    sendSelectors: normalizeSelectorList(DEFAULT_SEND_BUTTON_SELECTORS),
    fileInputSelectors: normalizeSelectorList(DEFAULT_FILE_INPUT_SELECTORS),
    assistantSelectors: normalizeSelectorList(DEFAULT_ASSISTANT_TURN_SELECTORS),
    stopSelectors: normalizeSelectorList(DEFAULT_STOP_BUTTON_SELECTORS),
  };
  const timeoutSeconds = Math.max(
    30,
    Number(process.env.CHATGPT_BROWSER_RESPONSE_TIMEOUT_SECONDS || 240)
  );
  const endpoint = await resolveCdpEndpoint();
  const versionPayload = await getVersionPayload(endpoint.reachableUrl).catch(() => null);

  if (!versionPayload?.webSocketDebuggerUrl) {
    throw new Error(
      `Brave is not exposing a remote debugging endpoint at ${endpoint.configuredUrl}. Start Brave with --remote-debugging-port=9222 and retry.`
    );
  }

  const target = await findOrCreateChatTarget({
    reachableBaseUrl: endpoint.reachableUrl,
    chatgptUrl,
  });

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("ChatGPT browser fallback could not open or reuse a ChatGPT tab.");
  }

  const client = new CdpClient(
    rewriteWebSocketUrl(String(target.webSocketDebuggerUrl), endpoint.reachableUrl)
  );

  try {
    await client.connect();
    const readyState = await ensureChatPage(client, chatgptUrl, selectors);

    if (payload?.warmup) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          status: 200,
          url: String(readyState?.url || chatgptUrl),
        })
      );
      return;
    }

    const prompt = String(payload?.prompt || "").trim();
    if (!prompt) {
      throw new Error("Prompt text is required before the ChatGPT browser fallback can run.");
    }

    const { usedAttachments, warnings: attachmentWarnings } = await attachFiles(
      client,
      payload?.attachments,
      selectors
    );

    const previousAssistantCount = Number(readyState?.assistantCount || 0);
    await submitPrompt(client, prompt, selectors);
    const response = await waitForAssistantReply(
      client,
      selectors,
      previousAssistantCount,
      timeoutSeconds
    );

    process.stdout.write(
      JSON.stringify({
        ok: true,
        status: 200,
        content: response.content,
        browserUrl: String(response.state?.url || chatgptUrl),
        usedAttachments,
        warnings: attachmentWarnings,
      })
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  const message =
    error instanceof Error ? error.message : "The ChatGPT browser fallback failed.";
  process.stderr.write(String(message));
  process.exit(1);
});
