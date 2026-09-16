# AGENTS.md — NeuroDesk Development Guide

> **Project isolation rule (IMPORTANT):**
> Do NOT combine or reuse memories, context, configuration, or conventions from any
> other project/session. Every task performed here must be resolved solely against this
> project's own documentation and codebase. ALWAYS read and follow the documentation in
> this repository (`HANDOFF.md`, `NeuroDesk\AGENTS.md`, `NeuroDeskApp\`, this file) as the
> source of truth before making changes. If documentation is missing or contradictory,
> ask the user — never guess from another project's habits.

## What this project is

NeuroDesk is a Windows desktop AI server + installer, built on top of a rebranded fork of
the NeuroDesk backend (module path `github.com/mudler/NeuroDesk`). The backend lives under
`NeuroDesk\` and the Electron/native wrapper under `NeuroDeskApp\`.

## The two apps

- **Website/backend:** runs `NeuroDesk\neurodesk.exe --address 0.0.0.0:8080`,
  re-themed white-primary / black-secondary UI at `http://localhost:8080`.
- **Desktop app:** Electron app in `NeuroDeskApp\` — `main.js` spawns the backend on
  `127.0.0.1:8080`, opens `dist\win-unpacked\NeuroDesk.exe` (self-contained) or
  `dist\NeuroDeskSetup.exe` (Inno Setup installer).

## Required reading (before any change)

1. `D:\NeuroDesk\HANDOFF.md` — the project handoff log. **Rule from HANDOFF.md: ALWAYS
   ask before deleting, moving, or changing anything.** Keep it updated after changes.
2. `D:\NeuroDesk\NeuroDesk\AGENTS.md` (+ `.agents\`) — backend/UI contributor guide,
   API-endpoint checklist, adding backends, release process.
3. `D:\NeuroDesk\NeuroDesk\.impeccable.md` — UI/UX design context.
4. `D:\NeuroDesk\NeuroDeskApp\` sources — app shell rules live in `main.js`, `package.json`,
   `installer.iss`.

## Golden rules

- **Never carry over conventions from other projects.** Paths, toolchains, ports, naming,
  and defaults that exist here win over anything you "remember" from elsewhere.
- **Reference this project's docs first** — resolve ambiguity from `HANDOFF.md` and the
  code itself; ask before guessing.
- **Naming:** this project is **NeuroDesk** (binary `neurodesk.exe`). "NeuroDesk" appears only
  as upstream provenance (e.g. `github.com/mudler/NeuroDesk`, third-party URLs) — do not
  reintroduce it as branding.

## Quick commands (Windows, PowerShell)

```powershell
# Run the website/backend
D:\NeuroDesk\Start-NeuroDesk.cmd

# Dev-run the desktop app (needs Node)
Set-Location D:\NeuroDesk\NeuroDeskApp; npm start

# Run packaged app (no Node)
D:\NeuroDesk\NeuroDeskApp\dist\win-unpacked\NeuroDesk.exe

# Build the backend binary (Go 1.26, GOTOOLCHAIN=local)
$env:Path = "C:\go\bin;$env:USERPROFILE\go\bin;" + $env:Path
$env:GOTOOLCHAIN = "local"
Set-Location D:\NeuroDesk\NeuroDesk
go build -ldflags "-s -w -X github.com/mudler/NeuroDesk/internal.Version=dev -X github.com/mudler/NeuroDesk/internal.Commit=custom" -o neurodesk.exe ./cmd/neurodesk

# Rebuild the React UI
Set-Location D:\NeuroDesk\NeuroDesk\core\http\react-ui
npm install --legacy-peer-deps; npm run build

# Package the app (win-unpacked) — 7za shim must be in place
Set-Location D:\NeuroDesk\NeuroDeskApp
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win dir

# Build the installer (needs the win-unpacked step above)
& "D:\NeuroDesk\Toolkit\InnoSetup6\ISCC.exe" "D:\NeuroDesk\NeuroDeskApp\installer.iss"
```

## Environment / toolchain notes (from HANDOFF.md)

- Go `C:\go\bin\go.exe` v1.26.0 (not on PATH), Node v24.19.0, Inno Setup 6.7.3 at
  `D:\NeuroDesk\Toolkit\InnoSetup6`, electron-builder 26.0.12.
- Use `GOTOOLCHAIN=local` (avoids auto-downloading a newer toolchain).
- Keep `proxy.golang.org` as GOPROXY; direct mode caused checksum mismatches before.
- The **7za shim** (`NeuroDeskApp\node_modules\7zip-bin\win\x64\7za.exe`) must be re-applied
  after any `npm install` that re-installs `7zip-bin`.

## Constraints

- `NeuroDesk\` has no `.git` (intentional). Never re-add or initialize one there.
- Do not delete/move/change `backends`, `cache`, `configuration`, `data`, `models`,
  `prompt-templates` runtime data under `NeuroDesk\` — HANDOFF says these are runtime data.
- `NeuroDeskApp\dist\NeuroDeskSetup.exe` is ~130 MB (> GitHub 100 MB limit) — use GitHub
  Releases if pushing.