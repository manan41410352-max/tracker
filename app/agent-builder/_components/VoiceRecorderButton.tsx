"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon, Mic, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

function mergeBuffers(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
) {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let index = offsetBuffer; index < nextOffsetBuffer && index < buffer.length; index += 1) {
      accum += buffer[index];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function VoiceRecorderButton({ onTranscript, disabled, className }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const cleanupRecording = async () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    muteGainRef.current?.disconnect();

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      await audioContextRef.current.close().catch(() => undefined);
    }

    processorRef.current = null;
    sourceRef.current = null;
    muteGainRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
  };

  useEffect(() => {
    return () => {
      void cleanupRecording();
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser cannot access your microphone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new window.AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const muteGain = audioContext.createGain();

      muteGain.gain.value = 0;
      chunksRef.current = [];

      processor.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(channelData));
      };

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      mediaStreamRef.current = stream;
      sourceRef.current = source;
      processorRef.current = processor;
      muteGainRef.current = muteGain;

      setIsRecording(true);
      toast.success("Recording started. Click again to transcribe.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Microphone access was blocked.";
      toast.error(message);
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      setIsTranscribing(true);

      const audioContext = audioContextRef.current;
      const sampleRate = audioContext?.sampleRate ?? 44100;
      const merged = mergeBuffers(chunksRef.current);

      await cleanupRecording();

      if (!merged.length) {
        toast.error("No audio was captured. Try recording once more.");
        return;
      }

      const downsampled = downsampleBuffer(merged, sampleRate, 16000);
      const wavBlob = encodeWav(downsampled, 16000);
      const formData = new FormData();
      formData.append("audio", wavBlob, "voice-command.wav");

      const response = await fetch("/api/transcribe-audio", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || payload?.details || "Voice transcription failed."
        );
      }

      const transcript = String(payload?.text || "").trim();
      if (!transcript) {
        throw new Error("The recording was processed but no transcript came back.");
      }

      onTranscript(transcript);
      toast.success("Voice command added to the prompt.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to transcribe the recording.";
      toast.error(message);
    } finally {
      chunksRef.current = [];
      setIsTranscribing(false);
    }
  };

  return (
    <Button
      type="button"
      variant={isRecording ? "destructive" : "outline"}
      size="icon"
      className={className}
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled || isTranscribing}
      title={isRecording ? "Stop recording" : "Record a voice command"}
    >
      {isTranscribing ? (
        <Loader2Icon className="animate-spin" />
      ) : isRecording ? (
        <Square />
      ) : (
        <Mic />
      )}
    </Button>
  );
}

export default VoiceRecorderButton;
