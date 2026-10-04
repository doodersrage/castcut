"""Per-person masks (people.py): a two-people mask split, a person found twice kept once, and a
read's joints checked against its own mask.

    python3 -m unittest scripts/pose-refs/test_people.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from people import mask_box, separate, support  # noqa: E402


def rect(x0: int, y0: int, x1: int, y1: int, shape=(200, 300)) -> np.ndarray:
    mask = np.zeros(shape, bool)
    mask[y0:y1, x0:x1] = True
    return mask


class SeparateTest(unittest.TestCase):
    def test_two_people_in_one_mask_are_split(self) -> None:
        left = rect(40, 20, 120, 190)
        right = rect(130, 25, 220, 190)
        both = left | right | rect(110, 60, 140, 100)  # an arm across
        masks = separate([both, left])
        self.assertEqual(len(masks), 2)
        boxes = sorted(mask_box(m) for m in masks)
        self.assertLess(boxes[0][2], 125)  # the left person, as found
        self.assertGreater(boxes[1][0], 115)  # what is left: the right person
        self.assertFalse((masks[0] & masks[1]).any())

    def test_a_person_found_twice_is_kept_once(self) -> None:
        a = rect(40, 20, 120, 190)
        b = rect(42, 22, 121, 190)
        self.assertEqual(len(separate([a, b])), 1)

    def test_a_small_mask_inside_a_person_is_not_a_second_person(self) -> None:
        body = rect(40, 20, 160, 190)
        bag = rect(60, 100, 80, 130)
        masks = separate([body, bag])
        # The body (minus the small mask) stays the big person; the small mask stays small, and
        # the harvester's size rules never take it for a second subject.
        self.assertEqual(len(masks), 2)
        self.assertGreater(masks[0].sum(), 10 * masks[1].sum())

    def test_support_counts_confident_joints_on_the_mask(self) -> None:
        mask = rect(0, 0, 100, 100)
        person = [(10.0, 10.0, 0.9), (50.0, 50.0, 0.9), (150.0, 50.0, 0.9), (150.0, 150.0, 0.1)]
        self.assertAlmostEqual(support(person, mask), 2 / 3)


if __name__ == "__main__":
    unittest.main()
