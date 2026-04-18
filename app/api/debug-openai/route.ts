import { NextResponse } from "next/server";
import { isOpenAIConfigured, openAIChat, getOpenAIApiKey } from "@/lib/server/openai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = getOpenAIApiKey();
  const configured = isOpenAIConfigured();

  if (!configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      keyPrefix: "(not set)",
      error: "OPENAI_API_KEY is not configured in environment.",
    });
  }

  // Mask key for safety — show only first 10 chars
  const keyPrefix = key.slice(0, 10) + "...";

  try {
    const result = await openAIChat({
      messages: [
        { role: "system", content: "You are a test assistant. Reply with exactly: {\"ok\":true}" },
        { role: "user", content: "Ping" },
      ],
      model: "gpt-4o-mini",
      maxTokens: 20,
    });

    return NextResponse.json({
      ok: result.ok,
      configured: true,
      keyPrefix,
      model: result.model,
      content: result.content,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      keyPrefix,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
