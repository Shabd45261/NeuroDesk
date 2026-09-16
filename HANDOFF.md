# NeuroDesk — Project Handoff

> **Keep this file updated after every change to this project.**
> Rule for this project: **ALWAYS ask before deleting, moving, or changing anything.**
> Target: a Windows desktop app ("NeuroDesk") that runs a NeuroDesk-based AI server with a
> white-primary / black-secondary UI, plus a way to distribute it as an installable `.exe`.

---

## 1. Project folders & layout (D:\NeuroDesk)

| Path | What it is |
|---|---|
| `D:\NeuroDesk\NeuroDesk` | NeuroDesk server **source + built binary** (`neurodesk.exe`, ~154 MB). This is the backend. **Has no `.git`** (was intentionally removed). |
| `D:\NeuroDesk\NeuroDeskApp` | The **Windows desktop app** (Electron). This is what you push to GitHub. |
| `D:\NeuroDesk\Toolkit\InnoSetup6` | Inno Setup 6.7.3 (ISCC.exe) — used to build the installer. |
| `D:\NeuroDesk\backends`, `cache`, `configuration`, `data`, `models` | NeuroDesk **runtime data** created when the server runs. Do not push, do not edit. |
| `D:\NeuroDesk\Start-NeuroDesk.cmd` | Launcher: builds (if needed) & runs the **website/backend** at `http://localhost:8080`. |
| `D:\NeuroDesk\Start-NeuroDesk-App.cmd` | Launcher: starts the **Electron desktop app**. |

---

## 2. The two apps (both exist, both work)

### 2a. Website / backend server (NeuroDesk)
- Runs `D:\NeuroDesk\NeuroDesk\neurodesk.exe --address 0.0.0.0:8080`.
- Open `http://localhost:8080` in a browser.
- Serves the **re-themed** NeuroDesk UI (white-primary / black-secondary).

### 2b. Desktop app (NeuroDeskApp)
- Electron app. `main.js` starts the backend on `127.0.0.1:8080`, opens a native 1280x860 window
  (white background, icon = black circle on white) loading that URL. Closing the window kills the backend.
- Run packaged (no Node): `D:\NeuroDesk\NeuroDeskApp\dist\win-unpacked\NeuroDesk.exe` (self-contained, backs its own copy of `neurodesk.exe`).
- Run in dev (needs Node): `npm start` inside `D:\NeuroDesk\NeuroDeskApp`.
- Installer: `D:\NeuroDesk\NeuroDeskApp\dist\NeuroDeskSetup.exe` (130 MB, Inno Setup installer, per-user install, Start Menu + optional desktop shortcut).

---

## 3. Theming done (white-primary / black-secondary)

Both the React UI and the Go-template UI were re-themed to a monochrome white/black palette.
Originally dark and light modes were made identical; as of 2026-09-15 the **dark toggle now works**
— `[data-theme="dark"]` carries a real inverted monochrome palette (black ground, light text,
white accents/black labels) while light stays white-primary.

Modified files (inside `D:\NeuroDesk\NeuroDesk`):
- `core/http/react-ui/src/theme.css` — `:root` = light palette; `[data-theme="dark"]` = inverted black-ground palette; `[data-theme="light"]` mirrors `:root`; `color-scheme` set per theme
- `core/http/react-ui/src/App.css` — toggle thumbs use `var(--color-bg-primary)` instead of hardcoded `#fff` (visible on the white track in dark mode)
- `core/http/static/theme.css` — same palette for the Go-template UI
- `core/http/react-ui/src/contexts/ThemeContext.jsx` — default theme set to `light`
- `core/http/views/partials/head.html` — default theme set to `LIGHT`
- `core/http/react-ui/src/utils/cmTheme.js` — CodeMirror editor theme (monochrome)
- `core/http/react-ui/src/App.css` (line ~681) — fallback color `#4f8cff` → `#000000`
- `core/http/routes/swagger_theme.go` — Swagger UI CSS vars → white/black
- `core/http/static/general.css` — chat bubbles (`user`/`assistant`) black/dark; progress bar black
- `core/http/react-ui/dist/` — rebuilt React bundle

---

## 4. Toolchain / environment (this machine)

