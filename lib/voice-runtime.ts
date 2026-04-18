import { existsSync } from "fs";
import os from "os";
import path from "path";

const PROJECT_VOICE_MODEL_DIR = path.resolve(
  process.cwd(),
  "vendor",
  "models",
  "whisper-hindi2hinglish-swift"
);

const LOCAL_PYTHON_CANDIDATES = [
  path.resolve(process.cwd(), ".venv", "Scripts", "python.exe"),
  path.resolve(process.cwd(), ".venv", "bin", "python"),
  path.resolve(process.cwd(), "venv", "Scripts", "python.exe"),
  path.resolve(process.cwd(), "venv", "bin", "python"),
  path.join(os.homedir(), ".virtualenvs", "systematic-tracker", "Scripts", "python.exe"),
].filter(Boolean);

function normalizeConfiguredPath(candidate?: string | null) {
  const trimmed = String(candidate || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!trimmed) {
    return null;
  }

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

function resolveExistingPath(candidate?: string | null) {
  const normalized = normalizeConfiguredPath(candidate);
  return normalized && existsSync(normalized) ? normalized : null;
}

const DEFAULT_MODEL_CANDIDATES = [
  process.env.WHISPER_MODEL_PATH,
  PROJECT_VOICE_MODEL_DIR,
  path.join(os.homedir(), ".ollama", "models", "external", "whisperflow"),
  path.join(os.homedir(), ".ollama", "models", "external", "WhisperFlow"),
  path.join(
    os.homedir(),
    ".ollama",
    "models",
    "external",
    "Oriserve-Whisper-Hindi2Hinglish-Apex"
  ),
].filter(Boolean) as string[];

export function resolveWhisperModelPath() {
  return (
    DEFAULT_MODEL_CANDIDATES.map((candidate) => resolveExistingPath(candidate)).find(Boolean) ??
    null
  );
}

function isHinglishModelPath(modelPath?: string | null) {
  const normalized = String(modelPath || "").toLowerCase();
  return normalized.includes("hinglish") || normalized.includes("hindi2hinglish");
}

export function getWhisperLanguage(modelPath?: string | null) {
  const configuredLanguage = String(process.env.WHISPER_LANGUAGE || "").trim();

  if (configuredLanguage && configuredLanguage.toLowerCase() !== "auto") {
    return configuredLanguage;
  }

  if (isHinglishModelPath(modelPath)) {
    return "en";
  }

  return configuredLanguage || "auto";
}

function resolveExistingExecutable(candidate?: string | null) {
  return resolveExistingPath(candidate);
}

export function getPythonExecutable({
  preferLocalVirtualEnv = false,
}: {
  preferLocalVirtualEnv?: boolean;
} = {}) {
  const configuredPython = resolveExistingExecutable(process.env.PYTHON_EXECUTABLE);
  if (configuredPython) {
    return configuredPython;
  }

  if (preferLocalVirtualEnv) {
    const localPython = LOCAL_PYTHON_CANDIDATES.find((candidate) =>
      existsSync(candidate)
    );

    if (localPython) {
      return localPython;
    }
  }

  return process.platform === "win32" ? "python" : "python3";
}

export function getVoiceRuntimeStatus() {
  const modelPath = resolveWhisperModelPath();

  return {
    modelPath,
    pythonExecutable: getPythonExecutable({ preferLocalVirtualEnv: true }),
    language: getWhisperLanguage(modelPath),
  };
}
