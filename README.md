<div align="center">

<img src="assets/icon.png" width="144" alt="A7 MUSIC Logo" />

# A7 MUSIC (A7 Flow) 🎵🍏

### Open-Source iOS Music & Synchronized Video Player — Built Exclusively for iPhone.

[![Platform - iOS Only](https://img.shields.io/badge/Platform-iPhone%20%2F%20iOS%2015%2B-000000?logo=apple&logoColor=white&style=for-the-badge)](https://github.com/raouf-djmilo/A7-MUSIC/releases/latest)
[![Latest IPA Release](https://img.shields.io/github/v/release/raouf-djmilo/A7-MUSIC?label=Latest%20IPA&color=0A84FF&style=for-the-badge)](https://github.com/raouf-djmilo/A7-MUSIC/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT%20Open%20Source-30D158?style=for-the-badge)](./LICENSE)
[![100% Free & Ad-Free](https://img.shields.io/badge/100%25%20Free-Zero%20Ads-FF9F0A?style=for-the-badge)]()

> **Stream unlimited music & music videos, download tracks for full offline playback, and enjoy a native iOS Liquid Glass experience — 100% Free, Ad-Free, and Open Source.**

[📥 Download Latest iOS IPA](#-download--install-on-iphone-ios) · [✨ Key Features](#-features) · [🔄 Fast OTA Updates](#-over-the-air-ota-updates) · [🔨 Build & Contribute](#-open-source-development)

</div>

---

## 📱 About A7 MUSIC (A7 Flow)

**A7 MUSIC (A7 Flow)** is a free, open-source music and video streaming client crafted **specifically for iPhone (iOS)** users. Designed around Apple's iOS Liquid Glass design language, it gives you instant access to music, synchronized music videos, smart offline downloads, and uninterrupted Lock Screen / background playback — **with zero ads and zero subscriptions**.

> [!NOTE]
> **iPhone / iOS Exclusive Release:** Current builds and native audio/glass optimizations are built, maintained, and distributed **specifically for iOS (`.ipa`)**.

---

## ✨ Features

### 🎧 Ad-Free Music & Synchronized Video Streaming
- **Zero Ads, Forever Free** — Listen continuously without pre-roll, mid-roll, or banner interruptions.
- **Music ◄──► Video Instant Switcher** — Switch seamlessly between high-resolution **1:1 Album Artwork (`Music`)** and synchronized **16:9 Music Video (`Video`)** without restarting the track.
- **Fullscreen Cinema Mode** — In-place animated theatre player supporting aspect toggle (`Fit` / `Fill`), quick `±10s` seek, and gesture controls.
- **Continuous Background Playback & Lock Screen ("White Widget")** — Smooth background audio transitions (`UIBackgroundModes: audio`), album artwork display, and iOS Control Center / Lock Screen controls.

### 📥 Smart Offline Downloads (`Music Only` • `Video Only` • `Full Music`)
- **Flexible Download Modes**:
  - From **Music** view: download **Full Music (Audio + Video)** or **Music Only**.
  - From **Video** view: download **Video Only** or **Full Music (Audio + Video)**.
- **Exact Track Extraction & Anti-403 Preflight** — Resolves streams tied directly to the selected track ID (`InnerTube` verified pipeline + fallback cascade) and stores **HD square covers** locally.
- **Upgrade & Manage Anytime** — Upgrade a `Music Only` or `Video Only` item into `Full` later, or selectively remove Video while keeping Music Audio on your iPhone.
- **Strict Offline UX & Badges** — Clear badges (`Music + Video`, `Video Only`, `Music Only`) inside **Library → Downloads**, full offline queue playback across Home & Search, and smart prompts when switching offline to an un-downloaded mode.

### 🎨 Apple iOS Liquid Glass Design
- **Native Glassmorphism (`expo-glass-effect` / `UIGlassEffect`)** — Adaptive blurred headers, floating MiniPlayer pill, scroll-reactive compact dock, and frosted bottom sheets.
- **Dark & Light Adaptive Themes** + **Bilingual Interface (`English` & `العربية` RTL)**.
- **Fast OTA Updates** — Receive JS feature updates directly in-app via GitHub Pages without losing saved downloads or having to re-sideload every minor patch.

---

## 📥 Download & Install on iPhone (iOS)

> **Requirements:** iPhone / iPad running **iOS 15.0 or higher**.

### 1. Download the Latest `.ipa`
👉 **[Download Latest `A7-MUSIC.ipa` from GitHub Releases](https://github.com/raouf-djmilo/A7-MUSIC/releases/latest/download/A7-MUSIC.ipa)**  
*(Or browse all releases on the [Releases Page](https://github.com/raouf-djmilo/A7-MUSIC/releases).)*

### 2. Install via Sideloading Tool
Because this release is distributed outside the Apple App Store as an unsigned `.ipa`, install it using any standard iOS sideloading tool:
1. **[Sideloadly](https://sideloadly.io/)** *(Recommended for Windows / macOS)* — Drag & drop `A7-MUSIC.ipa`, enter your Apple ID, and click **Start**.
2. **[AltStore](https://altstore.io/)** — Open **My Apps → +** on your iPhone and pick `A7-MUSIC.ipa`.
3. **[TrollStore](https://github.com/opa334/TrollStore)** — Open `A7-MUSIC.ipa` directly on supported iOS versions for permanent signing.

### 3. Trust Developer Certificate & Developer Mode
1. On iPhone go to **Settings → General → VPN & Device Management** → tap your Apple ID → **Trust**.
2. *(On iOS 16+)* enable **Settings → Privacy & Security → Developer Mode**, reboot, and launch **A7 MUSIC**.

See [INSTALL_IOS.md](./INSTALL_IOS.md) for the full illustrated walkthrough.

---

## 🔄 Over-The-Air (OTA) Updates

A7 MUSIC integrates **`expo-updates`** backed by **GitHub Pages** (`ota/ios/1.6.5/manifest.json`):
- Existing users already running an `.ipa` on matching **`runtimeVersion` (`1.6.5`)** receive JS bug fixes, UI improvements, and downloader updates automatically in-app without uninstalling or losing offline tracks.
- Whenever native iOS modules or binary permissions change, a fresh **`A7-MUSIC.ipa`** is published on [GitHub Releases](https://github.com/raouf-djmilo/A7-MUSIC/releases).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React Native `0.88.1` + Expo SDK `~58.0.26` (TypeScript) |
| **Native Media** | `expo-video`, `react-native-track-player`, `react-native-webview` |
| **Animations & UI** | `react-native-reanimated 4`, `react-native-gesture-handler`, `expo-glass-effect`, `expo-image` |
| **State & Storage** | `Zustand`, `AsyncStorage`, `expo-file-system` |
| **Cloud & Auth** | Firebase Auth & Firestore |
| **Updates & CI/CD** | `expo-updates` (GitHub Pages OTA) + GitHub Actions Unsigned `.ipa` Builder |

---

## 🔨 Open-Source Development

**A7 MUSIC is proudly Open Source** under the [MIT License](./LICENSE). Contributions, issues, and pull requests are welcome!

### Run Locally (Expo / iOS Simulator or Expo Go)
```bash
git clone https://github.com/raouf-djmilo/A7-MUSIC.git
cd A7-MUSIC
npm install --legacy-peer-deps
npx expo start
```

### Automated GitHub Actions Builds
- **Fast iOS OTA Update:** Automatic on push to `main` (`.github/workflows/ota-ios.yml`) or manual **Run workflow**.
- **Full iOS `.ipa` Build:** Automatic when pushing a version tag (`git tag vX.Y.Z && git push a7music vX.Y.Z`) or manually via **Actions → Build A7-MUSIC iOS IPA (Unsigned)**.

---

## 📄 License & Maintainer

Released under the **[MIT License](./LICENSE)** — free to inspect, fork, study, and improve.

<div align="center">

**Maintained by [@raouf-djmilo](https://github.com/raouf-djmilo)** · 📧 [raouf.djmilo@gmail.com](mailto:raouf.djmilo@gmail.com)

*A7 MUSIC (A7 Flow) — Built for iPhone. Ad-Free. Open Source.*

</div>
