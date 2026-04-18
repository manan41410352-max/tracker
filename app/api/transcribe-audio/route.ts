import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { getVoiceRuntimeStatus } from "@/lib/voice-runtime";

export const runtime = "nodejs";

function runPythonTranscription({
  audioPath,
  modelPath,
  language,
  pythonExecutable,
}: {
  audioPath: string;
  modelPath: string;
  language: string;
  pythonExecutable: string;
}) {
  const scriptPath = path.join(process.cwd(), "scripts", "transcribe_audio.py");

  return new Promise<{ text: string }>((resolve, reject) => {
    const processHandle = spawn(
      pythonExecutable,
      [scriptPath, "--audio", audioPath, "--model", modelPath, "--language", language],
      {
        windowsHide: true,
      }
    );

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
        reject(new Error(stderr.trim() || stdout.trim() || "Voice transcription failed."));
        return;
      }

      try {
        const payload = JSON.parse(stdout);
        resolve(payload);
      } catch (error) {
        reject(
          new Error(
            error instanceof Error
              ? error.message
              : "Voice transcription returned invalid JSON."
          )
        );
      }
    });
  });
}

export async function POST(req: NextRequest) {
  const voiceRuntime = getVoiceRuntimeStatus();
  const tempFile = path.join(os.tmpdir(), `systematic-tracker-voice-${randomUUID()}.wav`);

  try {
    if (!voiceRuntime.modelPath) {
      return NextResponse.json(
        {
          error:
            "No local Whisper model path was found. Set WHISPER_MODEL_PATH or install the local whisper model.",
        },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Upload a WAV recording before requesting transcription." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    await writeFile(tempFile, buffer);

    const result = await runPythonTranscription({
      audioPath: tempFile,
      modelPath: voiceRuntime.modelPath,
      language: voiceRuntime.language,
      pythonExecutable: voiceRuntime.pythonExecutable,
    });

    return NextResponse.json({
      text: result.text,
      modelPath: voiceRuntime.modelPath,
    });
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unable to transcribe audio locally.";

    return NextResponse.json(
      {
        error:
          "The local voice transcription runtime could not process the recording.",
        details,
      },
      { status: 503 }
    );
  } finally {
    await unlink(tempFile).catch(() => undefined);
  }
}
