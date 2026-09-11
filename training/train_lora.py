"""Train the THRN LoRA adapter with Hugging Face AutoTrain.

Run this in a Colab/A100 runtime after cloning this repository.
Cloudflare's current LoRA tutorial uses an A100-class runtime and
mistralai/Mistral-7B-Instruct-v0.2 with quantization disabled and lora-r=8.
"""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "training" / "thrn-training.csv"
OUT = ROOT / "training" / "thrn-aio-aeo-lora"

if not DATA.exists():
    raise SystemExit(f"Training data not found: {DATA}")

subprocess.check_call([
    sys.executable, "-m", "pip", "install", "-U",
    "autotrain-advanced", "transformers", "datasets", "peft", "accelerate"
])

# AutoTrain expects a single text column for this dataset.
cmd = [
    sys.executable, "-m", "autotrain.trainers.clm",
    "--training_config", str(ROOT / "training" / "autotrain-config.yml"),
]
subprocess.check_call(cmd)

print(f"Training finished. Look for adapter_model.safetensors and adapter_config.json under {OUT}.")
