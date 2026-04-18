/**
 * Strips Qwen3-style <think>...</think> reasoning blocks from a string.
 * Qwen3 14b in its default mode prepends these before the actual answer.
 * This utility is safe to import in both server and client contexts.
 */
export function stripThinkingTags(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Extracts the first top-level JSON object or array from a string.
 * Useful when a model surrounds JSON with conversational prose.
 */
export function extractFirstJsonBlock(value: string): string | null {
  const match = value.match(/(?:\{[\s\S]*\}|\[[\s\S]*\])/);
  return match ? match[0] : null;
}
