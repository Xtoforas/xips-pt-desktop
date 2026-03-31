# xips-pt-desktop Implementation Plan

This plan is based on the current `~/git/xips-pt` backend as it exists today.

## Current maintenance

- [x] Stop regenerated watch-folder CSVs from reusing a previous format or tournament assignment when the source file timestamp changes.
- [x] Validate tournament-format mapping against the server-provided teams-per-tournament count before auto-assigning or accepting a format on the desktop client.
- [x] Treat a regenerated watch-folder CSV with a new checksum as a new file instance even if the source timestamp granularity makes the modified time look unchanged.
- [x] Stop generic OOTP stats-export filenames from auto-applying saved filename format rules when the filename itself does not identify the tournament.
- [x] Simplify the upload queue page filters to `All`, `Queued`, and `Uploaded`, with queued covering files still waiting on local assignment or upload progress.
- [x] Add queue-row checkbox multi-select plus a select-all control so removable queue entries can be dismissed in bulk from the upload queue page.

Desktop-relevant backend capabilities now available on the stable API surface:

- `GET /api/v1/me`
- `POST /api/v1/auth/desktop/exchange`
- `POST /api/v1/auth/logout`
- `GET /api/v1/formats`
- `POST /api/v1/my/uploads`
- `GET /api/v1/my/uploads`
- `GET /api/v1/my/uploads/:uploadId`
- `POST /api/v1/my/uploads/check-duplicate`
- `GET /api/v1/cards`
- `GET /api/v1/my/agg`
- public analytics endpoints under `/api/v1/global/*`

Important current backend realities:

- private APIs accept either `xips_session` or bearer auth
- desktop bearer tokens are available now, but token minting still starts from a real authenticated website session
- supported upload kinds are `stats_export` and `card_catalog`
- tournament `stats_export` uploads require `formatId`
- upload lifecycle phases are now rich enough for polling UX
- server-side queue retry counts and queue position are still not exposed to user endpoints

This plan excludes privileged desktop functionality.

## Goals

Build a brand-new desktop companion app that:

- runs on Windows and macOS
- connects to a user-selected `xips-pt` server
- uses stable `/api/v1` APIs
- uses the same Discord-backed identity as the website
- monitors a configured CSV directory for new files
- lets the user associate detected CSVs with tournament formats
- uploads CSVs to the correct tournament
- shows local upload progress plus server lifecycle state and errors
- avoids duplicate uploads where possible

## Recommended desktop framework and why

Recommended framework:

- `Tauri 2 + React + TypeScript + Vite`

### Why Tauri is the right default

The backend now has the key pieces Tauri needs:

- native bearer-token auth exists
- `/api/v1/me` exists
- per-upload detail polling exists
- duplicate preflight exists

That changes the tradeoff substantially. The desktop app only needs a webview for login and token exchange. After that, it can behave like a normal native app.

Tauri is the best fit now because it gives us:

- smaller bundles and lower memory use on Windows and macOS
- a clean native place to run filesystem watching and background upload orchestration
- a safer architecture where the renderer does not need direct access to auth secrets
- a strong path to keep API calls on the native side with bearer auth

### Recommended desktop split

- renderer:
  - React UI
  - settings
  - upload review and status
  - logs and diagnostics views
- native side:
  - auth orchestration
  - secure token storage
  - API client
  - file watching
  - local queue
  - retry logic
  - background polling

## UX alignment with the website app

The desktop app should have the same overall look and feel as the current `xips-pt` website app.

That means the desktop UI should intentionally follow the existing frontend's visual and interaction patterns:

- Mantine 8 component patterns
- IBM Plex Sans as the primary UI font
- dark graphite and navy surfaces
- orange Mantine primary actions
- blue selection and focus accents
- teal and green success states
- compact spacing
- bordered cards and panels instead of floating glassy surfaces
- dense tables with practical filters, badges, and status rows
- operational language and desktop-utility framing instead of consumer SaaS copy

### Desktop UX rules

- use a persistent left navigation rail similar to the website shell
- use a compact top bar with auth, server, and background-status context
- prefer cards, tables, badges, alerts, and split panes over wizard-heavy flows
- keep labels short, technical, and descriptive
- use monospace styling for upload IDs, checksums, request IDs, and filesystem paths
- make queue states, auth states, and errors visible without opening deep modal flows
- keep the primary upload queue view dense and scannable, closer to the website's analytics tables than a mobile-first card list

