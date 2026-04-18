import { stripThinkingTags } from "@/lib/text-utils";

const DEFAULT_LOCAL_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_DOCKER_OLLAMA_URL = "http://host.docker.internal:11434";

export const DEFAULT_PRIMARY_LOCAL_MODEL = "qwen3:14b-q4_K_M";
export const DEFAULT_RECOVERY_LOCAL_MODEL = "qwen3.5:35b-a3b";
export const DEFAULT_VISION_LOCAL_MODEL = "qwen2.5vl:7b";
export const DEFAULT_LEGACY_LOCAL_MODEL = "llama3.1:8b";

const DEFAULT_OLLAMA_MODEL = DEFAULT_PRIMARY_LOCAL_MODEL;
const DEFAULT_OLLAMA_FALLBACK_MODEL = DEFAULT_RECOVERY_LOCAL_MODEL;
const SUPPORTED_LOCAL_MODELS = [
  DEFAULT_PRIMARY_LOCAL_MODEL,
  DEFAULT_RECOVERY_LOCAL_MODEL,
  DEFAULT_LEGACY_LOCAL_MODEL,
  DEFAULT_VISION_LOCAL_MODEL,
] as const;

export type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: any[];
};

function canParseJson(value: string) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeLocalModel(model?: string) {
  const candidate = model?.trim();
  if (!candidate) {
    return DEFAULT_OLLAMA_MODEL;
  }

  const allowedOverrideModels = [
    process.env.OLLAMA_QWEN_EXTRACTOR_MODEL?.trim(),
  ].filter(Boolean) as string[];

  if (allowedOverrideModels.includes(candidate)) {
    return candidate;
  }

  return SUPPORTED_LOCAL_MODELS.includes(candidate as (typeof SUPPORTED_LOCAL_MODELS)[number])
    ? candidate
    : DEFAULT_OLLAMA_MODEL;
}

export function getOllamaBaseUrl() {
  return (
    process.env.OLLAMA_BASE_URL?.trim() ||
    (process.env.DOCKER_ENV === "true"
      ? DEFAULT_DOCKER_OLLAMA_URL
      : DEFAULT_LOCAL_OLLAMA_URL)
  );
}

export function getOllamaModel() {
  return normalizeLocalModel(process.env.OLLAMA_MODEL?.trim());
}

export function getOllamaFallbackModel() {
  return normalizeLocalModel(
    process.env.OLLAMA_FALLBACK_MODEL?.trim() || DEFAULT_OLLAMA_FALLBACK_MODEL
  );
}

export function getOllamaRecoveryModel() {
  return getOllamaFallbackModel();
}

export function getOllamaStatus() {
  return {
    baseUrl: getOllamaBaseUrl(),
    model: getOllamaModel(),
    fallbackModel: getOllamaFallbackModel(),
  };
}

// Keys not supported by Ollama /api/generate
const UNSUPPORTED_GENERATE_KEYS = new Set([
  "tool_choice",
  "response_format",
  "stream_options",
  "preferredModel",
  "n",
  "logprobs",
]);

// Keys not supported by Ollama /api/chat
const UNSUPPORTED_CHAT_KEYS = new Set([
  "tool_choice",
  "response_format",
  "stream_options",
  "preferredModel",
  "n",
  "logprobs",
]);

function stripUnsupportedKeys(payload: object, unsupported: Set<string>): object {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !unsupported.has(key))
  );
}

