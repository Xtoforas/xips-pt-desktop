# xips-pt-desktop

Desktop companion app for `xips-pt`.

This project is a Tauri + React desktop uploader for OOTP Perfect Team CSV files. It connects to an `xips-pt` server, signs in with the same Discord-backed identity as the website, watches local folders for new CSV exports, helps map tournament stats exports to formats, and uploads files through the server's `/api/v1` endpoints.

## What It Does

- connects to a configured `xips-pt` server
- signs in through the current desktop exchange flow
- watches CSV folders on the native side
- detects `stats_export` and `card_catalog` files
- assigns tournament formats to stats exports
- preflights duplicate uploads
- uploads files and polls server lifecycle state
- shows queue state, retries, diagnostics, and recent history

## Stack

- Tauri 2
- React + TypeScript + Vite
- Mantine
- Rust native services for auth, file watching, queue orchestration, and API access
- SQLite for local desktop state

## Workspace Layout

- `apps/desktop`: desktop renderer and Tauri app
- `packages/api-contract`: shared contract types used by the renderer
- `examples`: sample CSV files used to shape detection behavior
- `research.md`: backend research on the sibling `xips-pt` repo
- `plan.md`: implementation plan and progress tracker

## Development

Install dependencies:

```bash
npm install
```

Run frontend checks:

```bash
npm run typecheck
npm test
npm run build
```

Run the desktop app in development:

```bash
cd apps/desktop
npx tauri dev
```

`npx tauri dev` starts the Vite dev server automatically through the Tauri config.

Run native Rust tests:

```bash
source "$HOME/.cargo/env"
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Build

For production desktop bundles:

```bash
cd apps/desktop
npx tauri build
```

`npx tauri build` rebuilds the React frontend before packaging the desktop app, so you do not need to run a separate Vite build first.

Windows builds should be done with the Windows toolchain, not Linux Tauri tooling inside WSL.

## Windows Helper Script

If you want a one-click Windows flow that pulls the latest code, installs dependencies, builds the desktop app, and launches it, run:

```bat
run-xips-pt-desktop-windows.bat
```

Run it from Windows, not WSL. The script expects these tools to already be installed and available on `PATH`:

- Git
- Node.js with `npm` and `npx`
- Rust with the Windows MSVC toolchain

The script uses `git pull --ff-only`, `npm install`, and `npx tauri build`, then launches the built desktop executable from `apps\desktop\src-tauri\target\release`.