### Shared visual tokens to preserve

- font family: `IBM Plex Sans, Trebuchet MS, sans-serif`
- dark page background and darker panel surfaces
- visible borders on cards and tables
- subtle radius, generally `8px` to `14px`
- uppercase small labels for metadata and filter controls
- badge-based state communication

### UX implementation implications

- create a desktop Mantine theme that matches the website theme choices
- reuse the website's spacing, border, and typography decisions where reasonable
- treat the website app as the visual source of truth for shells, cards, tables, badges, alerts, and filter rows
- avoid introducing a separate consumer-style design language for desktop

## Initial repo and bootstrap structure

Recommended starting layout:

```text
xips-pt-desktop/
  apps/
    desktop/
      package.json
      index.html
      src/
        main.tsx
        app/
          routes/
          components/
          state/
          hooks/
          styles/
      src-tauri/
        Cargo.toml
        tauri.conf.json
        src/
          main.rs
          app_state.rs
          commands/
            auth.rs
            config.rs
            uploads.rs
            diagnostics.rs
          services/
            api_client.rs
            auth_flow.rs
            file_watcher.rs
            upload_queue.rs
            poller.rs
            hashing.rs
            storage.rs
            logs.rs
          models/
            api.rs
            local_state.rs
            config.rs
          db/
            mod.rs
            migrations/
  packages/
    api-contract/
      src/
        index.ts
        types.ts
        zod.ts
    fixtures/
      stats_export/
      card_catalog/
  docs/
  package.json
  tsconfig.json
```

### Structure rationale

`apps/desktop/src`

- UI-only React application
- no direct token handling

`apps/desktop/src-tauri`

- native shell and long-running services
- source of truth for queue, watcher, and API communication

`packages/api-contract`

- shared TypeScript types for renderer state and test fixtures
- mirrors actual `/api/v1` response shapes

`packages/fixtures`

- realistic CSV fixtures for tests and local development

## API integration layer

The desktop app should treat `/api/v1` as the stable contract and keep all network I/O on the native side.

### Recommended API client design

Use a Rust `reqwest` client behind Tauri commands/events.

Why:

- bearer tokens stay out of the renderer
- no CORS dependence
- upload and polling logic can run while the window is hidden
- easier structured logging with request IDs

### API modules to build

- `ServerProfileClient`
  - normalize base URL
  - `GET /health`
- `AuthClient`
  - `GET /api/v1/me`
  - `POST /api/v1/auth/logout`
- `FormatsClient`
  - `GET /api/v1/formats?gameVersion=ootp27`
- `UploadsClient`
  - `POST /api/v1/my/uploads/check-duplicate`
  - `POST /api/v1/my/uploads`
  - `GET /api/v1/my/uploads`
  - `GET /api/v1/my/uploads/:uploadId`
- `CardsClient`
  - `GET /api/v1/cards`
- `MyAggClient`
  - `GET /api/v1/my/agg`

### API behavior rules

- always call `/api/v1`
- always send bearer auth from native code after token exchange
- treat `401 authentication_required` as a session-expired state and pause authenticated queue work
- treat `429 rate_limited` as a global backoff signal
- capture `x-request-id` for every nontrivial API call and include it in local logs
- default `gameVersion` to `ootp27`

### Contract notes to encode in the client

- upload file kinds are only:
  - `stats_export`
  - `card_catalog`
- tournament stats exports require `formatId`
- upload lifecycle phases are:
  - `queued`
  - `processing`
  - `refresh_pending`
  - `refreshing`
  - `complete`
  - `failed`
  - `skipped_duplicate`
- `complete` is the only server state that means end-to-end ingest plus refresh finished

## Authentication approach compatible with the current website and backend

The current backend supports native auth, but the token exchange still starts from a real website session.

### Recommended v1 auth flow

1. User enters or selects a server base URL.
2. App opens a dedicated Tauri auth window pointed at:
   - `${baseUrl}/api/auth/login/discord`
3. User completes the normal Discord website login flow.
4. When the auth window has a valid `xips_session`, that same window performs:
   - `POST ${baseUrl}/api/v1/auth/desktop/exchange`
