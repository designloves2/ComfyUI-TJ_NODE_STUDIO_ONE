# SPDX-License-Identifier: GPL-3.0-only
# Derived from LTX-2.5-Director by CGlide (GPL-3.0), a fork of WhatDreamsCost's LTX Director (GPL-3.0). See ../../LICENSE.
from comfy_api.latest import ComfyExtension, io
from typing_extensions import override

from .ltx_director import LTXDirector
from .ltx_director_guide import LTXDirectorGuide, LTXDirectorCropGuides
from .latent_slice import CleanLatentSlice
from .ltx_chunk_writer import LTXChunkWriter, LTXChunkAssembler


class LTX25DirectorExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [LTXDirector]


NODE_CLASS_MAPPINGS = {
    "LTXDirectorTJ25": LTXDirector,
    "LTXDirectorGuideTJ25": LTXDirectorGuide,
    "LTXDirectorCropGuidesTJ25": LTXDirectorCropGuides,
    "CleanLatentSliceTJ25": CleanLatentSlice,
    "LTXChunkWriterTJ25": LTXChunkWriter,
    "LTXChunkAssemblerTJ25": LTXChunkAssembler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LTXDirectorTJ25": "LTX Director (TJ 2.5)",
    "LTXDirectorGuideTJ25": "LTX Director Guide (TJ 2.5)",
    "LTXDirectorCropGuidesTJ25": "LTX Director Crop Guides (TJ 2.5)",
    "CleanLatentSliceTJ25": "Clean Latent Slice (TJ 2.5)",
    "LTXChunkWriterTJ25": "LTX Chunk Writer (TJ 2.5)",
    "LTXChunkAssemblerTJ25": "LTX Chunk Assembler (TJ 2.5)",
}
