"""TJ Node ONE - flux2 klein One (TJ) + Z-Image ONE (TJ) combined package."""
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

try:
    from .dependency_check import check_dependencies
    check_dependencies()
except Exception:
    pass

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