5. The auth window sends the returned `accessToken`, `expiresAt`, and `user` back to native code.
6. Native code stores the bearer token securely and immediately validates it with:
   - `GET /api/v1/me`
7. All normal private API traffic uses bearer auth from native code.

### Why this is the right fit for the current backend

This flow matches what `xips-pt` actually supports now:

- the website remains the source of Discord identity
- the backend can mint a native token from a cookie-backed web session
- the desktop app no longer needs to reuse cookies for normal operation

### Secure storage

Store auth data in two places:

- OS keychain for the bearer token
- local SQLite metadata for:
  - server profile
  - token expiry
  - user summary
  - last successful auth check

Do not store bearer tokens in plain JSON config or the renderer state.

### Auth UX requirements

- explicit server selector
- explicit "Sign in with Discord" action
- show signed-in user identity from `/api/v1/me`
- show token expiry date using `expiresAt` from exchange
- show re-auth required state when `/api/v1/me` returns `401`

### Logout behavior

Desktop logout should do both of these:

1. call `POST /api/v1/auth/logout` with the bearer token
2. delete the bearer token from secure storage

Optional follow-up for a fuller sign-out:

- clear the auth webview's cookies
- optionally hit the frontend logout route:
  - `DELETE /api/session`

### Remaining auth gap

The backend still does not have a browser-to-desktop pairing flow or a token refresh endpoint. That means:

- v1 desktop auth should use a dedicated auth webview
- expiry or revocation requires another exchange flow

## Required backend changes in xips-pt

Implementation can begin now. The current backend is sufficient for a real v1 uploader.

The remaining backend work is about polish, not basic feasibility.

### Strongly recommended next backend change

Add a browser-to-desktop pairing flow so Tauri does not need to host the session-bearing webview that performs token minting.

A good shape would be something like:

- `POST /api/v1/auth/desktop/pair/start`
- `POST /api/v1/auth/desktop/pair/complete`

or an equivalent short-code / local-callback flow.

Why it matters:

- cleaner native login UX
- easier support for system-browser login
- less desktop complexity around auth-window lifecycle

### Recommended backend additions for better desktop status UX

If the product wants exact server retry state, queue status, or ETA in the desktop UI, the backend still needs one of these:

- extend `GET /api/v1/my/uploads/:uploadId`
- or add a dedicated status route

Missing user-visible fields today:

- queue attempt count
- max retry count
- queue position
- next retry time
- current queue job ID

Without those fields, the desktop app can show truthful lifecycle phase, but not exact backend retry progress.

### Recommended backend additions for token lifecycle

The current token flow is issue-or-revoke only.

Useful follow-up endpoints would be:

- `POST /api/v1/auth/desktop/refresh`
- `GET /api/v1/auth/desktop/sessions`
- `DELETE /api/v1/auth/desktop/sessions/:id`

These are not blockers for v1.

## Local file watcher design

The watcher should run on the native side, not in the renderer.

### Technology choice

Use Rust `notify` for cross-platform filesystem watching.

Why:

- better fit for background operation
- avoids renderer lifetime issues
- easier debounce and file-stability checks

### Watch scope

Start with:

- one or more user-configured directories
- recursive watch optional, default off
- only `.csv` files

### Stability rules before a file is eligible

When a new CSV appears:

1. wait for a short debounce window
2. read file size and mtime
3. re-check after a stability interval
4. only queue the file when size and mtime have stopped changing

Ignore patterns in v1:

- dotfiles
- temp files
- files ending in partial-download suffixes

### Local file classification

Each stable file should be:

1. hashed with SHA-256
2. parsed for its header row
3. classified into:
   - `stats_export`
   - `card_catalog`
   - unsupported

Classification should be local so the app can:

- route card catalogs automatically
- hold tournament stats exports for format assignment when needed

### Tournament-format association

For `stats_export`, the app needs a `formatId` before upload.

Support both:

- manual assignment
- saved matching rules

Suggested rule inputs:

- watch-folder to format mapping
- filename pattern to format mapping
- last-used format in a folder

If no confident match exists:

- file enters `awaiting_format_assignment`
- app prompts the user instead of uploading blindly

## Local queue and persistence design

Use SQLite as the desktop app's local source of truth.

Why:

- durable across restarts
- easy to inspect for support/debugging
- enough structure for queue state machines and dedupe memory

