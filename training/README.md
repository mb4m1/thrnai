# THRN Workers AI fine-tuning

This directory prepares THRN for a Cloudflare Workers AI LoRA fine-tune.

## What is already in the repo

- `thrn-training.csv` contains THRN-specific instruction/response examples based on FRM-AIO-AEO-013 and the existing THRN diagnostic philosophy.
- The dataset uses Cloudflare's documented single-column `text` format.

## Important

The Worker itself does not train model weights. The LoRA adapter must be trained with a compatible base model (for example through the Cloudflare-documented Hugging Face AutoTrain workflow), then the resulting `adapter_config.json` and `adapter_model.safetensors` are uploaded to Workers AI as a fine-tune.

Do not activate a LoRA in production until the adapter has been trained and evaluated.

## Recommended workflow

1. Train the dataset with a Workers AI-compatible LoRA base model.
2. Download `adapter_config.json` and `adapter_model.safetensors`.
3. Ensure the adapter config contains the correct `model_type` (`mistral`, `gemma`, or `llama`) and is compatible with the selected base model.
4. Create a Workers AI fine-tune and upload both adapter assets.
5. Evaluate the fine-tuned model against THRN's test prompts.
6. Only after passing evaluation, wire the fine-tuned model into `src/workersAI.ts`.

## Why this is separate from the Worker

Workers AI fine-tuned inference uses a base model plus a LoRA adapter. The current THRN Worker already has a Workers AI binding in `wrangler.json` and calls the GPT-OSS models through `src/workersAI.ts`. The current GPT-OSS path is intentionally left untouched until a compatible THRN adapter has been trained.
