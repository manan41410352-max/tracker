import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const pdfParseMod = require("pdf-parse") as any;
  const parseFn: (buffer: Buffer) => Promise<{ text: string }> =
    typeof pdfParseMod === "function" ? pdfParseMod : pdfParseMod.default;
  const result = await parseFn(buffer);
  return String(result.text || "").trim();
}

function trimContext(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... content truncated for context window ...]";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const fileName = String(file.name || "upload");
    const isTextFile =
      fileName.endsWith(".txt") ||
      fileName.endsWith(".md") ||
      file.type.startsWith("text/");
    const isPdf =
      fileName.toLowerCase().endsWith(".pdf") ||
      file.type === "application/pdf";

    if (!isPdf && !isTextFile) {
      return NextResponse.json(
        { error: "Only PDF and plain-text files are supported." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";

    if (isTextFile) {
      extractedText = buffer.toString("utf-8");
    } else {
      // Write to temp file then parse (pdf-parse needs a path or buffer)
      const tmpPath = join(tmpdir(), `workflow-pdf-${randomUUID()}.pdf`);
      try {
        await writeFile(tmpPath, buffer);
        extractedText = await extractPdfText(await readFile(tmpPath));
      } finally {
        await unlink(tmpPath).catch(() => undefined);
      }
    }

    const trimmed = trimContext(extractedText);

    return NextResponse.json({
      ok: true,
      fileName,
      charCount: trimmed.length,
      text: trimmed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