### Keep tokens out of SQLite

Store only metadata in SQLite:

- `server_profiles`
- `auth_state`
- `watch_roots`
- `format_rules`
- `detected_files`
- `upload_jobs`
- `upload_attempts`
- `diagnostic_events`

Store the bearer token itself in OS-secure storage.

### Recommended local upload state machine

- `detected`
- `awaiting_file_stability`
- `awaiting_format_assignment`
- `queued_local`
- `duplicate_skipped_local`
- `uploading`
- `uploaded_waiting_server`
- `server_queued`
- `server_processing`
- `server_refresh_pending`
- `server_refreshing`
- `complete`
- `failed_retryable`
- `failed_terminal`
- `auth_blocked`

### Local dedupe memory

Persist file identity fields:

- absolute path
- size
- mtime
- SHA-256 checksum
- last known upload ID
- last known format assignment

This lets the app avoid reprocessing the same local file repeatedly across restarts.

## Upload and retry workflow

### End-to-end upload path

1. Watcher detects a stable CSV.
2. App computes SHA-256 and classifies the file.
3. If file is `stats_export`, app resolves `formatId`.
4. App calls:
   - `POST /api/v1/my/uploads/check-duplicate`
5. If duplicate is confirmed:
   - mark locally as `duplicate_skipped_local`
   - store returned `uploadId` and reason
6. If not duplicate:
   - read file as UTF-8 text
   - enforce the 15 MB server payload guard locally
   - call `POST /api/v1/my/uploads`
7. Save returned:
   - `uploadId`
   - `status`
   - `checksum`
8. Begin polling:
   - `GET /api/v1/my/uploads/:uploadId`
9. Advance local state from returned lifecycle fields until terminal state.

### Polling strategy

Use staged polling intervals:

- fast polling right after upload acceptance
- slower polling once the upload is clearly queued or processing
- stop polling on terminal states

Recommended schedule:

- first minute: every 3 seconds
- next few minutes: every 5 to 10 seconds
- long-running tail: every 15 to 30 seconds

Stop polling when lifecycle is:

- `complete`
- `failed`
- `skipped_duplicate`

### Error handling rules

`401`

- move all authenticated work to `auth_blocked`
- stop sending private API calls
- prompt re-auth

`429`

- apply a queue-wide backoff
- retry later with jitter

network failure

- keep job local
- retry with exponential backoff

server `failed`

- surface server error text to the user
- allow manual retry from the desktop queue

### What "retry state" can mean in v1

The backend retries parse jobs internally, but does not expose retry counts to user endpoints.

So the desktop app should distinguish:

- local retries
  - fully known and displayable
- server lifecycle state
  - known through upload lifecycle polling

It should not pretend to know exact backend retry count until the API exposes it.

## Background operation behavior

Watcher, queue, and poller should continue running when the main window is hidden.

### Recommended behavior

- single-instance app lock
- optional launch at login
- close-to-tray or close-to-background behavior
- clear in-app indication when background watching is active

### Native services that should outlive the renderer

- filesystem watcher
- upload dispatcher
- polling coordinator
- retry scheduler
- auth/session monitor

### Offline behavior

When the server is unreachable:

- continue watching files
- queue work locally
- surface offline banner in UI
- resume uploads when connectivity returns

## Logging and diagnostics

The app should produce structured local logs from day one.

### Log categories

- auth
- watcher
- queue
- uploads
- polling
- API
- storage

### Data to include

- timestamp
- server profile
- local job ID
- remote upload ID
- lifecycle state
- `x-request-id` when present
- error category

### Support tooling

Add a diagnostics screen that can:

- show current auth state
- show current watch roots
- show queued jobs
- show recent API failures
- export a redacted diagnostics bundle

Redact:

- bearer tokens
- raw file contents
- Discord identifiers only if product policy requires it

## Packaging, signing, and release considerations for Windows and macOS

### Windows

Ship a signed installer.

Recommended first target:

- signed MSI

Why:

- predictable install/uninstall story
- works well for business users
- straightforward support flow

### macOS

Ship a signed and notarized app bundle.

Recommended first target:

- signed `.dmg` containing the app bundle

Requirements:

- Apple Developer ID Application signing
- hardened runtime
- notarization

### Auto-update