| Tool | Where | Notes |
|---|---|---|
| Go | `C:\go\bin\go.exe` (v1.26.0) | **Not on PATH** — prepend `C:\go` when building. Upgraded 1.24.5 → 1.26.0 because NeuroDesk's `go.mod` requires `>= 1.26.0`. |
| Go proxy | `proxy.golang.org` (usable) / `direct` (fallback) | DNS for `proxy.golang.org` failed earlier; `goproxy.cn` had TLS timeouts. Use standard proxy first. |
| Go module plugins | `protoc-gen-go`, `protoc-gen-go-grpc` | Installed into `%USERPROFILE%\go\bin` (needed for protobuf generation). |
| protoc | `D:\NeuroDesk\NeuroDesk\protoc.exe` (v28.3) | Used to generate `pkg/grpc/proto/*.go` from `backend/backend.proto`. |
| Node / npm | `node v24.19.0`, `npm 11.17.0` | On PATH |
| Electron | devDependency `electron@^37.10.3` (+electron-builder 26.0.12) | In `NeuroDeskApp` |
| Inno Setup | `D:\NeuroDesk\Toolkit\InnoSetup6\ISCC.exe` | v6.7.3, installed to user dir (no admin needed) |
| winget | v1.29.290 | available if needed |

### Build environment quirks
- **`go generate ./core/config/...` auto-downloads a newer Go toolchain.** Use `GOTOOLCHAIN=local` to
  force the installed 1.26.0 during `go build`.
- **checksum mismatches when GOPROXY=direct** — keep the default `proxy.golang.org`; delete a stale
  `go.sum` and run `go mod tidy` if direct-mode left mismatches.
- **7za shim workaround (CRITICAL for rebuilding the app package):**
  `NeuroDeskApp\node_modules\7zip-bin\win\x64\` contains:
  - `7za.exe` — a small C# shim that strips `-snld` and returns exit code 0 when the only failures are
    "Cannot create symbolic link" macOS-only entries.
  - `7za_real.exe` — the original 7-Zip binary (renamed).
  Reason: `winCodeSign` cache extraction fails without admin symlink privileges (Developer Mode off),
  which made `electron-builder` fail. The shim makes extraction succeed.
  **If `npm install` re-downloads 7zip-bin, the shim must be re-applied** (recompile from
  `C:\Users\bhavy\AppData\Local\Temp\opencode\7zashim.cs`, or recreate it).

---

## 5. Key commands

```powershell
# Build the backend binary (requires Go 1.26, GOTOOLCHAIN=local)
# NOTE: C: is nearly full — always point GOTMPDIR/GOCACHE at D: first.
$env:Path = "C:\go\bin;$env:USERPROFILE\go\bin;" + $env:Path
$env:GOTOOLCHAIN = "local"
$env:GOTMPDIR = "D:\NeuroDesk\tmp"
$env:GOCACHE = "D:\NeuroDesk\go-cache"
Set-Location D:\NeuroDesk\NeuroDesk
go build -ldflags "-s -w -X github.com/mudler/NeuroDesk/internal.Version=dev -X github.com/mudler/NeuroDesk/internal.Commit=custom" -o neurodesk.exe ./cmd/neurodesk

# Cross-compile the Linux backend (what the desktop app runs inside WSL2):
$env:GOOS = "linux"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags "-s -w -X github.com/mudler/NeuroDesk/internal.Version=dev -X github.com/mudler/NeuroDesk/internal.Commit=custom" -o neurodesk-linux-amd64 ./cmd/neurodesk

# Regenerate protobuf stubs (only needed if backend.proto changes)
D:\NeuroDesk\NeuroDesk\protoc.exe --experimental_allow_proto3_optional -Ibackend/ `
  --go_out=pkg/grpc/proto/ --go_opt=paths=source_relative `
  --go-grpc_out=pkg/grpc/proto/ --go-grpc_opt=paths=source_relative backend/backend.proto

# Rebuild the React UI after theme/UI edits
Set-Location D:\NeuroDesk\NeuroDesk\core\http\react-ui
npm install --legacy-peer-deps
npm run build

# Dev-run the desktop app
Set-Location D:\NeuroDesk\NeuroDeskApp
npm install            # only if node_modules missing
npm start

# Package the app (win-unpacked) — remember 7za shim must be in place
Set-Location D:\NeuroDesk\NeuroDeskApp
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win dir

# Build the installer (needs the win-unpacked step above)
& "D:\NeuroDesk\Toolkit\InnoSetup6\ISCC.exe" "D:\NeuroDesk\NeuroDeskApp\installer.iss"

