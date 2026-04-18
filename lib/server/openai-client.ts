/**
 * Thin wrapper around the OpenAI Chat Completions API.
 * Uses the OPENAI_API_KEY environment variable.
 * Safe to import in server-only contexts.
 */

import "server-only";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenAIChatOptions = {
  messages: OpenAIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type OpenAIChatResult = {
  ok: boolean;
  content: string;
  model: string;
  error?: string;
};

export function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

export function isOpenAIConfigured() {
  return Boolean(getOpenAIApiKey());
}

export async function openAIChat({
  messages,
  model = "gpt-4o",
  temperature = 0.3,
  maxTokens = 4096,
}: OpenAIChatOptions): Promise<OpenAIChatResult> {
  const apiKey = getOpenAIApiKey();

  if (!apiKey) {
    return {
      ok: false,
      content: "",
      model,
      error: "OPENAI_API_KEY is not configured. Add it to .env.local.",
    };
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        content: "",
        model,
        error: `OpenAI API error ${response.status}: ${errorBody.slice(0, 300)}`,
      };
    }

    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || "").trim();

    return {
      ok: true,
      content,
      model: String(data?.model || model),
    };
  } catch (error) {
    return {
      ok: false,
      content: "",
      model,
      error: error instanceof Error ? error.message : "OpenAI request failed.",
    };
  }
}

/**
 * Specialized helper: send a single prompt to GPT-4o and get a plain text response.
 * Drop-in interface compatible with the old ChatGPT browser fallback result shape.
 */
export async function sendPromptViaOpenAI({
  prompt,
  systemPrompt,
  model = "gpt-4o",
}: {
  prompt: string;
  systemPrompt?: string;
  model?: string;
}): Promise<{ ok: boolean; content: string; error?: string }> {
  const messages: OpenAIMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  const result = await openAIChat({ messages, model });

  return {
    ok: result.ok,
    content: result.content,
    error: result.error,
  };
}
