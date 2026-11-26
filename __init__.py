"""TJ Node ONE - flux2 klein One (TJ) + Z-Image ONE (TJ) combined package."""
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .vertex_studio_backend import NODE_CLASS_MAPPINGS as _VX_NODES, NODE_DISPLAY_NAME_MAPPINGS as _VX_NAMES

NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **_VX_NODES}
NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **_VX_NAMES}

WEB_DIRECTORY = "./web"

from .ltx25_studio_backend.director import LTX25DirectorExtension


async def comfy_entrypoint() -> LTX25DirectorExtension:
    return LTX25DirectorExtension()

try:
    from .dependency_check import check_dependencies
    check_dependencies()
except Exception:
    pass

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
