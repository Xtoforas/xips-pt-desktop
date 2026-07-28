# xips-pt-desktop

Desktop companion app for `xips-pt`.

This project is a Tauri + React desktop uploader for OOTP Perfect Team CSV files. It connects to an `xips-pt` server, signs in with the same Discord-backed identity as the website, watches local folders for new CSV exports, helps map tournament stats exports to formats, and uploads files through the server's `/api/v1` endpoints.

## Install (End Users)

Download the installer from the [latest GitHub release](https://github.com/Xtoforas/xips-pt-desktop/releases/latest):

- **Windows**: `*-setup.exe` (NSIS installer, recommended) or the `.msi`
- **macOS**: `.dmg`
- **Linux**: `.AppImage`, `.deb`, or `.rpm`

Once installed, the app checks for updates on launch and shows a prompt when a new version is available — click **Install and restart** and it updates itself. No Git, Node, or Rust toolchain is required.

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

## Releases & Auto-Update

Pushing a tag matching `v*` (for example `v0.1.2`) runs `.github/workflows/build-desktop.yml`, which builds signed bundles for Windows, macOS, and Linux, publishes them to a GitHub Release for that tag, and generates a `latest.json` updater manifest. Installed apps poll `releases/latest/download/latest.json` on launch via `tauri-plugin-updater` and offer to install the new version.

To cut a release:

1. Bump the version in `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`, and `apps/desktop/src-tauri/tauri.conf.json` (keep them identical).
2. Commit, then tag and push: `git tag v0.1.2 && git push origin v0.1.2`.

### Required repository secrets

Update bundles are signed with the Tauri updater key. The public key lives in `tauri.conf.json`; the private key must **never** be committed. Configure these in the repo's **Settings → Secrets and variables → Actions**:

- `TAURI_SIGNING_PRIVATE_KEY` (required): contents of the updater private key file generated with `npx tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (only if the key was generated with a password)

Without `TAURI_SIGNING_PRIVATE_KEY`, tagged release builds fail on purpose — unsigned updates would be rejected by installed apps. If the keypair is ever regenerated, the new public key must be put in `tauri.conf.json` and shipped in a release signed by the **old** key first, or existing installs will refuse the update.

## Windows Helper Script (Developer Fallback)

End users should install from a GitHub Release instead (see above). For developers who want a one-click build-from-source flow on Windows — pull the latest code, install dependencies, build, and launch — run:

```bat
run-xips-pt-desktop-windows.bat
```

Run it from Windows, not WSL. The script expects these tools to already be installed and available on `PATH`:

- Git
- Node.js with `npm` and `npx`
- Rust with the Windows MSVC toolchain

The script uses `git pull --ff-only`, `npm install`, and `npx tauri build`, then launches the built desktop executable from `apps\desktop\src-tauri\target\release`.