Do not make auto-update a Phase 1 requirement.

Recommended sequence:

1. stable manual installs first
2. signing and notarization pipeline next
3. auto-update after release confidence is established

## Testing strategy

### Rust/native tests

Add unit tests for:

- file stability detection
- checksum generation
- format rule resolution
- queue state transitions
- auth-state transitions
- polling reducer logic

### Renderer tests

Add component tests for:

- auth screens
- format-assignment flows
- queue rows and lifecycle badges
- diagnostics views

### Contract and integration tests

Run integration tests against a real local `xips-pt` environment.

Core scenarios:

- login window completes token exchange
- `/api/v1/me` succeeds with stored bearer token
- format discovery returns usable rows
- duplicate preflight skips a duplicate tournament upload
- upload creation returns `uploadId`
- upload detail polling reaches `complete`
- upload detail polling reaches `failed`
- bearer logout revokes further private API access

### Fixture coverage

Keep realistic fixture sets for:

- valid `stats_export`
- valid `card_catalog`
- malformed CSV
- oversized CSV
- duplicate content

## Phased delivery plan

### Phase 0: repo bootstrap and contract freeze

- create the Tauri workspace and CI skeleton
- define local SQLite schema
- define the `/api/v1` contract types used by the app
- add fixture CSVs
- add a minimal diagnostics log pipeline

Exit criteria:

- app boots on Windows and macOS
- server profile can be created
- `GET /health` works

### Phase 1: auth and session plumbing

- build the Tauri auth window
- complete desktop token exchange
- store token securely
- validate auth with `/api/v1/me`
- implement logout and token clearing

Exit criteria:

- user can sign in against a real server
- app shows authenticated identity
- private API calls work with bearer auth

### Phase 2: format discovery and local watcher

- implement watch-root configuration
- implement stable-file detection
- classify CSVs locally
- fetch and cache `/api/v1/formats`
- build manual format-assignment UI and saved rules

Exit criteria:

- app detects files reliably
- tournament files can be assigned a valid `formatId`

### Phase 3: upload queue and polling UX

- implement duplicate preflight
- implement upload creation
- implement per-upload polling
- map server lifecycle to local UI states
- implement local retry and backoff behavior

Exit criteria:

- app can upload real files end to end
- app shows truthful server lifecycle states
- duplicate uploads are avoided in normal cases

### Phase 4: background hardening and diagnostics

- keep watcher and queue active in background
- add offline handling
- add better diagnostics and log export
- harden crash recovery from local SQLite state

Exit criteria:

- app survives restarts and network interruptions
- support diagnostics are usable

### Phase 5: release hardening

- Windows code signing
- macOS signing and notarization
- installer packaging
- CI release artifacts

Exit criteria:

- signed builds are installable on both target platforms

## Detailed TODO checklist

This checklist expands the phase plan into concrete implementation tasks. It is intentionally detailed so it can later become the execution tracker for the project.

### Phase 0 TODO: bootstrap, design baseline, and contracts

- [x] Create `apps/desktop` and `src-tauri` project structure.
- [x] Create root workspace configuration and shared TypeScript settings.
- [x] Add initial Tauri 2 configuration for Windows and macOS targets.
- [x] Add React + Vite renderer bootstrap.
- [x] Add Rust module layout for commands, services, models, and local DB.
- [x] Create `packages/api-contract` for desktop-facing API types.
- [x] Define TypeScript contract types for:
  - `GET /health`
  - `GET /api/v1/me`
  - `GET /api/v1/formats`
  - `POST /api/v1/my/uploads`
  - `GET /api/v1/my/uploads`
  - `GET /api/v1/my/uploads/:uploadId`
  - `POST /api/v1/my/uploads/check-duplicate`
  - `GET /api/v1/cards`
  - `GET /api/v1/my/agg`
- [x] Add runtime validation schemas for all desktop-consumed API payloads.
- [x] Create initial SQLite schema and migrations.
- [x] Add tables for:
  - `server_profiles`
  - `auth_state`
  - `watch_roots`
  - `format_rules`
  - `detected_files`
  - `upload_jobs`
  - `upload_attempts`
  - `diagnostic_events`
