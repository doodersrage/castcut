"""ASF/AMC reading and forward kinematics on a tiny made-up skeleton.

    python3 -m unittest scripts/pose-refs/test_mocap.py
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mocap import UNIT_M, parse_amc, parse_asf_bones, pose_bones, rot_xyz  # noqa: E402

ASF = """
:version 1.10
:units
  length 0.45
  angle deg
:root
   order TX TY TZ RX RY RZ
   axis XYZ
   position 0 0 0
   orientation 0 0 0
:bonedata
  begin
     id 1
     name spine
     direction 0 1 0
     length 10
     axis 0 0 0 XYZ
     dof rx ry rz
  end
  begin
     id 2
     name arm
     direction 1 0 0
     length 5
     axis 0 0 0 XYZ
     dof rx ry rz
  end
:hierarchy
  begin
    root spine
    spine arm
  end
"""

AMC = """
:FULLY-SPECIFIED
:DEGREES
1
root 0 0 0 0 0 0
spine 0 0 0
arm 0 0 0
2
root 2 4 6 0 90 0
spine 0 0 0
arm 0 0 90
"""


class MocapTest(unittest.TestCase):
    def test_rotations_compose_x_then_y_then_z(self):
        r = rot_xyz(math.radians(90), 0, 0)
        np.testing.assert_allclose(r @ [0, 1, 0], [0, 0, 1], atol=1e-9)
        r = rot_xyz(0, 0, math.radians(90))
        np.testing.assert_allclose(r @ [1, 0, 0], [0, 1, 0], atol=1e-9)

    def test_parses_bones_hierarchy_and_frames(self):
        bones = parse_asf_bones(ASF)
        self.assertEqual(set(bones), {"root", "spine", "arm"})
        self.assertIs(bones["arm"].parent, bones["spine"])
        self.assertEqual(bones["spine"].dof, ["rx", "ry", "rz"])
        frames = parse_amc(Path(self._write(AMC)))
        self.assertEqual(len(frames), 2)
        self.assertEqual(frames[1]["root"], [2, 4, 6, 0, 90, 0])

    def test_forward_kinematics_places_bone_ends(self):
        bones = parse_asf_bones(ASF)
        frames = parse_amc(Path(self._write(AMC)))
        pose_bones(bones, frames[0])
        np.testing.assert_allclose(bones["spine"].coordinate, [0, 10 * UNIT_M, 0], atol=1e-9)
        np.testing.assert_allclose(bones["arm"].coordinate, [5 * UNIT_M, 10 * UNIT_M, 0], atol=1e-9)
        # Frame 2: the root turned 90° about Y (so +X points to −Z), the arm bent 90° about Z.
        pose_bones(bones, frames[1])
        root = np.array([2, 4, 6]) * UNIT_M
        np.testing.assert_allclose(bones["spine"].coordinate, root + [0, 10 * UNIT_M, 0], atol=1e-9)
        np.testing.assert_allclose(bones["arm"].coordinate, root + [0, 15 * UNIT_M, 0], atol=1e-9)

    def _write(self, text: str) -> str:
        import tempfile

        handle = tempfile.NamedTemporaryFile("w", suffix=".amc", delete=False)
        handle.write(text)
        handle.close()
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        return handle.name


if __name__ == "__main__":
    unittest.main()
