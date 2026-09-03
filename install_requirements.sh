#!/usr/bin/env bash
# TJ NODE ONE - required custom nodes installer / updater (Linux / macOS)
#
#   bash install_requirements.sh
#   chmod +x install_requirements.sh && ./install_requirements.sh
#
# Installs every node pack the ONE STUDIO nodes depend on, and updates the ones already
# present (git pull + re-check requirements). Models are NOT downloaded - those are
# listed at the end and go in by hand.
#
# Deliberately no `set -e`: one pack failing to clone or to build a dependency must not
# abort the other nineteen. Each step reports its own result and the run continues, with
# a summary at the end.
set -uo pipefail

# Force Python's text I/O to UTF-8 regardless of the OS locale, so a package whose
# setup.py reads a non-ASCII file with the system default encoding does not crash with
# UnicodeDecodeError (e.g. groundingdino-py, pulled in by ComfyUI-RMBG).
export PYTHONUTF8=1

echo "========================================================"
echo " TJ NODE ONE - Custom Nodes Installer / Updater"
echo " (Z-Image / Klein / QE2511 / Krea2 / SDXL / Anima / MiniMax H3)"
echo "========================================================"
echo

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# ComfyUI folder: the first argument wins ("./install_requirements.sh /path/to/ComfyUI");
# otherwise it is derived from where this script sits (custom_nodes/<this pack>/ -> up 2).
# Passing the path lets you run this from anywhere and covers unusual install layouts.
if [ -n "${1:-}" ]; then
    COMFYUI_DIR="$1"
else
    COMFYUI_DIR="$SCRIPT_DIR/../.."
fi
if [ ! -d "$COMFYUI_DIR" ]; then
    echo "[FATAL] ComfyUI folder not found: $COMFYUI_DIR"
    echo "        Pass it as the first argument, e.g.  ./install_requirements.sh ~/ComfyUI"
    exit 1
fi
COMFYUI_DIR="$( cd "$COMFYUI_DIR" && pwd )"
if [ ! -f "$COMFYUI_DIR/main.py" ]; then
    echo "[FATAL] \"$COMFYUI_DIR\" does not look like a ComfyUI folder (no main.py)."
    echo "        Pass the ComfyUI folder itself, e.g.  ./install_requirements.sh ~/ComfyUI"
    exit 1
fi
BASE_DIR="$( cd "$COMFYUI_DIR/.." && pwd )"          # portable root / Desktop base dir
CUSTOM_NODES="$COMFYUI_DIR/custom_nodes"
mkdir -p "$CUSTOM_NODES"

cd "$CUSTOM_NODES" || { echo "[FATAL] cannot enter $CUSTOM_NODES"; exit 1; }
echo "[INFO] ComfyUI folder     : $COMFYUI_DIR"
echo "[INFO] Custom nodes folder : $CUSTOM_NODES"
echo

# --- Python discovery: ComfyUI's own environment first, system Python opt-in only ---
#
# A real venv wins over any base interpreter: ComfyUI Desktop runs from <ComfyUI>/.venv
# (a uv venv whose home points at ../standalone-env), and that is where its packages
# must land - installing straight into standalone-env would leave ComfyUI unable to see
# them, same as using the system Python. System Python is opt-in only.
PYTHON=""
for CAND in \
    "$COMFYUI_DIR/venv/bin/python" \
    "$COMFYUI_DIR/.venv/bin/python" \
    "$BASE_DIR/venv/bin/python" \
    "$BASE_DIR/.venv/bin/python" \
    "$BASE_DIR/standalone-env/bin/python" \
    "$BASE_DIR/standalone-env/python" \
    "$COMFYUI_DIR/python_embeded/bin/python" \
    "$BASE_DIR/python_embeded/bin/python" ; do
    [ -x "$CAND" ] && { PYTHON="$CAND"; break; }