- [x] Add fixture CSV directories and realistic sample files for `stats_export` and `card_catalog`.
- [x] Create a desktop Mantine theme aligned to the website app.
- [x] Implement shared design tokens for:
  - typography
  - surface colors
  - borders
  - badge colors
  - table density
- [x] Build the initial shell layout:
  - left nav
  - top bar
  - content region
- [x] Create placeholder routes for:
  - Overview
  - Upload Queue
  - Watch Folders
  - Formats
  - History
  - Diagnostics
  - Settings
- [x] Add structured logging foundation in Rust.
- [x] Add a simple diagnostics event viewer in the renderer.
- [x] Add CI skeleton for:
  - TypeScript checks
  - Rust checks
  - renderer tests
  - native tests

### Phase 1 TODO: auth, session, and server profile management

- [x] Build server profile create/edit/delete flows.
- [x] Validate and normalize server base URLs before saving.
- [x] Implement `GET /health` probe for server connectivity.
- [ ] Implement native secure storage for bearer tokens.
- [ ] Store auth metadata in SQLite without storing the token itself.
- [x] Build a Tauri auth window for Discord website login.
- [ ] Detect successful website login state in the auth window.
- [x] Implement desktop token exchange via `POST /api/v1/auth/desktop/exchange`.
- [x] Return exchanged token data from webview context to native code safely.
- [x] Persist token expiry and user summary metadata after exchange.
- [x] Implement `GET /api/v1/me` validation after token exchange.
- [x] Build signed-in identity summary in the desktop top bar.
- [ ] Build auth status badges for:
  - signed out
  - signing in
  - signed in
  - expired
  - auth blocked
- [x] Implement logout flow using `POST /api/v1/auth/logout`.
- [ ] Delete token from secure storage on logout.
- [ ] Clear auth-window cookies on logout when requested.
- [ ] Optionally call `DELETE /api/session` when doing a full sign-out.
- [x] Handle `401 authentication_required` globally in native API code.
- [x] Pause authenticated queue work when auth becomes invalid.
- [ ] Build re-auth prompts and recovery flows.
- [x] Add diagnostics entries for:
  - login started
  - token exchange success
  - token exchange failure
  - `/api/v1/me` validation failure
  - logout

### Phase 2 TODO: website-aligned desktop UI foundation

- [x] Recreate the website-style app shell in desktop form using Mantine.
- [x] Build the persistent left navigation rail.
- [x] Build the compact top bar with:
  - server summary
  - auth summary
  - watcher status
  - pending upload status
  - quick actions
- [x] Create reusable desktop UI primitives matching website patterns:
  - bordered content cards
  - metadata rows
  - status badges
  - compact filter bars
  - table wrappers
  - split detail panes
- [x] Create consistent table styling for dense operational views.
- [x] Add monospace display components for technical IDs and paths.
- [x] Create queue-state badge components mapped to local and server states.
- [x] Create auth-state badge components.
- [x] Create file-kind badge components.
- [ ] Create alert and empty-state components aligned to the website tone.
- [x] Implement Overview page skeleton with summary cards and recent activity regions.
- [x] Implement Upload Queue page skeleton with table and detail pane.
- [x] Implement Watch Folders page skeleton.
- [x] Implement Formats page skeleton.
- [x] Implement History page skeleton.
- [x] Implement Diagnostics page skeleton.
- [x] Implement Settings page skeleton.
- [x] Verify UI density and readability at common desktop widths:
  - `1280`
  - `1440`
  - `1600`

### Phase 3 TODO: formats, file watching, and local classification

- [x] Implement Rust file-watcher service using `notify`.
- [x] Support one or more watch roots.
- [x] Support pause/resume per watch root.
- [x] Add optional recursive watching.
- [x] Add ignore rules for temp and hidden files.
- [x] Implement file stability detection using debounce and repeated stat checks.
- [x] Build local CSV header parsing.
- [x] Build local file classification for:
  - `stats_export`
  - `card_catalog`
  - unsupported
