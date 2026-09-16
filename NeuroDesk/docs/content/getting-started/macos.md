---
title: "macOS Installation"
description: "Install NeuroDesk on macOS using the DMG application"
weight: 10
---


The easiest way to install NeuroDesk on macOS is using the DMG application.

## Download

Download the latest DMG from GitHub releases:

<a href="https://github.com/mudler/NeuroDesk/releases/latest/download/NeuroDesk.dmg">
  <img src="https://img.shields.io/badge/Download-macOS-blue?style=for-the-badge&logo=apple&logoColor=white" alt="Download NeuroDesk for macOS"/>
</a>

## Installation Steps

1. Download the `NeuroDesk.dmg` file from the link above
2. Open the downloaded DMG file
3. Drag the NeuroDesk application to your Applications folder
4. Launch NeuroDesk from your Applications folder

## First Launch

The app you installed is a small launcher that manages the NeuroDesk server for
you. On the first launch it offers to download and install the latest server
release; once that finishes, the server starts automatically and on every
following launch of the app.

The launcher lives in the **menu bar** (look for the NeuroDesk icon in the top
right of your screen) and does not open a window of its own. From the menu bar
icon you can start and stop the server, open the WebUI, check for updates, and
change settings, including turning off the automatic server start
("Start NeuroDesk when the launcher opens" under Settings).

Once the server is running, the WebUI is available at
`http://localhost:8080`.

## Verification

The `NeuroDesk.dmg` (and the app inside it) and the `neurodesk` server binary are
signed with an Apple Developer ID and notarized by Apple, so they launch with no
quarantine prompt or workaround. To inspect the signature yourself:

```bash
spctl --assess --type open --context context:primary-signature -v /Applications/NeuroDesk.app
codesign --verify --deep --strict --verbose=2 /Applications/NeuroDesk.app
```

## Next Steps

After installing NeuroDesk, you can:

- Access the WebUI at `http://localhost:8080`
- [Try it out with examples](/basics/try/)
- [Learn about available models](/models/)
- [Customize your configuration](/advanced/model-configuration/)
