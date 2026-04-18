import "server-only";

import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

import { getPythonExecutable } from "@/lib/voice-runtime";

const FALLBACK_SCRIPT_PATH = path.join(process.cwd(), "scripts", "chatgpt_browser_bridge.py");
const FALLBACK_DOCKER_SCRIPT_PATH = path.join(
  process.cwd(),
  "scripts",
  "chatgpt_browser_bridge.mjs"
);
const FALLBACK_VENDOR_ROOT = path.join(process.cwd(), "vendor");

export type ChatGptBrowserFallbackResult = {
  ok: boolean;
  status: number;
  provider: "chatgpt_browser";
  content?: string;
  error?: string;
  prompt?: string;
  usedAttachments?: string[];
  warnings?: string[];
  browserUrl?: string;
  requiresManualIntervention?: boolean;
  manualInterventionReason?: string;
};

function resolvePythonExecutable() {
  const chatGptPython = process.env.CHATGPT_BROWSER_PYTHON_EXECUTABLE?.trim();
  if (chatGptPython && existsSync(chatGptPython)) {
    return chatGptPython;
  }

  const configuredPython = process.env.PYTHON_EXECUTABLE?.trim();
  if (configuredPython && existsSync(configuredPython)) {
    return configuredPython;
  }

  return getPythonExecutable({
    preferLocalVirtualEnv: true,
  });
}

function isDockerRuntime() {
  return String(process.env.DOCKER_ENV || "").trim().toLowerCase() === "true";
}

function resolveBridgeRunner() {
  if (isDockerRuntime()) {
    return {
      command: process.execPath,
      args: [FALLBACK_DOCKER_SCRIPT_PATH],
      scriptPath: FALLBACK_DOCKER_SCRIPT_PATH,
      mode: "node_cdp",
    };
  }

  return {
    command: resolvePythonExecutable(),
    args: [FALLBACK_SCRIPT_PATH],
    scriptPath: FALLBACK_SCRIPT_PATH,
    mode: "python_playwright",
  };
}

function normalizeAttachmentPaths(rawAttachments: unknown) {
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments
    : typeof rawAttachments === "string"
      ? rawAttachments
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

  const resolved: string[] = [];
  const warnings: string[] = [];

  for (const attachment of attachments) {
    const nextPath = path.isAbsolute(attachment)
      ? attachment
      : path.resolve(process.cwd(), attachment);

    if (!existsSync(nextPath)) {
      warnings.push(`Attachment not found: ${attachment}`);
      continue;
    }

    resolved.push(nextPath);
  }

  return {
    resolved,
    warnings,
  };
}

function buildManualReason(errorMessage: string) {
  if (/Brave is not exposing a remote debugging endpoint/i.test(errorMessage)) {
    return `${errorMessage} Open Brave with --remote-debugging-port=9222, make sure ChatGPT is already open, then try again.`;
  }

  if (/ChatGPT input box is not visible/i.test(errorMessage)) {
    return `${errorMessage} Bring the ChatGPT tab to a normal composer state, close any modal or verification screen, then try again.`;
  }

  if (/Timed out while waiting for a ChatGPT response/i.test(errorMessage)) {
    return `${errorMessage} Make sure the ChatGPT tab is responsive and not waiting on a captcha, modal, or stalled generation screen.`;
  }

  if (/Brave executable not found/i.test(errorMessage)) {
    return `${errorMessage} Update BRAVE_PATH or install Brave on this machine before retrying the hosted fallback.`;
  }

  return errorMessage;
}

function runBridge(payload: Record<string, unknown>) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const runner = resolveBridgeRunner();

    if (!existsSync(runner.scriptPath)) {
      reject(
        new Error(
          `ChatGPT browser fallback script is missing at ${runner.scriptPath}.`
        )
      );
      return;
    }

    const processHandle = spawn(runner.command, runner.args, {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: [
          FALLBACK_VENDOR_ROOT,
          process.env.PYTHONPATH,
        ]
          .filter(Boolean)
          .join(path.delimiter),
      },
    });

    let stdout = "";
    let stderr = "";

    processHandle.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    processHandle.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    processHandle.on("error", (error) => {
      reject(error);
    });

    processHandle.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || "ChatGPT browser fallback failed."));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : {}
        );
      } catch (error) {
        reject(
          new Error(
            error instanceof Error
              ? error.message
              : "ChatGPT browser fallback returned invalid JSON."
          )
        );
      }
    });

    processHandle.stdin.write(JSON.stringify(payload));
    processHandle.stdin.end();
  });
}

export function getChatGptBrowserFallbackStatus() {
  const runner = resolveBridgeRunner();

  return {
    scriptPath: runner.scriptPath,
    scriptReady: existsSync(runner.scriptPath),
    pythonExecutable: !isDockerRuntime() ? resolvePythonExecutable() : undefined,
    runner: runner.mode,
  };
}

export async function warmChatGptBrowserFallback() {
  try {
    const payload = await runBridge({
      warmup: true,
    });

    return {
      ok: true,
      status: 200,
      provider: "chatgpt_browser" as const,
      browserUrl: String(payload.url || ""),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The ChatGPT browser fallback could not warm up.";

    return {
      ok: false,
      status: 503,
      provider: "chatgpt_browser" as const,
      error: message,
      requiresManualIntervention: true,
      manualInterventionReason: buildManualReason(message),
    };
  }
}

export async function sendPromptViaChatGptBrowser({
  prompt,
  attachments,
}: {
  prompt: string;
  attachments?: unknown;
}): Promise<ChatGptBrowserFallbackResult> {
  const trimmedPrompt = String(prompt || "").trim();
  const normalizedAttachments = normalizeAttachmentPaths(attachments);

  if (!trimmedPrompt) {
    return {
      ok: false,
      status: 400,
      provider: "chatgpt_browser",
      error: "Add a prompt before calling chatgpt_browser.",
      usedAttachments: normalizedAttachments.resolved,
      warnings: normalizedAttachments.warnings,
    };
  }

  try {
    const payload = await runBridge({
      prompt: trimmedPrompt,
      attachments: normalizedAttachments.resolved,
    });

    return {
      ok: Boolean(payload.ok ?? true),
      status: Number(payload.status || 200),
      provider: "chatgpt_browser",
      prompt: trimmedPrompt,
      content: String(payload.content || ""),
      usedAttachments: Array.isArray(payload.usedAttachments)
        ? payload.usedAttachments.map((value) => String(value))
        : normalizedAttachments.resolved,
      warnings: [
        ...normalizedAttachments.warnings,
        ...(Array.isArray(payload.warnings)
          ? payload.warnings.map((value) => String(value))
          : []),
      ],
      browserUrl: payload.browserUrl ? String(payload.browserUrl) : undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The ChatGPT browser fallback could not complete the prompt.";

    return {
      ok: false,
      status: 503,
      provider: "chatgpt_browser",
      prompt: trimmedPrompt,
      error: message,
      usedAttachments: normalizedAttachments.resolved,
      warnings: normalizedAttachments.warnings,
      requiresManualIntervention: true,
      manualInterventionReason: buildManualReason(message),
    };
  }
}