- [x] Block obviously misconfigured `stats_export` files client-side when every row is pitcher-only, batter-only, or zeroed out.
- [x] Implement SHA-256 hashing for stable files.
- [x] Persist detected file metadata to SQLite.
- [x] Preserve upload history across rescans and track local file presence separately from upload state.
- [x] Stage detected CSVs under app data and use startup rescans to auto-map 5 to 7 digit tournament filenames to cached formats.
- [x] Build `GET /api/v1/formats` fetch and cache behavior.
- [x] Repair older cached format payloads on startup when new desktop-only fields are added.
- [ ] Add format cache invalidation and refresh controls.
- [x] Build the Formats screen using website-style dense tables and metadata cards.
- [x] Show human format labels in overview, queue, and history tables instead of raw format UUIDs.
- [x] Align desktop format handling to the live contiguous `ovrMin` / `ovrMax` tournament OVR contract.
- [x] Carry live slot-tournament metadata (`isSlotsTournament` and `slotCounts`) through the desktop format contract and views.
- [x] Show format details:
  - name
  - mode
  - run environment
  - park
  - cap
  - OVR restrictions
  - era restrictions
  - card type restrictions
- [x] Implement manual format assignment for `stats_export` files.
- [x] Support assigning a `stats_export` by 5 to 7 digit tournament ID and map it to a cached format using the live `tournamentIdPrefix` convention.
- [x] Allow operators to remove files that are still awaiting format assignment from the queue.
- [x] Allow double-click tournament ID entry from the queue filename cell for awaiting tournament exports.
- [ ] Implement saved rules for:
  - watch folder to format
  - filename pattern to format
  - last-used format
- [ ] Add confidence or reason strings for automatic suggestions.
- [x] Build the “Awaiting Format Assignment” queue state and UI.
- [ ] Add file preview details:
  - filename
  - folder
  - detected type
  - checksum
  - header fingerprint or header preview

### Phase 4 TODO: local queue, duplicate preflight, and upload orchestration

- [x] Implement the local upload job state machine.
- [x] Persist queue state transitions in SQLite.
- [x] Build upload dispatcher service on the native side.
- [x] Add client-side file-size guard matching the server payload constraint.
- [x] Implement `POST /api/v1/my/uploads/check-duplicate`.
- [x] Record duplicate preflight results in local job metadata.
- [x] Mark local duplicates as `duplicate_skipped_local`.
- [x] Implement `POST /api/v1/my/uploads`.
- [x] Save returned `uploadId`, `status`, and `checksum`.
- [x] Start per-upload polling with `GET /api/v1/my/uploads/:uploadId`.
- [x] Map server lifecycle phases to local display state.
- [x] Keep polling until:
  - `complete`
  - `failed`
  - `skipped_duplicate`
- [x] Implement jittered polling schedule.
- [x] Implement local retry logic for:
  - network failures
  - `429` responses
  - transient server errors
- [ ] Do not fake backend retry counts that the server does not expose.
- [x] Build Upload Queue screen with:
  - filter tabs
  - dense table
  - detail drawer or split pane
  - action buttons
- [x] Show columns for:
  - file name
  - kind
  - assigned format
  - checksum state
  - local state
  - server lifecycle
  - retries
  - timestamps
  - actions
- [x] Build row detail view showing:
  - full path
  - checksum
  - upload ID
  - request ID
  - error text
  - lifecycle timestamps
- [x] Add manual actions for:
  - retry local job
  - re-authenticate
  - open file location
  - dismiss duplicate

### Phase 5 TODO: cards, history, and richer desktop companion features

- [x] Implement `GET /api/v1/cards` native client support.
- [x] Build card-source awareness in UI:
  - user
  - shared fallback
- [x] Implement `GET /api/v1/my/agg` native client support.
- [x] Build History screen from upload history plus local metadata.
- [x] Add filters for:
  - file kind
  - lifecycle state
  - format
  - date range
- [x] Add sortable table columns.
- [x] Add grouped timeline or recent activity view on Overview.
- [x] Add format-aware summaries on Overview.
- [x] Use source file modification time for queue and overview recency while preserving separate queue update timestamps.
- [x] Add cards and personal aggregate widgets only if they support the upload workflow and do not distract from core queue utility.
- [x] Keep the visual treatment aligned to the website's table-heavy operational style.

### Phase 6 TODO: background behavior, offline support, and resilience

