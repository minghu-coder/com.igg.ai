# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**com.igg.ai** is an early-stage AI chat assistant (full-stack web app). The product itself is not scaffolded yet — no package.json, build config, or framework exists. The only runnable code is the **Mario Bros demo** in `mario/index.html`. README.md and AGENTS.md document the planned product intent.

## Running the Mario Demo

Zero dependencies, no build step. The game is a single self-contained HTML file.

- **Open directly**: double-click `mario/index.html` or open it in a browser.
- **Serve it** (recommended if you touch the file — the browser will cache less): `python -m http.server` from the repo root, then visit `http://localhost:8000/mario/`.

Controls: Arrow keys / WASD to move, Space / Up / W to jump, Enter to start or replay.

## Mario Demo Architecture

`mario/index.html` is a hand-rolled canvas platformer (≈620 lines). Structure:

- **Level** is a 2D grid (`VIEW_H`=15 rows × `LEVEL_W`=120 cols of 32px tiles), built by `buildLevel()`. Tile codes: 1=brick, 2=question block, 3=used block, 4–7=pipe pieces, 8/9=flag/pole base. `SOLID` is the set of collidable codes. Ground, pipes, question blocks, coins, enemies, and the flag are all placed in code.
- **Game loop**: `requestAnimationFrame` drives `frame()`, which runs a **fixed 60Hz timestep** (`STEP = 1/60`) by accumulating delta time and calling `update()` a whole number of times, then `render()` once. Game speed is decoupled from display refresh.
- **Physics** (`update()`): axis-separated tile collision for player and enemies. Mario runs on coyote time + jump buffering. Enemies (Goombas) patrol, turn at walls/edges, can be stomped (via `prevBottom` check), and kill Mario otherwise.
- **Rendering**: pixel-art sprites are ASCII string maps (`MARIO`, `GOOMBA`) rendered pixel-by-pixel through `px()` at 2× scale. `ctx.imageSmoothingEnabled = false` for crisp pixels. Camera (`camX`) follows the player with parallax clouds/hills.
- **Sound**: procedural SFX via `WebAudio` oscillators (`sfx()` + helpers), no audio assets.
- **State machine**: `state` is `ready` → `playing` → `won` / `over`. `startGame()` / `resetLevel()` / `hurtPlayer()` transition between them.

## Environment

- Windows, Git Bash shell (`/d/...` paths).
- Git worktrees are used (e.g. `feature/initial-setup` under `.worktrees/`, which is gitignored) — keep `.worktrees/` out of commits.
