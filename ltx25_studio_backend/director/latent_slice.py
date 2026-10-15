# SPDX-License-Identifier: GPL-3.0-only
# Derived from LTX-2.5-Director by CGlide (https://github.com/CGlide/LTX-2.5-Director, GPL-3.0),
# itself a fork of WhatDreamsCost's LTX Director (https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI, GPL-3.0).
# Modified for TJ NODE STUDIO ONE: node keys CS25 -> TJ25, routes /ltx_director* -> /ltx25_one/director/*, upload folder renamed.
# GPL-3.0 only: do NOT copy this file into the web project (see PORT_LEDGER).
# --- START OF FILE latent_slice.py ---

import torch

class CleanLatentSlice:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "latent": ("LATENT",),
                "start": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1, "tooltip": "The starting frame index to slice from (plug 'latent_start_index' here)."}),
                "length": ("INT", {"default": 1, "min": 1, "max": 100000, "step": 1, "tooltip": "The number of frames to keep (plug 'clean_latent_frames' here)."}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)
    FUNCTION = "slice_latent"
    CATEGORY = "WhatDreamsCost CS 2.5"
    DESCRIPTION = "Safely slices a video latent starting from an offset index for a specific length. Uses torch.narrow to bypass PyTorch NestedTensor slicing bugs."

    def slice_latent(self, latent, start, length):
        new_latent = latent.copy()
        
        def safe_slice(tensor, target_start, target_len):
            dims = tensor.ndim if hasattr(tensor, "ndim") else len(tensor.shape)
            
            # Constrain starting index and length to the actual size of the tensor
            max_size = tensor.size(2) if dims == 5 else tensor.size(0)
            actual_start = min(target_start, max_size - 1) if max_size > 0 else 0
            actual_len = min(target_len, max_size - actual_start)
            
            try:
                # torch.narrow is the safest low-level C++ slice method to bypass NestedTensor bugs
                if dims == 5:
                    # [Batch, Channels, Frames, Height, Width] -> Slice dimension 2
                    return torch.narrow(tensor, 2, actual_start, actual_len)
                elif dims == 4:
                    # [Frames, Channels, Height, Width] -> Slice dimension 0
                    return torch.narrow(tensor, 0, actual_start, actual_len)
                elif dims == 3:
                    # [Frames, Height, Width] -> Slice dimension 0
                    return torch.narrow(tensor, 0, actual_start, actual_len)
            except Exception as e:
                # Fallback if narrow fails
                if dims == 5:
                    return tensor[:, :, actual_start : actual_start + actual_len]
                elif dims == 4:
                    return tensor[actual_start : actual_start + actual_len]
                elif dims == 3:
                    return tensor[actual_start : actual_start + actual_len]
                    
            return tensor

        # Safely slice video samples
        if "samples" in new_latent:
            new_latent["samples"] = safe_slice(new_latent["samples"], start, length)

        # Safely slice video noise mask (if it exists)
        if "noise_mask" in new_latent:
            new_latent["noise_mask"] = safe_slice(new_latent["noise_mask"], start, length)

        return (new_latent,)


# Register the node with ComfyUI
NODE_CLASS_MAPPINGS = {
    "CleanLatentSliceTJ25": CleanLatentSlice
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CleanLatentSliceTJ25": "Clean Latent Slice CS (2.5)"
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']