async function ollamaRequest<T>(
  path: string,
  payload: object,
  model: string
): Promise<T> {
  const baseUrl = getOllamaBaseUrl();
  const unsupported = path.includes("/api/chat") ? UNSUPPORTED_CHAT_KEYS : UNSUPPORTED_GENERATE_KEYS;
  const cleanPayload = stripUnsupportedKeys(payload, unsupported);

  const doRequest = async (body: object) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        model,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Ollama request failed (${response.status}). ${details || "No response body."}`
      );
    }

    return response.json() as Promise<T>;
  };

  try {
    return await doRequest(cleanPayload);
  } catch (error) {
    // If Ollama rejected due to tools/parameters, retry without tools
    const message = error instanceof Error ? error.message : String(error);
    if (/400/.test(message) && "tools" in cleanPayload) {
      const { tools: _t, ...payloadWithoutTools } = cleanPayload as any;
      return await doRequest(payloadWithoutTools);
    }
    throw error;
  }
}

async function ollamaRequestWithFallback<T>(path: string, payload: object) {
  const primaryModel = getOllamaModel();
  const fallbackModel = getOllamaFallbackModel();
  const preferredModel =
    typeof (payload as { preferredModel?: string }).preferredModel === "string"
      ? normalizeLocalModel((payload as { preferredModel?: string }).preferredModel)
      : null;
  const modelsToTry = [primaryModel, fallbackModel].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index
  );
  const orderedModels = preferredModel
    ? [preferredModel, ...modelsToTry].filter(
        (model, index, all) => Boolean(model) && all.indexOf(model) === index
      )
    : modelsToTry;

  let lastError: Error | null = null;

  for (const model of orderedModels) {
    try {
      const nextPayload =
        "preferredModel" in (payload as Record<string, unknown>)
          ? Object.fromEntries(
              Object.entries(payload as Record<string, unknown>).filter(
                ([key]) => key !== "preferredModel"
              )
            )
          : payload;

      return await ollamaRequest<T>(path, nextPayload, model);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Unknown Ollama error");
    }
  }

  throw lastError ?? new Error("Unknown Ollama error");
}

async function repairJsonWithRecoveryModel(
  originalPrompt: string,
  invalidResponse: string
) {
  const recoveryModel = getOllamaRecoveryModel();
  const repaired = await ollamaRequest<{ response: string }>(
    "/api/generate",
    {
      prompt: `You are repairing invalid JSON for a local workflow runtime.
Return only valid JSON.

Original JSON-only prompt:
${originalPrompt}

Invalid response:
${invalidResponse}`,
      format: "json",
      stream: false,
      options: {
        temperature: 0.1,
      },
    },
    recoveryModel
  );

  return repaired.response;
}

export async function ollamaGenerateJson(prompt: string, preferredModel?: string) {
  const data = await ollamaRequestWithFallback<{ response: string }>(
    "/api/generate",
    {
      prompt,
      format: "json",
      stream: false,
      preferredModel,
      options: {
        temperature: 0.2,
      },
    }
  );

  const rawResponse = String(data.response || "").trim();
  if (!rawResponse || canParseJson(rawResponse)) {
    return rawResponse;
  }

  try {
    const repaired = String(
      await repairJsonWithRecoveryModel(prompt, rawResponse)
    ).trim();
    return repaired || rawResponse;
  } catch {
    return rawResponse;
  }
}

export async function ollamaChat({
  messages,
  tools,
  model,
}: {
  messages: OllamaMessage[];
  tools?: any[];
  model?: string;
}) {
  const data = await ollamaRequestWithFallback<{ message: OllamaMessage }>(
    "/api/chat",
    {
      messages,
      tools,
      preferredModel: model,
      stream: false,
      options: {
        temperature: 0.2,
      },
    }
  );

  const message = data.message;
  if (message.content) {
    message.content = stripThinkingTags(message.content);
  }
  return message;
}

export async function ollamaGenerateJsonFromImages({
  prompt,
  images,
  preferredModel,
}: {
  prompt: string;
  images: string[];
  preferredModel?: string;
}) {
  const modelsToTry = [
    normalizeLocalModel(preferredModel || DEFAULT_VISION_LOCAL_MODEL),
    DEFAULT_VISION_LOCAL_MODEL,
  ].filter((model, index, all) => all.indexOf(model) === index);
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const data = await ollamaRequest<{ response: string }>(
        "/api/generate",
        {
          prompt,
          images,
          format: "json",
          stream: false,
          options: {
            temperature: 0.1,
          },
        },
        model
      );

      const rawResponse = String(data.response || "").trim();
      if (!rawResponse || canParseJson(rawResponse)) {
        return rawResponse;
      }

      try {
        const repaired = String(
          await repairJsonWithRecoveryModel(prompt, rawResponse)
        ).trim();
        return repaired || rawResponse;
      } catch {
        return rawResponse;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown Ollama image error");
    }
  }

  throw lastError ?? new Error("Unknown Ollama image error");
}
