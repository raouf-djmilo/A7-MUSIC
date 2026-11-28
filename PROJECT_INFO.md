# 📋 Project Overview & Architecture — A7 MUSIC (A7 Flow)

Open-source iOS music & synchronized video streaming + multi-mode offline player built **exclusively for iPhone (iOS)** devices.

---

## 🏗️ Technical Stack & Architecture

| Layer | Technologies / Libraries |
| :--- | :--- |
| **Client Framework** | React Native `0.88.1`, Expo SDK `~58.0.26`, TypeScript |
| **UI & Styling** | Apple iOS Liquid Glass (`expo-glass-effect`), React Native Reanimated `4.7.1`, Gesture Handler `3.3` |
| **Audio & Video Engine** | `react-native-track-player 4.1.2` (AVPlayer), `expo-video`, `YoutubeAudioEngine` (WKWebView) |
| **Offline Download Engine** | Multi-mode `AudioDownloadService` (`audio` / `video` / `full`) with HTTP preflight anti-403 verification & `expo-file-system` |
| **Cloud & Auth Layer** | Firebase Authentication, Cloud Firestore (`downloaded_catalog`, likes, playlists) |
| **Updates & Delivery** | `expo-updates` via GitHub Pages Fast OTA + GitHub Actions unsigned `.ipa` release pipeline |

---

## 🎧 Core Capabilities

1. **Ad-Free Streaming & Background Continuity (`UIBackgroundModes: ["audio"]`)**:
   - Seamless transition between foreground and background/Control Center on iOS with synchronized MediaMetadata & artwork.
2. **Music ◄──► Video Real-Time Stage**:
   - Instant toggle between Studio Artwork (`Music`) and synchronized 16:9 / Fullscreen Cinema (`Video`).
3. **Smart Offline Architecture (`audio` / `video` / `full`)**:
   - Downloads exact track media (`InnerTube` verified pipeline + fallback cascade) alongside locally persisted HD square cover art.
   - Deduplicates shared muxed `.mp4` streams in `Full` mode and enforces clean offline mode guards when only Video or only Music Audio is stored locally.

---

## 🍏 Release & Distribution Strategy

A7 MUSIC targets **iPhone / iOS (`15.0+`)** with a two-tier update model:
- **Fast OTA Updates**: JS/UI/engine updates published automatically via `.github/workflows/ota-ios.yml` to matching installed `runtimeVersion` binaries (`1.6.5+`) without wiping offline storage.
- **GitHub Releases (`.ipa`)**: Unsigned `.ipa` packages compiled automatically by GitHub Actions (`.github/workflows/build-ios.yml`) for fresh installs via Sideloadly, AltStore, or TrollStore.

---

<div align="center">
  <sub>Open Source (MIT License) • Maintained by <a href="https://github.com/raouf-djmilo">@raouf-djmilo</a></sub>
</div>
