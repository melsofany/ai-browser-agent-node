#!/bin/bash

# Directory for models
MODELS_DIR="/app/models"
mkdir -p "$MODELS_DIR/llama" "$MODELS_DIR/mistral" "$MODELS_DIR/qwen"

echo "Checking for model files in $MODELS_DIR..."

# Function to download if not exists
download_if_missing() {
    local target_dir=$1
    local filename=$2
    local url=$3
    
    if [ ! -f "$target_dir/$filename" ]; then
        echo "Downloading $filename to $target_dir..."
        wget -O "$target_dir/$filename" "$url"
    else
        echo "$filename already exists in $target_dir. Skipping download."
    fi
}

# Llama 3 8B Instruct GGUF (Quantized)
download_if_missing "$MODELS_DIR/llama" "llama-3-8b-instruct.Q4_K_M.gguf" "https://huggingface.co/MaziyarPanahi/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf"

# Mistral 7B v0.3 GGUF (Quantized)
download_if_missing "$MODELS_DIR/mistral" "mistral-7b-v0.3.Q4_K_M.gguf" "https://huggingface.co/MaziyarPanahi/Mistral-7B-v0.3-GGUF/resolve/main/Mistral-7B-v0.3.Q4_K_M.gguf"

# Qwen 2 7B Instruct GGUF (Quantized)
download_if_missing "$MODELS_DIR/qwen" "qwen2-7b-instruct.Q4_K_M.gguf" "https://huggingface.co/Qwen/Qwen2-7B-Instruct-GGUF/resolve/main/qwen2-7b-instruct-q4_k_m.gguf"

echo "Model check/download complete."