done
if [ -z "$PYTHON" ]; then
    SYS=""
    command -v python3 >/dev/null 2>&1 && SYS="python3"
    [ -z "$SYS" ] && command -v python >/dev/null 2>&1 && SYS="python"
    if [ -n "$SYS" ]; then
        echo
        echo "[WARNING] No ComfyUI Python environment found for:"
        echo "            $COMFYUI_DIR"
        echo "          Falling back to the system Python ($SYS) - dependencies would be"
        echo "          installed there, NOT into ComfyUI, and ComfyUI will not see them."
        echo "          Pass the correct ComfyUI folder as the first argument instead."
        echo
        printf "Continue with the system Python anyway? [y/N] "
        ANS=""
        read -r ANS || true
        case "$ANS" in
            [Yy]*) PYTHON="$SYS" ;;
            *)     echo "[INFO] Skipping all dependency installs - no ComfyUI Python to use." ;;
        esac
    fi
fi

if [ -z "$PYTHON" ]; then
    echo "[WARN] No Python to use - dependency installs will be skipped."
    echo "       Re-run with the ComfyUI folder as the first argument to install them."
else
    echo "[INFO] Python: $PYTHON  ($("$PYTHON" --version 2>&1))"
    # An outdated pip is the most common cause of "it only fails on my machine": it
    # predates current wheel tags and metadata, silently falls back to building from
    # source, and then dies for want of a compiler.
    echo "[PIP] Updating pip / setuptools / wheel..."
    "$PYTHON" -m pip install --upgrade pip --quiet \
        || echo "[WARN] Could not update pip - continuing with the installed version."
    "$PYTHON" -m pip install --upgrade setuptools wheel --quiet || true
    # wheel-stub (imported as wheel_stub) is a separate NVIDIA-published build backend -
    # unrelated to the ordinary "wheel" package. The RTX nodes' dependency declares it as
    # its build-backend, and pip does not always fetch a declared backend on its own,
    # which is what produces "Cannot import 'wheel_stub.buildapi'". Installing it up
    # front is the actual fix.
    "$PYTHON" -m pip install wheel-stub --quiet 2>/dev/null || true
    echo "[PIP] Done."
fi
echo

# Some packs (insightface, onnx, older RTX deps) drag numpy up or down. ComfyUI and a
# lot of nodes still want numpy 1.x - record what is here now and put it back at the end
# if something changed it.
NUMPY_BEFORE=""
[ -n "$PYTHON" ] && NUMPY_BEFORE="$("$PYTHON" -m pip show numpy 2>/dev/null | awk '/^Version:/{print $2}')"
echo

# -- repositories --------------------------------------------------------------
REPOS=(
    "https://github.com/ltdrdata/ComfyUI-Impact-Pack"
    "https://github.com/ltdrdata/ComfyUI-Impact-Subpack"
    "https://github.com/kijai/ComfyUI-KJNodes"
    "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler"
    "https://github.com/cubiq/ComfyUI_FaceAnalysis"
    "https://github.com/1038lab/ComfyUI-RMBG"
    "https://github.com/Fannovel16/comfyui_controlnet_aux"
    "https://github.com/city96/ComfyUI-GGUF"
    "https://github.com/facok/comfyui-krea2-controlnet"
    # Experimental - Krea2 IDENTITY / ControlNet(canny). May produce errors.
    "https://github.com/lbouaraba/comfyui-krea2edit"
    "https://github.com/Nynxz/ComfyUI-NK2E"
    # Experimental - MiniMax H3 ONE STUDIO (video). Optional accelerators/preview.
    "https://github.com/lihaoyun6/ComfyUI-MiniMaxH3-Cache"
    "https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo"
    "https://github.com/kijai/ComfyUI-SolAttn_triton"
    "https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI"
    # MiniMax H3 reference videos (VHS_LoadVideo) and the Spectrum accelerator
    "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite"
    "https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3"
    "https://github.com/duckyshell/ComfyUI-MiniMaxH3-FirstBlockCache"
    "https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes"
    "https://github.com/Saganaki22/ComfyUI-sol-attn"
    # Sibling pack - TJ_FreeTextEncoderVRAM, TJ_RTXDeblur, the H3 Audio Lock and One-Take
    # latent-continuation nodes, TJ_MultiImageLoader, and the LLM / vision utilities.
    "https://github.com/designloves2/ComfyUI-TJ_NODE"
)

