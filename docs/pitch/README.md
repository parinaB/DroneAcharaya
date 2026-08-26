# docs/pitch/

Presentation material for the SIH 2026 evaluation.

## Contents

| Item | File | Notes |
| --- | --- | --- |
| **Slide deck** | `slides.pdf` (+ source) | Export a PDF alongside the editable source — never rely on a cloud link opening on the day. |
| **Demo script** | `demo_script.md` | Exact click-by-click run order, expected on-screen result at each step, and the fallback if a step fails. Written so any team member can drive it. |
| **Backup video** | `backup_demo.mp4` — reference only | **Not committed** (large binary). Record it anyway: a captioned screen recording of the full happy path, so a failed live demo costs no marks. Keep the file on at least two USB drives and one cloud folder; record the exact locations and durations below. |

## Backup video reference

- Location(s): TODO
- Duration: TODO
- Last re-recorded: TODO
- Covers: TODO

## Talk track structure

1. Problem — what MALE UAV piston-engine failures cost.
2. Approach — physics twin + ML health layer, and why not ML alone.
3. Live demo — nominal run, injected fault, detection, RUL, advisory.
4. Results — detection latency and accuracy against baselines, honestly stated.
5. Roadmap — the path from demo to ground-station deployment.

## Rules

- Every number on a slide traces to a metric in `ml/evaluation/`. No unsourced
  figures.
- The gap list from `../ps_mapping.md` gets acknowledged, not hidden — judges
  find gaps faster than they find features.