- [x] Ensure watcher service survives renderer reloads.
- [x] Ensure upload dispatcher survives renderer reloads.
- [x] Ensure polling coordinator survives renderer reloads.
- [ ] Add single-instance lock behavior.
- [ ] Add close-to-background behavior.
- [ ] Add launch-at-login support behind a setting.
- [ ] Detect offline state and server-unreachable state separately.
- [ ] Queue work locally while offline.
- [x] Resume pending work on reconnect.
- [ ] Reload auth state on app start from secure storage and SQLite metadata.
- [x] Resume polling of active remote uploads after app restart.
- [x] Recover incomplete local jobs after crash or forced quit.
- [x] Add stale-job detection and repair logic.
- [ ] Add database migration and corruption-handling strategy.

### Phase 7 TODO: diagnostics, observability, and support tooling

- [ ] Expand structured log schema for:
  - auth
  - watcher
  - queue
  - uploads
  - polling
  - API
  - storage
- [ ] Record `x-request-id` in API log entries when present.
- [x] Build Diagnostics screen sections for:
  - auth
  - server connection
  - watch roots
  - queue inspector
  - recent failures
  - recent API requests
- [x] Add redacted export bundle feature.
- [x] Exclude bearer tokens from all exports.
- [x] Exclude raw CSV contents from all exports.
- [x] Add copyable technical values:
  - upload ID
  - request ID
  - checksum
  - local job ID
- [x] Add “Open logs folder” action.
- [x] Add health snapshot action for support use.

### Phase 8 TODO: packaging, signing, and release

- [x] Configure Windows build pipeline.
- [x] Configure macOS build pipeline.
- [ ] Create Windows installer output.
- [ ] Create macOS app and DMG output.
- [ ] Add code signing pipeline for Windows.
- [ ] Add Developer ID signing pipeline for macOS.
- [ ] Add notarization pipeline for macOS.
- [ ] Add versioning and release artifact naming conventions.
- [ ] Add release checklist documentation.
- [ ] Verify install, launch, update-over-install, and uninstall flows.

### Phase 9 TODO: testing and validation

- [ ] Add Rust unit tests for:
  - hashing
  - file stability detection
  - watcher rule evaluation
  - state machine transitions
  - polling logic
- [ ] Add renderer tests for:
  - shell layout
  - auth status components
  - queue table rows
  - format assignment flows
  - diagnostics panels
- [ ] Add contract tests for all desktop-consumed API response shapes.
- [ ] Add integration tests against a live local `xips-pt` stack.
- [ ] Validate login and token exchange end to end.
- [ ] Validate duplicate preflight and duplicate skip handling.
- [ ] Validate upload lifecycle polling through `complete`.
- [ ] Validate upload lifecycle polling through `failed`.
- [ ] Validate auth expiry and recovery handling.
- [ ] Validate offline queue retention and reconnect recovery.
- [ ] Validate restart recovery with queued and active jobs.
- [ ] Validate Windows-specific watcher behavior.
- [ ] Validate macOS-specific watcher and sandbox behavior.

### Phase 10 TODO: optional post-v1 improvements

- [ ] Adopt browser-to-desktop pairing flow if `xips-pt` adds it.
- [ ] Adopt token refresh flow if `xips-pt` adds it.
- [ ] Add server-exposed retry/queue metadata if `xips-pt` adds it.
- [ ] Evaluate system-browser login as the default auth flow.
- [ ] Add auto-update once packaging and signing are stable.
- [ ] Expand analytics views only after the uploader workflow feels complete and reliable.

## Open questions and dependencies on xips-pt

### Open questions

- should the app support multiple server profiles in v1 or only one
- should recursive watch be enabled in v1
- should format assignment be rule-first or review-first
- should card-catalog uploads be watched automatically or only uploaded on demand

### Dependencies on current xips-pt behavior

- `/api/v1/auth/desktop/exchange` remains the bridge from website login to native token
- `/api/v1/me` remains the canonical auth probe
- `/api/v1/formats` remains the tournament discovery endpoint
- `/api/v1/my/uploads/check-duplicate` remains available before upload
- `/api/v1/my/uploads/:uploadId` remains the per-upload polling endpoint
- lifecycle phases continue to represent end-to-end ingest and refresh truthfully

### Exact backend gaps for a better desktop experience

These are the only backend items that materially improve the v1 plan:

- browser-to-desktop pairing flow so login does not depend on a session-bearing auth webview
- desktop token refresh or renewal endpoint
- user-visible queue retry and queue-position fields for upload status

None of those block initial implementation, but they do affect how polished the auth and status UX can be.