# ComfyUI Manager names a folder after the pack's pyproject `name`, which is often not
# the repository name. Cloning under the repo name next to a Manager install would give
# two copies of the same nodes, registering every node twice and breaking the pack.
# These are the packs whose two names differ.
#
# A case statement rather than `declare -A`: associative arrays need bash 4, and macOS
# still ships bash 3.2.
alt_folder_for() {
    case "$1" in
        ComfyUI-SeedVR2_VideoUpscaler)     printf 'seedvr2_videoupscaler' ;;
        Nvidia_RTX_Nodes_ComfyUI)          printf 'comfyui_nvidia_rtx_nodes' ;;
        ComfyUI-MiniMaxH3-FirstBlockCache) printf 'minimax-h3-firstblockcache' ;;
        *) printf '' ;;
    esac
}

# Linux filesystems are case-sensitive, so a Manager install of "comfyui-kjnodes" does
# not match a clone of "ComfyUI-KJNodes" by name alone - compare case-insensitively.
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
find_existing() {
    local want alt d
    want="$(lower "$1")"; alt="$(lower "${2:-}")"
    for d in */ ; do
        d="${d%/}"
        [ "$(lower "$d")" = "$want" ] && { printf '%s' "$d"; return 0; }
        [ -n "$alt" ] && [ "$(lower "$d")" = "$alt" ] && { printf '%s' "$d"; return 0; }
    done
    return 1
}

# Requirements for one pack. Returns non-zero only when something the pack needs to load
# actually failed.
install_reqs() {
    local dir="$1" req="$dir/requirements.txt" filtered rc=0
    [ -z "$PYTHON" ] && return 0
    [ -f "$req" ] || return 0

    echo "[PIP] Checking requirements..."
    filtered="$(mktemp)"
    # dlib builds from source and needs cmake plus a C++ toolchain - the usual reason
    # this script "fails" for people. Swap it for the prebuilt wheel below.
    grep -vi '^dlib' "$req" > "$filtered" 2>/dev/null || true

    if [ -s "$filtered" ]; then
        if ! "$PYTHON" -m pip install -r "$filtered" --quiet; then
            # pip builds each package in an isolated environment that does NOT inherit
            # the build tools installed above, so a package needing wheel_stub fails
            # there even though it is present globally. Dropping the isolation lets it
            # use them - this is what makes the RTX nodes install.
            echo "[PIP] Retrying with --no-build-isolation..."
            "$PYTHON" -m pip install -r "$filtered" --no-build-isolation --quiet || rc=1
        fi
    fi
    rm -f "$filtered"

    if grep -qi '^dlib' "$req" 2>/dev/null; then
        echo "[PIP] Installing dlib (prebuilt wheel, no cmake needed)..."
        if ! "$PYTHON" -m pip install dlib-bin --quiet; then
            echo "[WARN] dlib skipped - face-analysis features needing it will not work."
            echo "       (Optional: install CMake + a C++ compiler, then: $PYTHON -m pip install dlib)"
        fi
    fi
    return $rc
}

