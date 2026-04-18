import argparse
import json
from pathlib import Path

import soundfile as sf
import torch
import torchaudio
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline


def load_transcriber(model_path: Path):
    if not model_path.exists():
        raise FileNotFoundError(f"Whisper model path not found: {model_path}")

    use_cuda = torch.cuda.is_available()
    device = 0 if use_cuda else -1
    torch_dtype = torch.float16 if use_cuda else torch.float32

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        str(model_path),
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        local_files_only=True,
    )
    if use_cuda:
        model.to("cuda:0")

    processor = AutoProcessor.from_pretrained(
        str(model_path),
        local_files_only=True,
    )

    return pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        dtype=torch_dtype,
        device=device,
    )


def load_audio(audio_path: Path):
    audio, sample_rate = sf.read(str(audio_path), dtype="float32")
    if audio.size == 0:
        raise ValueError("Recorded audio was empty.")

    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    waveform = torch.from_numpy(audio).float()
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)

    target_sample_rate = 16000
    if sample_rate != target_sample_rate:
        waveform = torchaudio.functional.resample(waveform, sample_rate, target_sample_rate)
        sample_rate = target_sample_rate

    return waveform.squeeze(0).contiguous().cpu().numpy(), sample_rate


def transcribe(model_path: Path, audio_path: Path, language: str):
    transcriber = load_transcriber(model_path)
    audio_array, sample_rate = load_audio(audio_path)

    generate_kwargs = {
        "task": "transcribe",
    }
    if language and language.lower() != "auto":
        generate_kwargs["language"] = language

    with torch.inference_mode():
        result = transcriber(
            {"array": audio_array, "sampling_rate": sample_rate},
            generate_kwargs=generate_kwargs,
        )

    text = str(result.get("text") or "").strip()
    if not text:
        raise RuntimeError("Local speech model returned an empty transcript.")

    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--language", default="auto")
    args = parser.parse_args()

    audio_path = Path(args.audio)
    model_path = Path(args.model)

    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    text = transcribe(model_path, audio_path, args.language)
    print(json.dumps({"text": text}))


if __name__ == "__main__":
    main()
