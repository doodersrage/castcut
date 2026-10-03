"""
ComfyUI entry point for when this whole repository is cloned into ComfyUI/custom_nodes/ (e.g.
ComfyUI-Manager "Install via Git URL"): loads the Castcut node pack from comfyui-nodes/castcut/.
Nothing else in the repository is Python; see comfyui-nodes/castcut/README.md.
"""

import importlib.util as _util
import os as _os

_spec = _util.spec_from_file_location(
    "castcut_nodes",
    _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "comfyui-nodes", "castcut", "castcut_nodes.py"),
)
_module = _util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

NODE_CLASS_MAPPINGS = _module.NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS = _module.NODE_DISPLAY_NAME_MAPPINGS

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