TOTAL=${#REPOS[@]}
IDX=0
N_NEW=0; N_UPD=0; N_CUR=0; N_FAIL=0
FAILED=(); DEPWARN=()

for URL in "${REPOS[@]}"; do
    FOLDER="${URL##*/}"
    ALT="$(alt_folder_for "$FOLDER")"
    IDX=$((IDX+1))

    echo "--------------------------------------------------------"
    echo "[$IDX/$TOTAL] $FOLDER"

    if EXISTING="$(find_existing "$FOLDER" "$ALT")"; then
        # -- update ------------------------------------------------------------
        if [ -d "$EXISTING/.git" ]; then
            echo "[UPDATE] $EXISTING"
            BEFORE="$(git -C "$EXISTING" rev-parse --short HEAD 2>/dev/null || echo '?')"
            if git -C "$EXISTING" pull --ff-only 2>&1 | sed 's/^/         /'; then
                AFTER="$(git -C "$EXISTING" rev-parse --short HEAD 2>/dev/null || echo '?')"
                if [ "$BEFORE" = "$AFTER" ]; then
                    echo "[OK] Already up to date ($AFTER)."
                    N_CUR=$((N_CUR+1))
                else
                    echo "[OK] Updated $BEFORE -> $AFTER"
                    N_UPD=$((N_UPD+1))
                fi
            else
                echo "[WARN] Could not fast-forward (local edits, or a detached/pinned"
                echo "       version). Left untouched."
                N_CUR=$((N_CUR+1))
            fi
        else
            echo "[SKIP] Present as \"$EXISTING\" but not a git checkout - left untouched."
            N_CUR=$((N_CUR+1))
        fi
        install_reqs "$EXISTING" || DEPWARN+=("$EXISTING")
        echo
        continue
    fi

    # -- fresh install ---------------------------------------------------------
    echo "[INSTALL] Cloning $URL"
    if ! git clone --depth 1 "$URL" "$FOLDER"; then
        echo "[ERROR] git clone failed - check your connection, then re-run this script."
        FAILED+=("$FOLDER"); N_FAIL=$((N_FAIL+1))
        echo
        continue
    fi
    echo "[OK] Cloned."
    N_NEW=$((N_NEW+1))
    install_reqs "$FOLDER" || DEPWARN+=("$FOLDER")
    echo
done

echo "========================================================"
echo " Summary"
echo "========================================================"
echo "  newly installed : $N_NEW"
echo "  updated         : $N_UPD"
echo "  already current : $N_CUR"
echo "  failed          : $N_FAIL"
[ ${#FAILED[@]}  -gt 0 ] && printf '    - %s\n' "${FAILED[@]}"
if [ ${#DEPWARN[@]} -gt 0 ]; then
    echo "  dependency warnings (pack may not load):"
    printf '    - %s\n' "${DEPWARN[@]}"
fi

# Restore numpy if a pack moved it - ComfyUI and many nodes still need numpy 1.x.
if [ -n "$NUMPY_BEFORE" ] && [ -n "$PYTHON" ]; then
    NUMPY_AFTER="$("$PYTHON" -m pip show numpy 2>/dev/null | awk '/^Version:/{print $2}')"
    if [ -n "$NUMPY_AFTER" ] && [ "$NUMPY_AFTER" != "$NUMPY_BEFORE" ]; then
        echo
        echo "  [numpy] a dependency changed numpy $NUMPY_BEFORE -> $NUMPY_AFTER - restoring $NUMPY_BEFORE"
        "$PYTHON" -m pip install "numpy==$NUMPY_BEFORE" --quiet \
            || echo "  [numpy] could not restore automatically - run: $PYTHON -m pip install numpy==$NUMPY_BEFORE"
    fi
fi
echo
echo " Restart ComfyUI to load the changes."
echo "========================================================"
echo
echo " [Krea2 EXPERIMENTAL - IDENTITY / ControlNet depth&canny]"
echo " These are experimental and may produce errors."
echo " Place the LoRA files below into: models/loras/"
echo "   - IDENTITY : krea2_identity_edit_v1_2.safetensors"
echo "                https://huggingface.co/conradlocke/krea2-identity-edit"
echo "   - Depth    : depth control LoRA"
echo "                https://huggingface.co/Patil/Krea-2-depth-controlnet"
echo "   - Canny    : NK2E canny LoRA"
echo "                https://huggingface.co/nynxz/NK2E"
echo " Depth preprocessor (depth_anything_v2_vitl.pth) auto-downloads on first use"
echo " into: comfyui_controlnet_aux/ckpts/depth-anything/  (vitg/Giant NOT supported)"
echo " Register the LoRA FILES in Settings; adjust values in the side-menu panel."
echo "========================================================"
echo
echo " [MiniMax H3 ONE STUDIO - EXPERIMENTAL video node]"
echo " Models (https://huggingface.co/Comfy-Org/MiniMax-H3):"
echo "   models/diffusion_models/ : minimax_h3_fl2va_*  (text / first-last)"
echo "                              minimax_h3_ref2va_* (reference mode)"
echo "   models/text_encoders/    : qwen3vl_*_minimax_h3_*   (CLIPLoader type=minimax)"
echo "   models/vae/              : minimax_h3_video_vae_*  +  minimax_h3_audio_vae_*"
echo "   models/loras/            : minimax_h3 turbo LoRA (optional, for Turbo)"
echo " Select them once in the node's Settings > Models tab."
echo "========================================================"
