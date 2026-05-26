# FinFlow — Native Build Playbook

This repository ships with three native distribution paths:

| Target | Tech | Output | Build host required |
|---|---|---|---|
| **Web (PWA)** | manifest.json + service worker | `Install App` button in Chrome/Edge/Safari | None — already live on Vercel |
| **Android APK** | Capacitor 6 + Gradle | `.apk` (sideload) or `.aab` (Play Store) | macOS / Linux / Windows + Android Studio |
| **macOS DMG** | Electron 33 + electron-builder | `.dmg` (universal: x64 + arm64) | macOS (required for signed `.dmg`) |
| **Windows EXE** | Electron 33 + electron-builder | `.exe` + portable | macOS / Linux / Windows |
| **Linux AppImage/DEB** | Electron 33 + electron-builder | `.AppImage` + `.deb` | macOS / Linux / Windows |

---

## Path A — No-build option: PWABuilder (recommended first try)

You don't need anything installed locally. Visit https://www.pwabuilder.com/ and:

1. Paste your Vercel URL: `https://finflow-by-km-updated-2-mp4p.vercel.app`
2. Click **Start** → see the scorecard. The manifest in this repo gets all green checks.
3. Click **Package For Stores** → pick a platform:
   - **Android** → choose "Google Play" (signed `.aab`) or "Sideload" (`.apk`)
   - **macOS** → choose "macOS" (produces `.dmg`)
   - **Windows** → choose "Windows" (produces `.msix`)
4. Download → install on the target device.

> The macOS DMG produced by PWABuilder is **unsigned**. Users will see "unverified developer" until they right-click → Open. For Apple notarization you'll need an Apple Developer account ($99/yr) — see Path C below.

---

## Path B — Build Android APK locally (Capacitor)

### One-time setup

1. Install **Android Studio** → https://developer.android.com/studio
2. Open Android Studio → **More Actions → SDK Manager**:
   - SDK Platforms: install **Android 14 (API 34)** and **Android 13 (API 33)**
   - SDK Tools: install **Android SDK Build-Tools 34.0.0**, **Android SDK Command-line Tools (latest)**, **Android Emulator**
3. Set environment variables (add to your `~/.zshrc` or `~/.bashrc`):
   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS
   # export ANDROID_HOME="$HOME/Android/Sdk"          # Linux
   export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
   ```
4. Install Java 17 (Android Gradle Plugin needs it). On macOS: `brew install openjdk@17`.

### Every time you ship a new APK

```bash
cd frontend

# 1. Rebuild the React app (CI=false to skip CRA's strict warning-to-error)
yarn build

# 2. Push the latest build into the Android wrapper
yarn android:sync

# 3a. Run on a connected device / emulator (quick smoke test)
yarn android:run

# 3b. Or open in Android Studio to build a signed release APK / AAB
yarn android:open
```

In Android Studio: **Build → Generate Signed Bundle / APK → APK** → set up a keystore (do this once, **keep it forever** — losing it means you can never update the app on Play Store) → choose `release` → APK appears in `frontend/android/app/release/`.

### Side-loading on a phone (no Play Store)

1. Email yourself the `.apk`, or copy it via USB
2. Tap the file on the phone → Android asks to allow "Install from this source" → confirm
3. App appears in your launcher

### Switching online ↔ offline

By default the APK loads the live Vercel URL (set in `frontend/capacitor.config.json` → `server.url`). To ship a **fully bundled** APK that works offline:

1. Edit `frontend/capacitor.config.json` → delete the `server` block
2. `yarn android:sync`
3. Rebuild from Android Studio

---

## Path C — Build macOS DMG locally (Electron)

### One-time setup

1. macOS (any version with Apple Silicon or Intel)
2. Node 20+ (`brew install node`)

### Every time you ship a new DMG

```bash
cd desktop
yarn                       # install electron + electron-builder once
yarn dist:mac              # produces dist/FinFlow-1.0.0-arm64.dmg + x64.dmg
```

The DMG appears in `desktop/dist/`. Drag it to Applications → done.

### Building Windows EXE on macOS

```bash
cd desktop
yarn dist:win              # produces dist/FinFlow Setup 1.0.0.exe + portable
```

### Building Linux AppImage on macOS

```bash
cd desktop
yarn dist:linux            # produces dist/FinFlow-1.0.0.AppImage + .deb
```

### Universal build (all three from one command)

```bash
cd desktop
yarn dist:all              # ⚠ Linux + Windows + macOS at once. macOS-host only.
```

### Offline desktop build

By default the desktop app loads the live Vercel URL. To ship an offline-capable desktop bundle that includes the React build inside the `.dmg`:

```bash
cd frontend && yarn build && cd ..
cd desktop
LOAD_LOCAL=true yarn dist:mac
```

### Signing & notarization (optional, recommended for distribution)

Without code signing, macOS Gatekeeper shows "FinFlow can't be opened because Apple cannot check it for malicious software." Users have to right-click → Open the first time.

To skip this for end users:

1. Get an **Apple Developer Program** membership ($99/yr) → https://developer.apple.com/programs/
2. Create a "Developer ID Application" certificate from Xcode or developer.apple.com
3. Set env vars before `yarn dist:mac`:
   ```bash
   export APPLE_ID="you@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # from appleid.apple.com → App-Specific Passwords
   export APPLE_TEAM_ID="ABC123DE45"                         # from developer.apple.com → Membership
   ```
4. Update `desktop/package.json` → `build.mac.identity` to your Developer ID name, and set `hardenedRuntime: true`, `gatekeeperAssess: true`
5. Run `yarn dist:mac` — electron-builder will sign and notarize automatically.

---

## Quick reference

```bash
# Local dev
cd frontend && yarn start                      # http://localhost:3000

# Android APK (release, requires Android Studio)
cd frontend
yarn android:sync && yarn android:open         # then Build → Generate Signed Bundle / APK

# Android dev (live-reload on device)
cd frontend && yarn android:run

# macOS DMG
cd desktop && yarn dist:mac                    # → desktop/dist/FinFlow-*.dmg

# Windows EXE
cd desktop && yarn dist:win                    # → desktop/dist/FinFlow Setup *.exe
```

---

## Folder map

```
/app
├── frontend/
│   ├── android/                  ← Capacitor Android wrapper (Gradle project)
│   ├── ios/                      ← Capacitor iOS wrapper (Xcode project, optional)
│   ├── capacitor.config.json     ← Bundle ID + server URL config
│   ├── public/
│   │   ├── manifest.json         ← PWA manifest
│   │   ├── pwa-icon-192.png
│   │   ├── pwa-icon-512.png
│   │   └── pwa-icon-maskable-512.png
│   └── package.json              ← yarn android:sync / android:open scripts
│
└── desktop/
    ├── main.js                   ← Electron main process
    ├── preload.js                ← (no-op today, reserved)
    ├── icons/
    │   ├── icon.icns             ← macOS
    │   ├── icon.ico              ← Windows
    │   └── icon-{16,32,...}.png  ← Linux fallback
    ├── package.json              ← yarn dist:mac / dist:win / dist:linux
    └── dist/                     ← Build output (gitignored)
```
