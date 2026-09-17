# 📋 Project Overview & Architecture — A7-MUSIC

This document details the architectural foundation, audio engineering pipeline, capabilities, and system design powering **A7-MUSIC**.

---

## 🏗️ Technical Stack & Architecture

| Layer | Technologies / Libraries |
| :--- | :--- |
| **Client Framework** | React Native 0.86, Expo 57, TypeScript |
| **UI & Styling** | Apple Liquid Glassmorphism, React Native Reanimated 4, React Native Gesture Handler |
| **Audio Playback Engine** | Native Background Service, React Native Track Player 4.1.2, ExoPlayer (Android) / AVPlayer (iOS) |
| **Cloud & Data Layer** | Supabase Cloud Database, Row-Level Security (RLS), Realtime Channels, Edge Functions |
| **Media & Stories** | Expo Camera, Expo Video, React Native ViewShot, Haptics |
| **State & Networking** | React Hooks, Realtime Presence Listeners, WebSocket Audio Sync |

---

## 🎧 Audio Engineering Highlights

1. **Native Background Service**:
   - Registered Android Foreground Service (FOREGROUND_SERVICE_MEDIA_PLAYBACK) with WAKE_LOCK to ensure high-priority playback without thermal throttling or task killing.
   - iOS UIBackgroundModes: ["audio"] integration enabling uninterrupted playback across app switching and screen lock states.

2. **Synchronized Playback ("Listen Together")**:
   - Sub-second latency synchronization layer utilizing WebSockets / Realtime Presence channels to align audio timestamps across multiple remote listeners.

3. **Audio Waveform Visualizer**:
   - Hardware-accelerated dynamic spectrum visualization rendered with SVG and Reanimated 60fps drivers.

---

## 🔒 Security & Privacy Model

- **Zero Plaintext Secrets**: The client application connects securely over SSL/TLS with Row-Level Security policies governing user-to-user data access.
- **Granular Permissions**:
  - Audio: Necessary for local & streamed media playback.
  - Microphone: Used solely when recording voice notes or custom story audio.
  - Camera / Media Library: Requested only when capturing or attaching photos/videos for stories or chat.
  - Notifications: Used to display playback notification controls and friend activity alerts.

---

## 📱 Release & Distribution Strategy

A7-MUSIC binaries are packaged and distributed through official **GitHub Releases**:
- **Android**: Standalone APK packages optimized for ARM64 and universal device profiles.
- **iOS**: Unsigned/Developer IPA packages suitable for personal sideloading via AltStore / Sideloadly and TestFlight staging.

---

<div align="center">
  <sub>Maintained by <a href="https://github.com/raouf-djmilo">Raouf Djemel</a></sub>
</div>