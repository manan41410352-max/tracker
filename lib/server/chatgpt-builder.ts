import "server-only";

import { sendPromptViaChatGptBrowser } from "@/lib/chatgpt-browser-fallback";
import { isOpenAIConfigured, openAIChat } from "@/lib/server/openai-client";
import { tryParseJson } from "@/lib/server/runtime-utils";

function extractCandidateJsonBlocks(content: string) {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fencedBlocks = trimmed.match(/```json([\s\S]*?)```/gi) ?? [];

  for (const block of fencedBlocks) {
    candidates.push(block.replace(/```json|```/gi, "").trim());
  }

  const firstBraceIndex = trimmed.indexOf("{");
  const lastBraceIndex = trimmed.lastIndexOf("}");
  if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex >= firstBraceIndex) {
    candidates.push(trimmed.slice(firstBraceIndex, lastBraceIndex + 1));
  }

  return [...new Set(candidates.filter(Boolean))];
}

export async function requestChatGptBuilderJson<T>({
  prompt,
  action,
  attachments,
}: {
  prompt: string;
  action: string;
  attachments?: string[];
}): Promise<T> {
  if (isOpenAIConfigured()) {
    const attachmentNote =
      Array.isArray(attachments) && attachments.length > 0
        ? "\n\nAttachment note: raw file uploads are not forwarded over the OpenAI API path. Use the extracted file intelligence already included in the prompt as the source of truth."
        : "";

    const result = await openAIChat({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o",
      temperature: 0.2,
      maxTokens: 4096,
      messages: [
        {
          role: "system",
          content:
            "You are a precise workflow-builder assistant. Return only valid JSON that matches the user's requested schema and instructions. Do not wrap the answer in markdown unless the user explicitly asks for it.",
        },
        {
          role: "user",
          content: `${prompt}${attachmentNote}`,
        },
      ],
    });

    if (!result.ok || !result.content?.trim()) {
      throw new Error(
        result.error ||
          `The OpenAI builder proxy could not ${action}.`
      );
    }

    for (const candidate of extractCandidateJsonBlocks(result.content)) {
      const parsed = tryParseJson(candidate);
      if (parsed !== null) {
        return parsed as T;
      }
    }

    throw new Error(
      `The OpenAI builder proxy returned invalid JSON while trying to ${action}.`
    );
  }

  const result = await sendPromptViaChatGptBrowser({
    prompt,
    attachments,
  });

  if (!result.ok || !result.content?.trim()) {
    throw new Error(
      result.manualInterventionReason ||
        result.error ||
        `The ChatGPT builder proxy could not ${action}.`
    );
  }

  for (const candidate of extractCandidateJsonBlocks(result.content)) {
    const parsed = tryParseJson(candidate);
    if (parsed !== null) {
      return parsed as T;
    }
  }

  throw new Error(
    `The ChatGPT builder proxy returned invalid JSON while trying to ${action}.`
  );
}
