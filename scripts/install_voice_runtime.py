from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_REPO = "Oriserve/Whisper-Hindi2Hinglish-Swift"
DEFAULT_MODEL_DIR = PROJECT_ROOT / "vendor" / "models" / "whisper-hindi2hinglish-swift"
VOICE_PACKAGES = [
    "huggingface_hub",
    "safetensors",
    "soundfile",
    "torch",
    "torchaudio",
    "transformers",
]


def run(command: list[str]) -> None:
    print("$", " ".join(command))
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)


def install_python_packages(python_executable: str) -> None:
    run([python_executable, "-m", "pip", "install", "--upgrade", *VOICE_PACKAGES])


def download_model(
    python_executable: str,
    model_repo: str,
    model_dir: Path,
    force_download: bool,
) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    hf_cli = shutil.which("hf")

    if hf_cli:
        command = [
            hf_cli,
            "download",
            model_repo,
            "--repo-type",
            "model",
            "--local-dir",
            str(model_dir),
        ]
        if force_download:
            command.append("--force-download")
        run(command)
        return

    fallback_script = (
        "from huggingface_hub import snapshot_download;"
        f"snapshot_download(repo_id={json.dumps(model_repo)}, "
        "repo_type='model', "
        f"local_dir={json.dumps(str(model_dir))}, "
        f"force_download={str(force_download)})"
    )
    run([python_executable, "-c", fallback_script])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-repo", default=DEFAULT_MODEL_REPO)
    parser.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR))
    parser.add_argument("--skip-pip", action="store_true")
    parser.add_argument("--force-download", action="store_true")
    args = parser.parse_args()

    python_executable = str(Path(sys.executable).resolve())
    model_dir = Path(args.model_dir).resolve()

    if not args.skip_pip:
        install_python_packages(python_executable)

    download_model(
        python_executable=python_executable,
        model_repo=args.model_repo,
        model_dir=model_dir,
        force_download=args.force_download,
    )

    print(
        json.dumps(
            {
                "pythonExecutable": python_executable,
                "modelRepo": args.model_repo,
                "modelDir": str(model_dir),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
