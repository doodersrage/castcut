"""Shared by the 3D lifter scripts: which clips train it and which evaluate it."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "public" / "pose-references.json"
TITLE = re.compile(r"CMU mocap subject (\d+) trial (\d+)")
FACING = re.compile(r"facing subject (\d+) trial (\d+)")
WITH = re.compile(r", with subject (\d+)")


def eval_clips() -> list[str]:
    """Every clip a shipped mocap reference comes from (held out of training)."""
    out: set[str] = set()
    for ref in json.loads(DATA.read_text())["references"]:
        if ref.get("source") != "cmu-mocap":
            continue
        title = ref["credit"]["title"]
        m = TITLE.match(title)
        if not m:
            continue
        trial = f"{int(m.group(1)):02d}_{int(m.group(2)):02d}"
        out.add(trial)
        f = FACING.search(title)
        if f:
            out.add(f"{int(f.group(1)):02d}_{int(f.group(2)):02d}")
        w = WITH.search(title)
        if w:
            out.add(f"{int(w.group(1)):02d}_{trial.split('_')[1]}")
    return sorted(out)


def training_clips(index: dict, per_subject: int) -> list[str]:
    """Up to `per_subject` clips per subject, spread over its trials, different motions first."""
    held = set(eval_clips())
    held_subjects = {t.split("_")[0] for t in held}
    by_subject: dict[str, list[str]] = {}
    for trial in sorted(index):
        if trial in held:
            continue
        by_subject.setdefault(trial.split("_")[0], []).append(trial)
    picked: list[str] = []
    for subject, trials in by_subject.items():
        # A subject the evaluation draws on is left out whole: the test is on people never seen.
        if subject in held_subjects:
            continue
        seen_words: set[str] = set()
        ranked: list[str] = []
        rest: list[str] = []
        step = max(1, len(trials) // max(1, per_subject))
        for trial in trials[::step] + trials:
            if trial in ranked or trial in rest:
                continue
            desc = (index[trial].get("desc") or "").lower()
            key = desc.split(" ")[0] if desc else trial
            (rest if key in seen_words else ranked).append(trial)
            seen_words.add(key)
        picked += (ranked + rest)[:per_subject]
    return picked


# Motions rare in the clips picked per subject (lying, sitting, floor work): fetched on top, from
# any subject — the people the evaluation draws on too, never its own clips.
POSTURE_WORDS = re.compile(
    r"\b(sit|sits|sitting|seat|chair|stool|bench|lie|lies|lying|laying|lay|floor|get up|getting up|"
    r"crawl|kneel|roll|sleep|bed|lounge|recline|yoga|stretch|push ?up|squat)",
    re.I,
)


def posture_clips(index: dict, already: set[str]) -> list[str]:
    held = set(eval_clips())
    return [
        trial for trial, info in sorted(index.items())
        if trial not in held and trial not in already and POSTURE_WORDS.search((info.get("desc") or "") + " ")
    ]