# Run the website/backend server
D:\NeuroDesk\Start-NeuroDesk.cmd
# or directly:
D:\NeuroDesk\NeuroDesk\neurodesk.exe --address 0.0.0.0:8080
```

---

## 6. What was built & fixed (chronology)

1. Cloned `mudler/NeuroDesk` (shallow, commit `de563f1`) → re-themed UI to white/black → built React UI.
2. Set up Go toolchain; resolved `go.mod` requiring Go 1.26 → upgraded Go 1.24.5 → 1.26.0.
3. Installed `protoc` and Go protobuf plugins; generated `pkg/grpc/proto/*`; built `neurodesk.exe` (~154 MB).
4. Created Electron desktop app (`NeuroDeskApp`): `main.js` spawns backend + loads UI in a native window.
5. Generated app icon (`build/icon.ico`, black circle on white).
6. `electron-builder` NSIS route **failed** (winCodeSign extraction needs admin/symlink rights). Worked
   around with the **7za shim** + `CSC_IDENTITY_AUTO_DISCOVERY=false` + `--win dir` target.
7. Installed **Inno Setup 6.7.3** locally; wrote `installer.iss`; built `dist/NeuroDeskSetup.exe` (130 MB).
8. Verified end-to-end: installed a silent test copy, launched with no Node on PATH → backend served
   HTTP 200 → clean shutdown.
9. Explored model downloads: gallery index (`index.localai.io/models`, 1,794 entries) and model files
   download from HuggingFace work (tested with the 15 MB `edgetam` model, fully cleaned up afterwards).
   **Caches are stored under `<models-path>\..\cache\gallery`, `cache\vram`, `cache\gguf`, and app data
   under `%APPDATA%\neurodesk-app`.**
10. Moved NeuroDesk out (to `D:\testrepo`, `.git` removed), then **moved it back** to
    `D:\NeuroDesk\NeuroDesk` and re-pointed `main.js`, `package.json`, `Start-NeuroDesk.cmd` to it.
11. Rebuilt/recovered `node_modules` and `dist` after an accidental delete (now fixed; ask before deleting).
12. **Synced source to the latest installed app** (from another PC, session memory read from `dist\win-unpacked\new-session-*.json`):
    - The installed `neurodesk.exe` differs from the local source binary only by an in-place CSS patch (`sidebar-logo-img` `max-width:120px` → `168px`).
    - Applied that change properly in `core/http/react-ui/src/App.css` (`max-width: 120px` → `168px`).
    - The installed app's custom branding (`configuration/branding/logo*.png` + `runtime_settings.json`) and the Supra2 model install are **runtime data** on that device — not source. Decision: keep branding as runtime branding (applied per machine via branding API); the source `core/http/static/logo*.png` defaults stay unchanged.
    - Rebuilt the React bundle (`react-ui/dist/assets/index-BvgHj2q3.css`) → now serves `.sidebar-logo-img{max-width:168px}`. The Go binary itself was NOT rebuilt (user chose bundle-only); a `go build` would embed this new bundle if desired.
13. **Three fixes shipped (2026-09-15), full rebuild (bundle + binary + win-unpacked + installer):**
    - **Working dark/light toggle**: `theme.css` now has a real dark palette (`[data-theme="dark"]` = black ground/light text/white accents) instead of two identical blocks; `[data-theme="light"]` mirrors `:root`; toggle/biometrics thumbs switched from hardcoded `#fff` to `var(--color-bg-primary)` so they stay visible on the white track (App.css lines ~1936, ~7562).
    - **Model install rename fix**: `pkg/downloader/uri.go` — the `.partial` writer handle was still open when `os.Rename` ran, which fails on Windows (Go opens without FILE_SHARE_DELETE). Now the file is explicitly closed before the rename, and a new `promotePartialFile()` helper retries with a 250ms–1.25s backoff for transient AV locks and clears a stale destination on Windows before retrying (source is SHA-verified first). Error message string kept identical.
    - **CPU-only enforcement**: the per-model "Run on CPU" toggle in `Models.jsx` (`setExecCpu`) now persists to the backend instead of being a cosmetic localStorage label: it PATCHes the model config (`gpu_layers: 0` to force CPU/RAM, `gpu_layers: null` to restore the GPU default) via the existing `/api/models/config-json/{name}` deep-merge endpoint, then best-effort POSTs `/backend/shutdown` to release a resident instance so the next request cold-loads under the new setting. Added `detail.cpuPersistFailed` translation key (`public/locales/en/models.json`). Backend plumbing already existed (`core/backend/options.go`, `modeladmin.PatchConfig`) — no new endpoints, so no MCP/swagger surface changes required.
    - **Rebuilt** React bundle (embeds into binary via `//go:embed`), `neurodesk.exe` (~154.9 MB, verified contains the new CSS/translations + `promotePartialFile`), `dist/win-unpacked` (Electron, bundled binary hash matches source), and `dist/NeuroDeskSetup.exe` (130 MB, Inno Setup).
14. **WSL2 backend architecture + logo fix (2026-09-15):**
    - **Root cause discovered:** local AI backends (llama-cpp and every other gallery
      backend) are released as **Linux/macOS-only** OCI images
      (`quay.io/go-skynet/neurodesk-backends:*` indexes carry only `linux/amd64` + `linux/arm64`).
      A native Windows install of `neurodesk.exe` therefore always failed model installs with
      `no child with platform windows/amd64` (from `pkg/oci/image.go` `GetImage`, which requests
      `runtime.GOOS/runtime.GOARCH`). Upstream's official Windows story is WSL2 or Docker.
    - **Decision made:** run the backend **inside WSL2**. `NeuroDeskApp/main.js` now:
      - checks WSL presence (`wsl.exe --status` + `wsl -e echo ok`) and shows a guided setup
        dialog if missing;
      - deploys a bundled **`resources/neurodesk-linux`** binary (cross-compiled
        `GOOS=linux GOARCH=amd64`, 157 MB) into `~/neurodesk/neurodesk` in the default WSL distro
        (stdin-pipe copy, marker-based skip when unchanged);
      - spawns it via `wsl.exe --cd ~/neurodesk -e bash -lc '.../neurodesk --address 0.0.0.0:8080
        --models-path ~/neurodesk/models'`; backend/model/backends runtime data now lives under
        `~/neurodesk/` in WSL (Linux fs, per upstream guidance for speed);
      - reuses an already-answering server on :8080, and on quit runs
        `wsl bash -lc "pkill -f 'neurodesk --address' || true"`.
      - **WSL2 IS NOW INSTALLED (2026-09-15):** user rebooted and ran
        `wsl --install -d Ubuntu` — `wsl -l -v` shows Ubuntu / Version 2 / Running.
        Post-install debugging below.
    - **Post-install bugs found & fixed (2026-09-15):**
      1. **"Backend did not start in time"** — probe window was 90×500 ms (45 s) but
         cold WSL boot + backend startup can exceed 60 s. Raised to 4 min.
      2. **WSL2 loopback relay binds only `[::1]:8080` on this machine** (wslrelay
         mode 1, IPv4 `127.0.0.1:8080` stays dead even after `wsl --shutdown`) →
         the window's `loadURL("127.0.0.1")` produced a **blank white screen**.
         `main.js` now probes BOTH `127.0.0.1` and `[::1]`, loads whichever
         answers, and cycles between them on `did-fail-load` (24 tries).
         Backend is healthy inside WSL (`curl http://127.0.0.1:8080/api/version`
         inside the VM → 200) even when Windows loopback is dead.
      3. Fail-fast on backend process exit during startup; guard against double
         backend spawn; `stopBackend` no-ops when no proc.
    - **WSL VM clock drift:** Linux clock in the VM runs ~5.5 h behind Windows
      (log timestamps read "Sep 14 21:1x" while Windows says Sep 15 02:41).
      Cosmetic only — affects `backend.out.log` timestamps, not function.
    - **Logo fix (sidebar "top-left box"):** `core/http/static/logo.png` is the upstream LocalAI
      logo (914 KB) shown by the React sidebar (`Sidebar.jsx` uses the branding
      `logoHorizontalUrl`, default `/static/logo_horizontal.png`). Replaced
      `logo.png` ← `website/static/img/logo-mark.png` (black circle, 48 KB) and
      `logo_horizontal.png` ← `website/static/img/logo-full.png` (147 KB). Both binaries rebuilt
      and **verified live over HTTP** that `/static/logo.png` hashes to `logo-mark.png`. Originals
      backed up in `C:\Users\DELL\AppData\Local\Temp\opencode\neurodesk-static-backup\`.
    - **Logo round 3 (2026-09-15):** user supplied `Desktop\LOGO.png` (1600×900 RGB) as THE
      sidebar top-left home-link mark → `core/http/static/logo_horizontal.png` = LOGO.png.
      Verified served hash == LOGO.png on the running app. Backups in the same temp folder
      (`logo_horizontal.png.previous-logo-full.png`, `logo.png.previous-logo-mark.png`).
      Both binaries rebuilt (linux 157,106,338 B @02:55, windows 160,696,832 B @03:02),
      win-unpacked + `NeuroDeskSetup-1.0.3.exe` recompiled @03:08.
    - **Window/taskbar icon:** `main.js` points at `assets/icon.ico`, which **did not exist**
      (dead path → default icon). Created `assets/icon.ico` = copy of `build/icon.ico`
      (black circle on white) and added `"assets/icon.ico"` to electron-builder `files`.
    - **Packaging:** `package.json` `build.extraResources` now ships **only** the Linux backend
      (`neurodesk-linux`); the Windows `neurodesk.exe` is no longer bundled into the app.
      Version bumped to **1.0.3** (`package.json` + `installer.iss`). Built
      `dist\win-unpacked` (asar 387 KB incl. icon, `resources/neurodesk-linux` 157 MB) and
      `dist\NeuroDeskSetup-1.0.3.exe` (128 MB, Inno Setup, 184 s).
      **Rebuilt 2026-09-15 @02:40** with the loopback-failover fix; installer
      recompiled @02:45 (same 1.0.3 filename, newer bytes).
    - **C:-drive cleanup (2026-09-15, user-approved):** freed ~3.6 GB — `npm-cache`
      1.2 GB, Chrome caches 1.4 GB (incl. Default Code-Cache/Service-Worker),
      Local+Windows Temp ~750 MB, `.gradle` dists 440 MB, electron/Edge caches
      ~145 MB. C: went from ~1.8 GB free to **~5.4 GB**. NOT touched: global npm
      packages, Roaming\Python (2.9 GB), Packages\Claude, C:\dev — app data.
      Lesson: given disk pressure, browsers + WSL relays are the usual suspects.
    - **Disk-space lesson:** C: has <1 GB free; Go builds die with "not enough space".
      Use `$env:GOTMPDIR="D:\NeuroDesk\tmp"` + `$env:GOCACHE="D:\NeuroDesk\go-cache"` for ALL
      `go build` on this machine from now on.

---

## 7. Known issues / current constraints

- **No git repo** in `NeuroDeskApp` (intentional). No `.gitignore` yet.
- **Backend path is hardcoded** to `D:\NeuroDesk\NeuroDesk` in:
  - `NeuroDeskApp\main.js` (dev mode)
  - `NeuroDeskApp\package.json` (`build.extraResources.from`)
  - `Start-NeuroDesk.cmd` (`APP_DIR`)
  → This means a GitHub clone on another machine **cannot build or run** until this is made configurable
    (e.g., `NEURODESK_BACKEND` env var) and the user supplies a NeuroDesk backend binary.
- **`NeuroDeskSetup.exe` is 130 MB** > GitHub's 100 MB per-file limit → cannot be pushed as a normal file.
  Use **GitHub Releases** (2 GB per file) or **source-only push** instead.
- `go generate ./core/config/...` downloads a newer Go toolchain — use `GOTOOLCHAIN=local`.
- The **7za shim** must be re-applied after any `npm install` that re-installs `7zip-bin`.
- **WSL2 is REQUIRED for the desktop app** (backends only ship as Linux/macOS artifacts). NOT yet
  installed here: `wsl --install --no-distribution` is staged, **reboot pending**, then
  `wsl --install -d Ubuntu`.
- **C: drive has <1 GB free** — all Go builds must use `GOTMPDIR`/`GOCACHE` on D: (see §5).
- `dist\win-unpacked` write-protection: a **running packaged app locks the folder**; quit it
  (processes `NeuroDesk.exe`) before running electron-builder.

---

## 8. Next steps (open decisions — confirm with user first)

- [ ] **Install WSL2 on this machine** (REBOOT pending from `wsl --install --no-distribution`), then `wsl --install -d Ubuntu`, then verify the desktop app end-to-end (model install should now work).
- [ ] Make backend path configurable (env var) so the repo is clone-and-run for others.
- [ ] Add `.gitignore` (ignore `node_modules`, `dist`, `Toolkit`, runtime data folders) before pushing.
- [ ] Decide distribution: GitHub Releases (full installer) vs source-only.
- [ ] Rebuild `/core/http/react-ui/` bundle if future UI edits are made, then re-run the packaging steps.

---

*Last updated: 2026-09-15*