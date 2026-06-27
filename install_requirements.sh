#!/usr/bin/env bash
set -euo pipefail

echo "========================================================"
echo " TJ NODE ONE - Required Custom Nodes Installer"
echo " (Z-Image / Klein / QE2511 / Krea2 ONE STUDIO)"
echo "========================================================"
echo

# custom_nodes 폴더 = 이 스크립트의 한 단계 위
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CUSTOM_NODES="$( cd "$SCRIPT_DIR/.." && pwd )"
COMFYUI_DIR="$( cd "$CUSTOM_NODES/.." && pwd )"

cd "$CUSTOM_NODES"
echo "[INFO] Custom nodes folder: $CUSTOM_NODES"
echo

# Python 경로 탐색 (ComfyUI venv 우선)
PYTHON=""
if [ -f "$COMFYUI_DIR/venv/bin/python" ]; then
    PYTHON="$COMFYUI_DIR/venv/bin/python"
elif [ -f "$COMFYUI_DIR/../venv/bin/python" ]; then
    PYTHON="$COMFYUI_DIR/../venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
fi

if [ -z "$PYTHON" ]; then
    echo "[WARN] Python not found. pip install steps will be skipped."
    echo "       Run this script from inside the ComfyUI Python environment."
else
    echo "[INFO] Python: $PYTHON"
fi
echo

# ── 설치할 노드 목록 ───────────────────────────────────────────────────────────
REPOS=(
    "https://github.com/ltdrdata/ComfyUI-Impact-Pack"
    "https://github.com/ltdrdata/ComfyUI-Impact-Subpack"
    "https://github.com/kijai/ComfyUI-KJNodes"
    "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler"
    "https://github.com/cubiq/ComfyUI_FaceAnalysis"
    "https://github.com/1038lab/ComfyUI-RMBG"
    "https://github.com/Fannovel16/comfyui_controlnet_aux"
    "https://github.com/city96/ComfyUI-GGUF"
)

TOTAL=${#REPOS[@]}
IDX=0

for URL in "${REPOS[@]}"; do
    FOLDER="${URL##*/}"
    echo "--------------------------------------------------------"
    echo "[$IDX/$((TOTAL-1))] $FOLDER"
    echo "         $URL"

    if [ -d "$FOLDER" ]; then
        echo "[SKIP] Already installed."
    else
        echo "[INSTALL] Cloning..."
        if git clone "$URL" "$FOLDER"; then
            echo "[OK] Cloned successfully."
            # requirements.txt 가 있으면 pip install
            if [ -n "$PYTHON" ] && [ -f "$FOLDER/requirements.txt" ]; then
                echo "[PIP] Installing requirements..."
                if "$PYTHON" -m pip install -r "$FOLDER/requirements.txt" --quiet; then
                    echo "[PIP] Done."
                else
                    echo "[WARN] pip install had errors. Check manually."
                fi
            fi
        else
            echo "[ERROR] git clone failed. Check your internet connection."
        fi
    fi
    echo
    IDX=$((IDX+1))
done

echo "========================================================"
echo " Done! Restart ComfyUI to load the new nodes."
echo "========================================================"
