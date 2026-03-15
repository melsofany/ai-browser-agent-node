#!/bin/bash

# Model download script - runs optionally at startup
# SKIPPED on cloud deployments (Render free plan) - use Ollama API instead

MODELS_DIR="/app/models"
mkdir -p "$MODELS_DIR/llama" "$MODELS_DIR/mistral" "$MODELS_DIR/qwen"

echo "=== Model Check ==="
echo "USE_LOCAL_MODELS=${USE_LOCAL_MODELS:-false}"

if [ "${USE_LOCAL_MODELS:-false}" != "true" ]; then
  echo "USE_LOCAL_MODELS is not 'true'. Skipping model downloads."
  echo "Using Ollama API or cloud AI providers instead."
  exit 0
fi

echo "USE_LOCAL_MODELS=true - checking for model files..."

download_if_missing() {
    local target_dir=$1
    local filename=$2
    local url=$3

    if [ -f "$target_dir/$filename" ]; then
        echo "$filename already exists. Skipping."
        return 0
    fi

    echo "Downloading $filename..."
    wget --timeout=300 --tries=2 -q -O "$target_dir/$filename.tmp" "$url" 2>&1
    if [ $? -eq 0 ]; then
        mv "$target_dir/$filename.tmp" "$target_dir/$filename"
        echo "$filename downloaded successfully."
    else
        rm -f "$target_dir/$filename.tmp"
        echo "WARNING: Failed to download $filename. Continuing without it."
    fi
}

download_if_missing "$MODELS_DIR/llama" "llama-3-8b-instruct.Q4_K_M.gguf" \
  "https://huggingface.co/MaziyarPanahi/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf"

download_if_missing "$MODELS_DIR/mistral" "mistral-7b-v0.3.Q4_K_M.gguf" \
  "https://huggingface.co/MaziyarPanahi/Mistral-7B-v0.3-GGUF/resolve/main/Mistral-7B-v0.3.Q4_K_M.gguf"

download_if_missing "$MODELS_DIR/qwen" "qwen2-7b-instruct.Q4_K_M.gguf" \
  "https://huggingface.co/Qwen/Qwen2-7B-Instruct-GGUF/resolve/main/qwen2-7b-instruct-q4_k_m.gguf"

echo "Model check complete."
exit 0
