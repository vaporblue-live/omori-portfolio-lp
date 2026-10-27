# Archive: award-night stage (v1)

Saved on 2026-10-27 before the design direction changed to follow the
owner's portfolio. Nothing here is served by the live site.

## How to restore

- Whole site as published: `git checkout archive/award-stage-v1-site`
  (tag on the commit that was live), or merge branch `redesign-award-stage`.
- This branch adds the working materials under `_archive/`.

## Contents

| Folder | What it holds |
|--------|---------------|
| `storyboard/` | Storyboard HTML (CSS + WebGL curtain and glass), render script, rendered frames |
| `docs/` | Requirements and design spec v2 (Markdown) |
| `reference/` | Reference motion contact sheet and thumbnails of the curtain and glass references |
| `screens/` | Screenshots of the implemented site (desktop and mobile) |

The storyboard expects `three.module.min.js` beside it; copy it from
`vendor/three/` and serve the folder over HTTP to re-render.
