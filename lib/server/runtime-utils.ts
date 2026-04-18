import "server-only";

import { stripThinkingTags } from "@/lib/text-utils";
import type { AgentTool } from "@/lib/runtime-types";

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseToolArguments(input: unknown) {
  if (!input) {
    return {};
  }

  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return {};
    }
  }

  if (typeof input === "object") {
    return input as Record<string, unknown>;
  }

  return {};
}

export function appendQueryParams(url: string, params: Record<string, unknown>) {
  const urlObject = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      urlObject.searchParams.set(key, String(value));
    }
  }

  return urlObject.toString();
}

export function fillUrlPlaceholders(url: string, params: Record<string, unknown>) {
  let resolvedUrl = url;

  for (const [key, value] of Object.entries(params)) {
    resolvedUrl = resolvedUrl
      .replaceAll(`{{${key}}}`, encodeURIComponent(String(value)))
      .replaceAll(`{${key}}`, encodeURIComponent(String(value)));
  }

  if (/\{[^}]+\}/.test(resolvedUrl) && Object.keys(params).length === 1) {
    const replacementValue = encodeURIComponent(String(Object.values(params)[0]));
    resolvedUrl = resolvedUrl.replace(/\{[^}]+\}/, replacementValue);
  }

  return resolvedUrl.replace("/currrent.json", "/current.json");
}

export function buildToolSchema(parameters?: Record<string, string>) {
  const entries = Object.entries(parameters ?? {});

  return {
    type: "object",
    properties: Object.fromEntries(
      entries.map(([key, type]) => [
        key,
        {
          type:
            type === "number"
              ? "number"
              : type === "boolean"
                ? "boolean"
                : "string",
        },
      ])
    ),
    required: entries
      .filter(([, type]) => type !== "optional")
      .map(([key]) => key),
  };
}

export function extractTextToolCalls(
  content: string,
  toolRegistry: Map<string, AgentTool>
) {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const candidateBlocks = [
    trimmed,
    ...(trimmed.match(/```json([\s\S]*?)```/gi) ?? []).map((block) =>
      block.replace(/```json|```/gi, "").trim()
    ),
    ...(trimmed.match(/\{[\s\S]*\}/g) ?? []),
  ];

  for (const block of candidateBlocks) {
    try {
      const parsed = JSON.parse(block);
      const calls = Array.isArray(parsed) ? parsed : [parsed];

      const normalizedCalls = calls
        .map((call) => {
          const rawName =
            typeof call?.name === "string"
              ? call.name
              : typeof call?.function?.name === "string"
                ? call.function.name
                : "";

          if (!toolRegistry.has(rawName)) {
            return null;
          }

          const rawArguments =
            call?.parameters ??
            call?.arguments ??
            call?.function?.arguments ??
            {};

          return {
            function: {
              name: rawName,
              arguments:
                typeof rawArguments === "string"
                  ? parseToolArguments(rawArguments)
                  : rawArguments,
            },
          };
        })
        .filter(Boolean);

      if (normalizedCalls.length) {
        return normalizedCalls as any[];
      }
    } catch {
      // Ignore invalid JSON blocks.
    }
  }

  return [];
}

export { stripThinkingTags };

export function tryParseJson(value: string) {
  // Normalise the input: strip thinking tags and markdown code fences
  function clean(s: string): string {
    return stripThinkingTags(s)
      // Strip ```json ... ``` and ``` ... ``` wrappers
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
  }

  try {
    return JSON.parse(value);
  } catch {
    const cleaned = clean(value);

    // Try 1: parse after cleaning fences + thinking tags
    try {
      return JSON.parse(cleaned);
    } catch {
      // fall through
    }

    // Try 2: extract first {...} or [...] JSON block from cleaned text
    const blockMatch = cleaned.match(/(?:\{[\s\S]*\}|\[[\s\S]*\])/);
    if (blockMatch) {
      try {
        return JSON.parse(blockMatch[0]);
      } catch {
        // not valid JSON
      }
    }

    return null;
  }
}

export function ensureObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function getStatePathValue(state: Record<string, any>, path: string) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<any>((acc, segment) => {
      if (acc === undefined || acc === null) {
        return undefined;
      }

      if (segment.endsWith("]")) {
        const match = segment.match(/^([^\[]+)\[(\d+)\]$/);
        if (!match) {
          return acc?.[segment];
        }

        return acc?.[match[1]]?.[Number(match[2])];
      }

      return acc?.[segment];
    }, state);
}

export function stringifyValue(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function applyTemplate(
  value: unknown,
  state: Record<string, any>
): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, rawPath) => {
      const resolved = getStatePathValue(state, String(rawPath).trim());
      return resolved === undefined || resolved === null ? "" : stringifyValue(resolved);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyTemplate(item, state));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, applyTemplate(nested, state)])
    );
  }

  return value;
}

export function parsePrimitive(value: string) {
  const trimmed = value.trim();

  if (!trimmed.length) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (!Number.isNaN(Number(trimmed)) && trimmed.match(/^-?\d+(\.\d+)?$/)) {
    return Number(trimmed);
  }

  const json = tryParseJson(trimmed);
  if (json !== null) {
    return json;
  }

  return trimmed.replace(/^['"]|['"]$/g, "");
}

export function compareValues(left: any, operator: string, right: any) {
  switch (operator) {
    case "==":
      return left == right;
    case "!=":
      return left != right;
    case ">":
      return left > right;
    case "<":
      return left < right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    default:
      return false;
  }
}
