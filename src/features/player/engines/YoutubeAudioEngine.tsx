import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, { State } from 'react-native-track-player';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAudioStore } from '../../../store/useAudioStore';
import { getUniversalStudioArtwork } from '../../../utils/artworkHelper';
import { playerModalTranslateY } from '../../../utils/playerMotion';
import {
  beginTrackPlayerTransition,
  markTrackEndHandled,
  pauseSilentBackgroundKeepAlive,
  startSilentBackgroundKeepAlive,
} from '../../../services/playback/playbackSessionManager';
import {
  cleanArtistForLockScreen,
  getLastBridgeCommandTimestamp,
  getLastEngineLoadTimestamp,
  markBridgeCommandTimestamp,
  markEngineLoadTimestamp,
  markVideoUnembeddable,
  registerActivePlayerBridge,
  type YoutubeEngineSnapshot,
  type YoutubeTrackMetadata,
} from '../../../services/playback/youtubeEngineBridge';

const NativeWebView = WebView as unknown as React.ComponentType<any>;
const HOSTED_PLAYER_BASE_URL =
  'https://lonelycpp.github.io/react-native-youtube-iframe/iframe_v2.html';

export interface YoutubeAudioEngineProps {
  /** Whether Video stage is visible inside the open player sheet */
  isVideoVisible: boolean;
  /** Whether fullscreen video overlay is active */
  isVideoFullscreen: boolean;
  /** Video stage geometry inside full player sheet */
  stageTop: number;
  stageLeft: number;
  stageWidth: number;
  stageHeight: number;
  /** Fullscreen centered 16:9 box dimensions */
  fullscreenWidth: number;
  fullscreenHeight: number;
  /** Fit vs Fill mode inside video frame */
  videoAspectMode?: 'fit' | 'fill';
  /** Shared translateY from UnifiedPlayerSheet so Video mode tracks swipe gestures at 120fps */
  sheetTranslateY?: any;
  /** Tap handler when user taps the visible video card box in sheet Video mode */
  onVideoPress?: () => void;
  /** Opens in-place fullscreen video mode */
  onEnterFullscreen?: () => void;
  /** Switches media mode back to Cover if activeEngine is not YouTube while Video tab is active */
  onSwitchToCover?: () => void;
}

const buildHostedPlayerUrl = (videoId: string = ''): string => {
  const payload = {
    controls_s: 0,
    modestbranding_s: 1,
    rel_s: 0,
    iv_load_policy: 3,
    preventFullScreen_s: 1,
    showClosedCaptions_s: 0,
    contentScale_s: 1,
    allowWebViewZoom: false,
    ...(videoId ? { videoId_s: videoId } : {}),
  };
  return `${HOSTED_PLAYER_BASE_URL}?data=${encodeURIComponent(JSON.stringify(payload))}`;
};

/**
 * Runs before page scripts in BOTH host wrapper and inner YouTube embed iframe:
 * 1. Prevents WebKit background/visibility pausing heuristics during app background transitions.
 * 2. Locks `navigator.mediaSession.setActionHandler` so YouTube cannot overwrite Next/Back with +/-10s skip.
 * 3. Installs strict zero-offset video centering CSS BEFORE YouTube computes <video> inline bounds.
 */
const BEFORE_CONTENT_LOADED_SCRIPT = `
(function () {
  if (navigator.audioSession) {
    try { navigator.audioSession.type = 'playback'; } catch (e) {}
  }
  try {
    Object.defineProperty(document, 'hidden', { get: function () { return false; }, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: function () { return 'visible'; }, configurable: true });
    if (typeof Document !== 'undefined' && Document.prototype) {
      Document.prototype.hasFocus = function () { return true; };
    }
    document.hasFocus = function () { return true; };
  } catch (e) {}
  try {
    var origAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (
        type === 'visibilitychange' ||
        type === 'webkitvisibilitychange' ||
        type === 'pagehide' ||
        type === 'blur' ||
        type === 'freeze'
      ) {
        return;
      }
      return origAddEventListener.call(this, type, listener, options);
    };
  } catch (e) {}
  try {
    Object.defineProperty(document, 'onvisibilitychange', { get: function () { return null; }, set: function () {}, configurable: true });
    Object.defineProperty(window, 'onpagehide', { get: function () { return null; }, set: function () {}, configurable: true });
    Object.defineProperty(window, 'onblur', { get: function () { return null; }, set: function () {}, configurable: true });
  } catch (e) {}
  try {
    var origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.setAttribute('playsinline', 'true');
      this.setAttribute('webkit-playsinline', 'true');
      return origPlay.call(this);
    };
  } catch (e) {}

  // Pre-lock MediaSession in embed iframe from t=0ms so YouTube NEVER registers +/-10s skip
  // or overrides A7 Next/Previous/Play/Pause handlers anywhere in lifecycle
  if (window !== window.top && navigator.mediaSession) {
    try {
      var relayEvent = function (payload) {
        try { window.top.postMessage({ __A7_SUB_EVENT__: payload }, '*'); } catch (e) {}
      };
      var relayCmd = function (cmd) {
        try { window.top.postMessage({ __A7_SUB_CMD__: cmd }, '*'); } catch (e) {}
      };
      var origSetHandler = typeof navigator.mediaSession.setActionHandler === 'function'
        ? navigator.mediaSession.setActionHandler.bind(navigator.mediaSession)
        : null;
      if (origSetHandler) {
        window.__a7OrigSetHandler = origSetHandler;
        var guardedSetActionHandler = function (action, handler) {
          if (action === 'seekbackward' || action === 'seekforward') {
            try { return origSetHandler(action, null); } catch (e) { return; }
          }
          // Only allow A7-tagged handlers for transport & track switching
          if (
            action === 'play' ||
            action === 'pause' ||
            action === 'previoustrack' ||
            action === 'nexttrack' ||
            action === 'seekto'
          ) {
            if (!handler || !handler.__a7) {
              return;
            }
            return origSetHandler(action, handler);
          }
          return origSetHandler(action, handler);
        };
        try {
          navigator.mediaSession.setActionHandler = guardedSetActionHandler;
        } catch (eAssign) {}
        try {
          if (typeof MediaSession !== 'undefined' && MediaSession.prototype) {
            Object.defineProperty(MediaSession.prototype, 'setActionHandler', {
              value: function (action, handler) {
                return guardedSetActionHandler.call(this, action, handler);
              },
              configurable: true,
              writable: true,
            });
          }
        } catch (eProto) {}

        var makeEarly = function (fn) { fn.__a7 = true; return fn; };
        try { origSetHandler('seekbackward', null); } catch (e) {}
        try { origSetHandler('seekforward', null); } catch (e) {}
        try {
          origSetHandler('play', makeEarly(function () {
            window.__A7UserPaused = false;
            relayEvent({ type: 'remoteAction', action: 'play' });
            relayCmd('play');
            var v = document.querySelector('video');
            if (v && v.paused) { try { v.play(); } catch (e) {} }
          }));
        } catch (e) {}
        try {
          origSetHandler('pause', makeEarly(function () {
            window.__A7UserPaused = true;
            relayCmd('pause');
            var v = document.querySelector('video');
            if (v && !v.paused) { try { v.pause(); } catch (e) {} }
            relayEvent({ type: 'remoteAction', action: 'pause' });
          }));
        } catch (e) {}
        try {
          origSetHandler('previoustrack', makeEarly(function () {
            relayEvent({ type: 'remoteAction', action: 'previous' });
          }));
        } catch (e) {}
        try {
          origSetHandler('nexttrack', makeEarly(function () {
            relayEvent({ type: 'remoteAction', action: 'next' });
          }));
        } catch (e) {}
      }
    } catch (e) {}
  }

  // Inject zero-offset centering CSS at document parse time
  try {
    var earlyStyle = document.createElement('style');
    earlyStyle.id = 'a7-early-center-css';
    if (window === window.top) {
      earlyStyle.textContent =
        'html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; background: #000 !important; overflow: hidden !important; }' +
        '.container, .video, iframe { position: fixed !important; inset: 0 !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; padding: 0 !important; margin: 0 !important; border: 0 !important; transform: none !important; overflow: hidden !important; background: #000 !important; }';
    } else {
      earlyStyle.textContent =
        'html, body, #player, .html5-video-player, .html5-video-container { position: fixed !important; inset: 0 !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; padding: 0 !important; margin: 0 !important; transform: none !important; overflow: hidden !important; background: #000 !important; }' +
        'video { position: absolute !important; inset: 0 !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; padding: 0 !important; margin: 0 !important; transform: none !important; object-fit: var(--a7-fit, contain) !important; background: #000 !important; }';
    }
    (document.head || document.documentElement).appendChild(earlyStyle);
  } catch (e) {}
})();
true;
`;

/**
 * Unified injected script for both frames:
 * - Main frame (lonelycpp.github.io): manages `window.__A7Host`, normalizes iframe dimensions cleanly,
 *   and re-syncs metadata & fit mode whenever the inner embed frame initializes or resizes.
 * - Subframe (youtube.com/embed): strips chrome + inline pixel offsets from `<video>`, bridges DOM events,
 *   enforces `__A7UserPaused` against unintended auto-resume, and locks Control Center Next/Back handlers.
 */
const ALL_FRAMES_BRIDGE_SCRIPT = `
(function () {
  if (window === window.top) {
    if (window.__A7HostInstalled) return;
    window.__A7HostInstalled = true;

    var activeDesired = null;
    var activeMeta = null;
    var activeFitMode = 'contain';
    var bgAudioAllowed = true;
    var lastSubState = {
      videoPaused: null,
      userPaused: false,
      readyState: 0,
      currentTime: 0,
      duration: 0,
      mediaSessionState: 'none',
    };

    function getEmbedFrame() {
      try {
        return document.querySelector('iframe');
      } catch (e) {
        return null;
      }
    }

    function relayToEmbed(type, data) {
      try {
        var frame = getEmbedFrame();
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ __A7_CTRL__: true, type: type, data: data }, '*');
        }
      } catch (e) {}
    }

    function normalizeHostLayout() {
      try {
        var frame = getEmbedFrame();
        if (frame) {
          frame.removeAttribute('width');
          frame.removeAttribute('height');
          frame.style.cssText = 'position:fixed!important;inset:0!important;top:0!important;left:0!important;width:100%!important;height:100%!important;border:0!important;margin:0!important;padding:0!important;transform:none!important;';
        }
        if (typeof player !== 'undefined' && player && typeof player.setSize === 'function' && window.innerWidth > 10 && window.innerHeight > 10) {
          player.setSize(window.innerWidth, window.innerHeight);
        }
        relayToEmbed('SET_FIT', { fit: activeFitMode });
      } catch (e) {}
    }

    function postToRN(payload) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      } catch (e) {}
    }

    function isPlayerApiAvailable() {
      return typeof player !== 'undefined' && player && typeof player.loadVideoById === 'function';
    }

    window.addEventListener('resize', normalizeHostLayout);

    window.addEventListener('message', function (ev) {
      var msg = ev && ev.data;
      if (!msg) return;

      // Relay subframe events (remoteAction, videoEvent) to React Native via main frame ReactNativeWebView bridge
      if (msg.__A7_SUB_EVENT__) {
        postToRN(msg.__A7_SUB_EVENT__);
        return;
      }

      if (msg.__A7_SUB_CMD__) {
        var cmd = msg.__A7_SUB_CMD__;
        if (cmd === 'play') {
          if (activeDesired) activeDesired.autoplay = true;
          lastSubState.userPaused = false;
          if (isPlayerApiAvailable()) {
            try {
              player.unMute();
              player.setVolume(100);
              player.playVideo();
            } catch (e) {}
          }
        } else if (cmd === 'pause') {
          if (activeDesired) activeDesired.autoplay = false;
          lastSubState.userPaused = true;
          if (isPlayerApiAvailable()) {
            try { player.pauseVideo(); } catch (e) {}
          }
        } else if (cmd === 'ensurePlay') {
          if (!lastSubState.userPaused && bgAudioAllowed && (!activeDesired || activeDesired.autoplay)) {
            if (lastSubState.videoPaused === false) return;
            if (isPlayerApiAvailable()) {
              try {
                var curSt = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
                if (curSt !== 1 && curSt !== 3) {
                  player.unMute();
                  player.setVolume(100);
                  player.playVideo();
                }
              } catch (e) {}
            }
          }
        }
        return;
      }

      if (msg.__A7_SUB_READY__) {
        normalizeHostLayout();
        relayToEmbed('SET_BG_ALLOWED', { allowed: bgAudioAllowed });
        relayToEmbed('SET_USER_PAUSED', { userPaused: lastSubState.userPaused });
        if (activeMeta) {
          relayToEmbed('SET_META', {
            meta: activeMeta,
            playbackState: lastSubState.userPaused ? 'paused' : (activeDesired && activeDesired.autoplay ? 'playing' : 'paused'),
          });
        }
        return;
      }

      if (msg.__A7_SUB_STATE__) {
        lastSubState = {
          videoPaused: typeof msg.paused === 'boolean' ? msg.paused : lastSubState.videoPaused,
          userPaused: typeof msg.userPaused === 'boolean' ? msg.userPaused : lastSubState.userPaused,
          readyState: Number(msg.readyState || 0),
          currentTime: Number(msg.currentTime || 0),
          duration: Number(msg.duration || 0),
          mediaSessionState: msg.mediaSessionState || 'none',
        };
      }
    });

    window.__A7Host = {
      loadVideo: function (videoId, startSec, autoplay, meta) {
        if (!videoId) return false;
        activeDesired = {
          videoId: String(videoId),
          startSec: Math.max(0, Math.floor(Number(startSec || 0))),
          autoplay: Boolean(autoplay),
        };
        lastSubState.userPaused = !autoplay;
        normalizeHostLayout();
        relayToEmbed('SET_BG_ALLOWED', { allowed: bgAudioAllowed });
        relayToEmbed('SET_USER_PAUSED', { userPaused: !autoplay, isLoad: true });
        if (meta) {
          activeMeta = meta;
          relayToEmbed('SET_META', {
            meta: activeMeta,
            playbackState: autoplay ? 'playing' : 'paused',
          });
        }

        if (!isPlayerApiAvailable()) return false;
        try {
          player.unMute();
          player.setVolume(100);
          var curVid = '';
          try {
            var vd = player.getVideoData && player.getVideoData();
            curVid = (vd && vd.video_id) || '';
          } catch (errVd) {}
          if (curVid && curVid === activeDesired.videoId && activeDesired.startSec <= 1) {
            if (activeDesired.autoplay) {
              player.playVideo();
            }
          } else if (activeDesired.autoplay) {
            player.loadVideoById({ videoId: activeDesired.videoId, startSeconds: activeDesired.startSec });
          } else {
            player.cueVideoById({ videoId: activeDesired.videoId, startSeconds: activeDesired.startSec });
          }
          setTimeout(normalizeHostLayout, 180);
          return true;
        } catch (e) {
          return false;
        }
      },

      play: function (onlyIfPaused) {
        if (activeDesired) activeDesired.autoplay = true;
        lastSubState.userPaused = false;
        if (onlyIfPaused) {
          // Prefer raw HTML5 <video>.play() inside embed iframe so YT.Player doesn't re-buffer/glitch audio
          relayToEmbed('FORCE_PLAY', { onlyIfPaused: true });
          if (isPlayerApiAvailable()) {
            try {
              var stCheck = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
              if (stCheck === 1 || stCheck === 3 || lastSubState.videoPaused === false) {
                return;
              }
            } catch (e) {}
          }
        }
        relayToEmbed('SET_USER_PAUSED', { userPaused: false });
        relayToEmbed('FORCE_PLAY', { onlyIfPaused: Boolean(onlyIfPaused) });
        if (isPlayerApiAvailable()) {
          try {
            var st = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
            if (onlyIfPaused && (st === 1 || st === 3 || lastSubState.videoPaused === false)) {
              return;
            }
            player.unMute();
            player.setVolume(100);
            if ((st === -1 || st === 5) && activeDesired && activeDesired.videoId) {
              player.loadVideoById({
                videoId: activeDesired.videoId,
                startSeconds: activeDesired.startSec || 0,
              });
            } else {
              player.playVideo();
            }
          } catch (e) {}
        }
      },

      pause: function () {
        if (activeDesired) activeDesired.autoplay = false;
        lastSubState.userPaused = true;
        relayToEmbed('SET_USER_PAUSED', { userPaused: true });
        relayToEmbed('FORCE_PAUSE', null);
        if (isPlayerApiAvailable()) {
          try { player.pauseVideo(); } catch (e) {}
        }
      },

      seekTo: function (sec) {
        var s = Math.max(0, Number(sec || 0));
        if (activeDesired) activeDesired.startSec = s;
        if (isPlayerApiAvailable() && typeof player.seekTo === 'function') {
          try { player.seekTo(s, true); } catch (e) {}
        }
      },

      setBackgroundAllowed: function (allowed) {
        bgAudioAllowed = Boolean(allowed);
        relayToEmbed('SET_BG_ALLOWED', { allowed: bgAudioAllowed });
      },

      syncMetadata: function (meta, isPlaying) {
        if (meta) activeMeta = meta;
        var stateStr = typeof isPlaying === 'boolean' ? (isPlaying ? 'playing' : 'paused') : undefined;
        relayToEmbed('SET_META', { meta: activeMeta, playbackState: stateStr });
      },

      syncLayout: function (fitMode) {
        if (fitMode === 'cover' || fitMode === 'contain') {
          activeFitMode = fitMode;
        }
        normalizeHostLayout();
      },

      requestSnapshot: function (requestId) {
        var ytState = -99;
        var curTime = 0;
        var dur = 0;
        var vidId = (activeDesired && activeDesired.videoId) || null;
        var ready = isPlayerApiAvailable();
        if (ready) {
          try {
            ytState = typeof player.getPlayerState === 'function' ? Number(player.getPlayerState()) : -1;
            curTime = typeof player.getCurrentTime === 'function' ? Number(player.getCurrentTime() || 0) : 0;
            dur = typeof player.getDuration === 'function' ? Number(player.getDuration() || 0) : 0;
            var vd = player.getVideoData && player.getVideoData();
            if (vd && vd.video_id) vidId = vd.video_id;
          } catch (e) {}
        }
        postToRN({
          type: 'snapshot',
          requestId: requestId || null,
          videoId: vidId,
          ytState: ytState,
          videoPaused: lastSubState.videoPaused,
          userPaused: lastSubState.userPaused,
          videoReadyState: lastSubState.readyState,
          currentTime: curTime > 0 ? curTime : lastSubState.currentTime,
          duration: dur > 0 ? dur : lastSubState.duration,
          mediaSessionState: lastSubState.mediaSessionState,
          isReady: ready,
        });
      },

      pollProgress: function () {
        if (!isPlayerApiAvailable()) return;
        try {
          var state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
          var cur = typeof player.getCurrentTime === 'function' ? Number(player.getCurrentTime() || 0) : 0;
          var dur = typeof player.getDuration === 'function' ? Number(player.getDuration() || 0) : 0;
          if ((!cur || cur <= 0) && lastSubState.currentTime > 0) cur = lastSubState.currentTime;
          if ((!dur || dur <= 0) && lastSubState.duration > 0) dur = lastSubState.duration;
          postToRN({
            type: 'progress',
            state: state,
            videoPaused: lastSubState.videoPaused,
            currentTime: cur,
            duration: dur,
            videoId: (activeDesired && activeDesired.videoId) || null,
          });
        } catch (e) {}
      },
    };
    normalizeHostLayout();
    return;
  }

  // Subframe (youtube.com/embed) bridge
  if (window.__A7SubframeInstalled) return;
  window.__A7SubframeInstalled = true;

  var currentMeta = null;
  var lastMetaKey = '';
  var currentPlaybackState = 'none';
  var currentFitMode = 'contain';
  var transientPauseTimer = null;
  var lastAutoResumeAt = 0;
  var loadingGraceUntil = 0;
  window.__A7UserPaused = false;
  window.__A7BgAudioAllowed = true;

  function postSubToRN(payload) {
    try {
      window.top.postMessage({ __A7_SUB_EVENT__: payload }, '*');
    } catch (e) {}
  }

  function sendSubCmd(cmd) {
    try {
      window.top.postMessage({ __A7_SUB_CMD__: cmd }, '*');
    } catch (e) {}
  }

  function pushStateToHost(v) {
    try {
      window.top.postMessage({
        __A7_SUB_STATE__: true,
        paused: v ? Boolean(v.paused) : null,
        userPaused: Boolean(window.__A7UserPaused),
        readyState: v ? Number(v.readyState || 0) : 0,
        currentTime: v && !isNaN(v.currentTime) ? v.currentTime : 0,
        duration: v && !isNaN(v.duration) && isFinite(v.duration) ? v.duration : 0,
        mediaSessionState: (navigator.mediaSession && navigator.mediaSession.playbackState) || 'none',
      }, '*');
    } catch (e) {}
  }

  function injectCleanCss() {
    try {
      document.documentElement.style.setProperty('--a7-fit', currentFitMode);
      if (document.getElementById('a7-clean-yt-css')) return;
      var style = document.createElement('style');
      style.id = 'a7-clean-yt-css';
      style.textContent =
        '.ytp-chrome-top, .ytp-chrome-bottom, .ytp-watermark, .ytp-pause-overlay, ' +
        '.ytp-pause-overlay-container, .ytp-gradient-top, .ytp-gradient-bottom, ' +
        '.ytp-show-cards-title, .ytp-title, .ytp-impression-link, .ytp-share-button, ' +
        '.ytp-watch-later-button, .ytp-large-play-button, .ytp-cued-thumbnail-overlay, .ytp-spinner { ' +
        '  opacity: 0 !important; display: none !important; pointer-events: none !important; ' +
        '} ' +
        'html, body, #player, .html5-video-player, .html5-video-container { ' +
        '  position: fixed !important; inset: 0 !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; ' +
        '  background: #000 !important; width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; ' +
        '  margin: 0 !important; padding: 0 !important; transform: none !important; overflow: hidden !important; ' +
        '} ' +
        'video { ' +
        '  position: absolute !important; inset: 0 !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; ' +
        '  width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; ' +
        '  margin: 0 !important; padding: 0 !important; transform: none !important; object-fit: var(--a7-fit, contain) !important; background: #000 !important; ' +
        '}';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  }

  function makeA7Handler(fn) {
    fn.__a7 = true;
    return fn;
  }

  function syncPositionState(v) {
    try {
      if (!navigator.mediaSession || typeof navigator.mediaSession.setPositionState !== 'function' || !v) return;
      var dur = Number(v.duration || 0);
      var pos = Number(v.currentTime || 0);
      if (isFinite(dur) && dur > 0 && isFinite(pos) && pos >= 0 && pos <= dur) {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: v.paused ? 0 : (v.playbackRate || 1),
          position: pos,
        });
      }
    } catch (e) {}
  }

  function applyMediaSession(forceBindHandlers) {
    try {
      if (!navigator.mediaSession) return;
      var setHandler = window.__a7OrigSetHandler || navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      if (currentMeta) {
        var metaKey = (currentMeta.videoId || '') + '|' + (currentMeta.title || '') + '|' + (currentMeta.artist || '') + '|' + (currentMeta.artworkUrl || '');
        if (metaKey !== lastMetaKey) {
          lastMetaKey = metaKey;
          var art = currentMeta.artworkUrl
            ? [{ src: currentMeta.artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
            : [];
          navigator.mediaSession.metadata = new MediaMetadata({
            title: currentMeta.title || 'A7 MUSIC',
            artist: currentMeta.artist || 'A7 MUSIC',
            album: 'A7 MUSIC',
            artwork: art,
          });
          forceBindHandlers = true;
        }
      }
      if (currentPlaybackState && currentPlaybackState !== 'none') {
        navigator.mediaSession.playbackState = currentPlaybackState;
      }
      if (forceBindHandlers || !window.__A7HandlersInstalled) {
        // Explicitly clear skip +/-10s so iOS Control Center & Lock Screen show Previous / Next Track
        try { setHandler('seekbackward', null); } catch (e) {}
        try { setHandler('seekforward', null); } catch (e) {}
        setHandler('play', makeA7Handler(function () {
          window.__A7UserPaused = false;
          currentPlaybackState = 'playing';
          navigator.mediaSession.playbackState = 'playing';
          postSubToRN({ type: 'remoteAction', action: 'play' });
          sendSubCmd('play');
          var v = document.querySelector('video');
          if (v && v.paused) {
            try {
              var pr = v.play();
              if (pr && typeof pr.catch === 'function') pr.catch(function () {});
            } catch (e) {}
          }
          syncPositionState(v);
          pushStateToHost(v);
        }));
        setHandler('pause', makeA7Handler(function () {
          window.__A7UserPaused = true;
          currentPlaybackState = 'paused';
          navigator.mediaSession.playbackState = 'paused';
          sendSubCmd('pause');
          var v = document.querySelector('video');
          if (v && !v.paused) {
            try { v.pause(); } catch (e) {}
          }
          syncPositionState(v);
          pushStateToHost(v);
          postSubToRN({ type: 'remoteAction', action: 'pause' });
        }));
        setHandler('previoustrack', makeA7Handler(function () {
          postSubToRN({ type: 'remoteAction', action: 'previous' });
        }));
        setHandler('nexttrack', makeA7Handler(function () {
          postSubToRN({ type: 'remoteAction', action: 'next' });
        }));
        setHandler('seekto', makeA7Handler(function (details) {
          if (details && typeof details.seekTime === 'number') {
            var v = document.querySelector('video');
            if (v) {
              try { v.currentTime = details.seekTime; } catch (e) {}
              syncPositionState(v);
            }
            postSubToRN({ type: 'remoteAction', action: 'seekto', position: details.seekTime });
          }
        }));
        window.__A7HandlersInstalled = true;
      }
    } catch (e) {}
  }

  function tryInstantSubframeResume(v) {
    if (!v || window.__A7UserPaused || !window.__A7BgAudioAllowed || v.ended) return;
    var now = Date.now();
    if (now - lastAutoResumeAt < 35) return;
    lastAutoResumeAt = now;

    function nudgeVideoDomOnly() {
      if (!window.__A7UserPaused && window.__A7BgAudioAllowed && v.paused && !v.ended) {
        try {
          var p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) {}
      }
    }

    // Resume directly on HTMLVideoElement across the ~100ms iOS background transition yield window
    // WITHOUT calling YT player.playVideo(), avoiding YouTube's internal pause->buffer audio drop.
    Promise.resolve().then(nudgeVideoDomOnly);
    setTimeout(nudgeVideoDomOnly, 12);
    setTimeout(nudgeVideoDomOnly, 28);
    setTimeout(nudgeVideoDomOnly, 58);
    setTimeout(nudgeVideoDomOnly, 100);
    setTimeout(function () {
      if (!window.__A7UserPaused && window.__A7BgAudioAllowed && v.paused && !v.ended) {
        nudgeVideoDomOnly();
        sendSubCmd('ensurePlay');
      }
    }, 240);
  }

  function hookVideoElement(v) {
    if (!v || v.__A7Hooked) return;
    v.__A7Hooked = true;
    v.addEventListener('loadstart', function () {
      window.__A7UserPaused = false;
      loadingGraceUntil = Date.now() + 2500;
    });
    var events = ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'canplay', 'durationchange', 'error'];
    events.forEach(function (evName) {
      v.addEventListener(evName, function () {
        if (evName === 'playing' || evName === 'play') {
          if (transientPauseTimer) {
            clearTimeout(transientPauseTimer);
            transientPauseTimer = null;
          }
          if (window.__A7UserPaused) {
            try { v.pause(); } catch (e) {}
            pushStateToHost(v);
            return;
          }
          currentPlaybackState = 'playing';
          applyMediaSession(true);
          syncPositionState(v);
        } else if (evName === 'loadedmetadata' || evName === 'canplay') {
          applyMediaSession(true);
          syncPositionState(v);
          if (!window.__A7UserPaused && window.__A7BgAudioAllowed && v.paused && !v.ended && Date.now() < loadingGraceUntil) {
            tryInstantSubframeResume(v);
          }
        } else if (evName === 'pause') {
          if (!window.__A7UserPaused && window.__A7BgAudioAllowed && !v.ended) {
            // System/WebKit background/foreground transition paused <video> involuntarily ->
            // counter-resume synchronously before PCM ring buffer empties & suppress flicker!
            tryInstantSubframeResume(v);
            if (transientPauseTimer) clearTimeout(transientPauseTimer);
            transientPauseTimer = setTimeout(function () {
              transientPauseTimer = null;
              if (!window.__A7UserPaused && v.paused && !v.ended) {
                pushStateToHost(v);
                postSubToRN({
                  type: 'videoEvent',
                  event: 'pause',
                  paused: true,
                  userPaused: false,
                  readyState: Number(v.readyState || 0),
                  currentTime: isNaN(v.currentTime) ? 0 : v.currentTime,
                  duration: isNaN(v.duration) || !isFinite(v.duration) ? 0 : v.duration,
                });
              }
            }, 340);
            return;
          }
          currentPlaybackState = 'paused';
          applyMediaSession(false);
          syncPositionState(v);
        } else if (evName === 'ended') {
          if (transientPauseTimer) {
            clearTimeout(transientPauseTimer);
            transientPauseTimer = null;
          }
          window.__A7UserPaused = false;
          currentPlaybackState = 'paused';
          applyMediaSession(false);
        }
        pushStateToHost(v);
        postSubToRN({
          type: 'videoEvent',
          event: evName,
          paused: Boolean(v.paused),
          userPaused: Boolean(window.__A7UserPaused),
          readyState: Number(v.readyState || 0),
          currentTime: isNaN(v.currentTime) ? 0 : v.currentTime,
          duration: isNaN(v.duration) || !isFinite(v.duration) ? 0 : v.duration,
        });
      });
    });
  }

  function scanVideo() {
    injectCleanCss();
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      hookVideoElement(vids[i]);
    }
  }

  window.addEventListener('resize', scanVideo);

  window.addEventListener('message', function (ev) {
    var msg = ev && ev.data;
    if (!msg || !msg.__A7_CTRL__) return;
    if (msg.type === 'SET_META' && msg.data) {
      if (msg.data.meta) currentMeta = msg.data.meta;
      if (msg.data.playbackState) currentPlaybackState = msg.data.playbackState;
      applyMediaSession(true);
      syncPositionState(document.querySelector('video'));
    } else if (msg.type === 'SET_FIT' && msg.data && msg.data.fit) {
      currentFitMode = msg.data.fit;
      scanVideo();
    } else if (msg.type === 'SET_BG_ALLOWED' && msg.data) {
      window.__A7BgAudioAllowed = Boolean(msg.data.allowed);
    } else if (msg.type === 'SET_USER_PAUSED' && msg.data) {
      window.__A7UserPaused = Boolean(msg.data.userPaused);
      if (msg.data.isLoad) loadingGraceUntil = Date.now() + 2500;
      pushStateToHost(document.querySelector('video'));
    } else if (msg.type === 'FORCE_PLAY') {
      window.__A7UserPaused = false;
      currentPlaybackState = 'playing';
      var vPlay = document.querySelector('video');
      if (vPlay && vPlay.paused) {
        try {
          var fp = vPlay.play();
          if (fp && typeof fp.catch === 'function') fp.catch(function () {});
        } catch (e) {}
      }
      applyMediaSession(false);
      syncPositionState(vPlay);
      pushStateToHost(vPlay);
    } else if (msg.type === 'FORCE_PAUSE') {
      window.__A7UserPaused = true;
      currentPlaybackState = 'paused';
      if (transientPauseTimer) {
        clearTimeout(transientPauseTimer);
        transientPauseTimer = null;
      }
      var vPause = document.querySelector('video');
      if (vPause && !vPause.paused) {
        try { vPause.pause(); } catch (e) {}
      }
      applyMediaSession(false);
      syncPositionState(vPause);
      pushStateToHost(vPause);
    }
  });

  if (typeof MutationObserver !== 'undefined') {
    var obs = new MutationObserver(scanVideo);
    obs.observe(document.documentElement || document, { childList: true, subtree: true });
  }
  scanVideo();
  applyMediaSession(true);
  setTimeout(function () { applyMediaSession(true); }, 350);
  setTimeout(function () { applyMediaSession(true); }, 1000);
  try { window.top.postMessage({ __A7_SUB_READY__: true }, '*'); } catch (e) {}
})();
true;
`;

export const YoutubeAudioEngine: React.FC<YoutubeAudioEngineProps> = React.memo(
  ({
    isVideoVisible,
    isVideoFullscreen,
    stageTop,
    stageLeft,
    stageWidth,
    stageHeight,
    fullscreenWidth,
    fullscreenHeight,
    videoAspectMode = 'fit',
    sheetTranslateY,
    onVideoPress,
    onEnterFullscreen,
    onSwitchToCover,
  }) => {
    const webViewRef = useRef<any>(null);
    const [remountKey, setRemountKey] = useState(0);
    const [sourceUri, setSourceUri] = useState<string>(() => buildHostedPlayerUrl(''));
    const playerReadyRef = useRef(false);
    const webViewLoadedRef = useRef(false);
    const pendingLoadRef = useRef<{
      videoId: string;
      startSec: number;
      autoplay: boolean;
      meta?: YoutubeTrackMetadata;
    } | null>(null);
    const lastLoadedVideoIdRef = useRef<string | null>(null);
    const pendingSeekSecRef = useRef<number | null>(null);
    const pendingSnapshotResolversRef = useRef<
      Map<string, (snap: YoutubeEngineSnapshot | null) => void>
    >(new Map());
    const pendingPauseConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bgKickTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const lastDomPlaySyncRef = useRef(0);
    const enteredBackgroundAtRef = useRef(0);
    const enteredForegroundAtRef = useRef(0);
    const bgAutoNudgeCountRef = useRef(0);

    const activeEngine = useAudioStore((s) => s.activeEngine);
    const currentTrack = useAudioStore((s) => s.currentTrack);
    const isPlaying = useAudioStore((s) => s.isPlaying);
    const backgroundAudioEnabled = useAudioStore((s) => s.backgroundAudioEnabled);
    const isPlayerModalVisible = useAudioStore((s) => s.isPlayerModalVisible);
    const audioEngineAction = useAudioStore((s) => s.audioEngineAction);

    const cssFitMode = videoAspectMode === 'fill' ? 'cover' : 'contain';

    const buildTrackMeta = useCallback(
      (track: typeof currentTrack): YoutubeTrackMetadata | undefined => {
        if (!track?.videoId) return undefined;
        return {
          videoId: track.videoId,
          title: track.title || 'A7 MUSIC',
          artist: cleanArtistForLockScreen(track.artist),
          artworkUrl: getUniversalStudioArtwork(
            track.thumbnail || '',
            track.title || '',
            track.artist || '',
            track.videoId || ''
          ),
          durationSec: track.duration ? Math.floor(track.duration / 1000) : undefined,
        };
      },
      []
    );

    const clearPendingPauseConfirm = useCallback(() => {
      if (pendingPauseConfirmTimerRef.current) {
        clearTimeout(pendingPauseConfirmTimerRef.current);
        pendingPauseConfirmTimerRef.current = null;
      }
    }, []);

    const clearBgKickTimers = useCallback(() => {
      while (bgKickTimersRef.current.length > 0) {
        const t = bgKickTimersRef.current.pop();
        if (t) clearTimeout(t);
      }
    }, []);

    const injectHostCall = useCallback((jsBody: string) => {
      try {
        webViewRef.current?.injectJavaScript(`(function(){try{${jsBody}}catch(e){}})();true;`);
      } catch {
        // Ignore while reloading/remounting
      }
    }, []);

    const playInEngine = useCallback(
      (onlyIfPaused: boolean = false) => {
        clearPendingPauseConfirm();
        markBridgeCommandTimestamp();
        injectHostCall(
          `window.__A7Host && window.__A7Host.play(${onlyIfPaused ? 'true' : 'false'});`
        );
      },
      [clearPendingPauseConfirm, injectHostCall]
    );

    const pauseInEngine = useCallback(() => {
      clearPendingPauseConfirm();
      clearBgKickTimers();
      markBridgeCommandTimestamp();
      injectHostCall(`window.__A7Host && window.__A7Host.pause();`);
    }, [clearBgKickTimers, clearPendingPauseConfirm, injectHostCall]);

    const seekInEngine = useCallback(
      (sec: number) => {
        markBridgeCommandTimestamp();
        const safeSec = Math.max(0, sec);
        injectHostCall(`window.__A7Host && window.__A7Host.seekTo(${safeSec});`);
      },
      [injectHostCall]
    );

    const syncMetadataInEngine = useCallback(
      (meta: YoutubeTrackMetadata, playing?: boolean) => {
        const playingArg = typeof playing === 'boolean' ? (playing ? 'true' : 'false') : 'undefined';
        injectHostCall(
          `window.__A7Host && window.__A7Host.syncMetadata(${JSON.stringify(meta)}, ${playingArg});`
        );
      },
      [injectHostCall]
    );

    const loadVideoInEngine = useCallback(
      (
        videoId: string,
        startSec: number = 0,
        autoplay: boolean = true,
        meta?: YoutubeTrackMetadata
      ) => {
        if (!videoId) return;
        clearPendingPauseConfirm();
        lastLoadedVideoIdRef.current = videoId;
        markEngineLoadTimestamp();

        const req = { videoId, startSec, autoplay, meta };
        pendingLoadRef.current = req;

        if (playerReadyRef.current && webViewLoadedRef.current) {
          const metaArg = meta ? JSON.stringify(meta) : 'null';
          injectHostCall(
            `window.__A7Host && window.__A7Host.loadVideo(${JSON.stringify(videoId)}, ${Number(
              startSec || 0
            )}, ${autoplay ? 'true' : 'false'}, ${metaArg});`
          );
          return;
        }

        const targetUri = buildHostedPlayerUrl(videoId);
        if (sourceUri !== targetUri) {
          playerReadyRef.current = false;
          setSourceUri(targetUri);
        }
      },
      [clearPendingPauseConfirm, injectHostCall, sourceUri]
    );

    const requestSnapshot = useCallback((): Promise<YoutubeEngineSnapshot | null> => {
      if (!webViewRef.current || !webViewLoadedRef.current) {
        return Promise.resolve(null);
      }
      const reqId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pendingSnapshotResolversRef.current.delete(reqId);
          resolve(null);
        }, 650);

        pendingSnapshotResolversRef.current.set(reqId, (snap) => {
          clearTimeout(timeout);
          resolve(snap);
        });

        injectHostCall(
          `window.__A7Host && window.__A7Host.requestSnapshot(${JSON.stringify(reqId)});`
        );
      });
    }, [injectHostCall]);

    useEffect(() => {
      registerActivePlayerBridge({
        play: () => playInEngine(false),
        pause: pauseInEngine,
        seekTo: seekInEngine,
        loadVideo: loadVideoInEngine,
        syncMetadata: syncMetadataInEngine,
        getSnapshot: requestSnapshot,
        remount: () => {
          const s = useAudioStore.getState();
          const curSec = Math.max(0, Math.floor(s.positionMillis / 1000));
          if (curSec > 0) pendingSeekSecRef.current = curSec;
          const vid = s.currentTrack?.videoId || '';
          lastLoadedVideoIdRef.current = null;
          playerReadyRef.current = false;
          webViewLoadedRef.current = false;
          setSourceUri(buildHostedPlayerUrl(vid));
          setRemountKey((k) => k + 1);
        },
      });
      return () => {
        clearPendingPauseConfirm();
        clearBgKickTimers();
        registerActivePlayerBridge(null);
      };
    }, [
      clearBgKickTimers,
      clearPendingPauseConfirm,
      loadVideoInEngine,
      pauseInEngine,
      playInEngine,
      requestSnapshot,
      seekInEngine,
      syncMetadataInEngine,
    ]);

    // Keep embedded background-audio shield flag synchronized with Settings toggle
    useEffect(() => {
      injectHostCall(
        `window.__A7Host && window.__A7Host.setBackgroundAllowed(${backgroundAudioEnabled ? 'true' : 'false'});`
      );
    }, [backgroundAudioEnabled, injectHostCall]);

    // Synchronize frame centering & fit mode whenever stage visibility, size, or fullscreen toggles
    useEffect(() => {
      const t = setTimeout(() => {
        injectHostCall(`window.__A7Host && window.__A7Host.syncLayout(${JSON.stringify(cssFitMode)});`);
      }, 60);
      return () => clearTimeout(t);
    }, [
      cssFitMode,
      fullscreenHeight,
      fullscreenWidth,
      injectHostCall,
      isPlayerModalVisible,
      isVideoFullscreen,
      isVideoVisible,
      stageHeight,
      stageWidth,
    ]);

    const reconcileSnapshotToStore = useCallback(
      (snap: YoutubeEngineSnapshot | null) => {
        if (!snap) return;
        const store = useAudioStore.getState();
        if (store.activeEngine !== 'youtube' || !store.currentTrack) return;

        const timeSinceBridgeCmd = Date.now() - getLastBridgeCommandTimestamp();
        const timeSinceLoad = Date.now() - getLastEngineLoadTimestamp();

        if (snap.currentTime > 0) {
          const curMillis = Math.floor(snap.currentTime * 1000);
          const durMillis =
            snap.duration > 0 ? Math.floor(snap.duration * 1000) : store.durationMillis;
          store.updateProgress(curMillis, durMillis);
        }

        // If user explicitly paused via Control Center or in-app button, NEVER auto-resume on foreground!
        if (snap.userPaused === true || (store.isUserPauseAction && timeSinceBridgeCmd > 450)) {
          if (snap.videoPaused === false || snap.ytState === 1) {
            pauseInEngine();
          }
          if (store.isPlaying) {
            useAudioStore.setState({
              isPlaying: false,
              isUserPauseAction: true,
              isLoading: false,
              loadingTrackId: null,
              audioEngineAction: null,
            });
            pauseSilentBackgroundKeepAlive();
          }
          return;
        }

        const webKitPlaying = snap.ytState === 1 || snap.videoPaused === false;
        const webKitPaused =
          snap.videoPaused === true || snap.ytState === 2 || snap.ytState === 5;

        if (webKitPlaying && !store.isPlaying && !store.isUserPauseAction && timeSinceBridgeCmd > 450) {
          useAudioStore.setState({
            isPlaying: true,
            isUserPauseAction: false,
            isLoading: false,
            loadingTrackId: null,
            audioEngineAction: null,
          });
          if (store.backgroundAudioEnabled) {
            startSilentBackgroundKeepAlive().catch(() => {});
          }
          const meta = buildTrackMeta(store.currentTrack);
          if (meta) syncMetadataInEngine(meta, true);
          return;
        }

        if (
          !webKitPlaying &&
          webKitPaused &&
          store.isPlaying &&
          !store.isLoading &&
          timeSinceBridgeCmd > 900 &&
          timeSinceLoad > 1800
        ) {
          // If still within foreground re-entry window and user did NOT pause, protect continuity instead of killing UI
          if (
            store.backgroundAudioEnabled &&
            !store.isUserPauseAction &&
            enteredForegroundAtRef.current > 0 &&
            Date.now() - enteredForegroundAtRef.current < 2600
          ) {
            playInEngine(true);
            return;
          }
          useAudioStore.setState({
            isPlaying: false,
            isUserPauseAction: true,
            isLoading: false,
            loadingTrackId: null,
            audioEngineAction: null,
          });
          pauseSilentBackgroundKeepAlive();
        }
      },
      [buildTrackMeta, pauseInEngine, playInEngine, syncMetadataInEngine]
    );

    const handleEnginePausedSignal = useCallback(() => {
      const store = useAudioStore.getState();
      if (store.activeEngine !== 'youtube') return;

      const timeSinceCmd = Date.now() - getLastBridgeCommandTimestamp();
      const timeSinceLoad = Date.now() - getLastEngineLoadTimestamp();
      if (!store.isPlaying || store.isLoading || timeSinceCmd <= 650 || timeSinceLoad <= 1400) {
        return;
      }

      const appState = AppState.currentState;
      if (appState === 'background') {
        if (!store.backgroundAudioEnabled) {
          store.pauseTrack();
          return;
        }
        const inBgTransitionWindow =
          enteredBackgroundAtRef.current > 0 &&
          Date.now() - enteredBackgroundAtRef.current < 2800;

        if (inBgTransitionWindow && bgAutoNudgeCountRef.current < 3) {
          bgAutoNudgeCountRef.current += 1;
          startSilentBackgroundKeepAlive().catch(() => {});
          playInEngine(true);
        }
        return;
      }

      if (appState === 'inactive') {
        // Swipe home, opening app, or pulling Control Center temporarily fires 'inactive';
        // genuine Control Center Pause taps always arrive explicitly via remoteAction: 'pause'.
        if (store.backgroundAudioEnabled) {
          startSilentBackgroundKeepAlive().catch(() => {});
        }
        return;
      }

      // Guard brief foreground surface re-attach pause immediately after returning from background
      if (
        store.backgroundAudioEnabled &&
        !store.isUserPauseAction &&
        enteredForegroundAtRef.current > 0 &&
        Date.now() - enteredForegroundAtRef.current < 2200
      ) {
        playInEngine(true);
        return;
      }

      useAudioStore.setState({
        isPlaying: false,
        isUserPauseAction: true,
        isLoading: false,
        loadingTrackId: null,
      });
      pauseSilentBackgroundKeepAlive();
    }, [playInEngine]);

    // AppState lifecycle: proactive keep-alive on swipe-home & zero-drop foreground wakeup
    useEffect(() => {
      let lastAppState: string = AppState.currentState || 'active';
      const sub = AppState.addEventListener('change', (nextState) => {
        const wasBackgroundOrInactive =
          lastAppState === 'background' || lastAppState === 'inactive';
        lastAppState = nextState;

        if (nextState === 'inactive') {
          // Ensure silent keep-alive anchor is already spinning BEFORE 'background' arrives
          const store = useAudioStore.getState();
          if (
            store.backgroundAudioEnabled &&
            store.isPlaying &&
            !store.isUserPauseAction &&
            store.activeEngine === 'youtube'
          ) {
            startSilentBackgroundKeepAlive().catch(() => {});
          }
          return;
        }

        if (nextState === 'background') {
          clearPendingPauseConfirm();
          clearBgKickTimers();
          enteredBackgroundAtRef.current = Date.now();
          bgAutoNudgeCountRef.current = 0;

          const store = useAudioStore.getState();
          if (
            store.backgroundAudioEnabled &&
            store.isPlaying &&
            !store.isUserPauseAction &&
            store.activeEngine === 'youtube' &&
            store.currentTrack?.videoId
          ) {
            startSilentBackgroundKeepAlive().catch(() => {});
            // Delayed fallback check after raw subframe DOM recovery (~260ms)
            const t = setTimeout(() => {
              const s = useAudioStore.getState();
              if (
                AppState.currentState === 'background' &&
                s.backgroundAudioEnabled &&
                s.isPlaying &&
                !s.isUserPauseAction &&
                s.activeEngine === 'youtube'
              ) {
                playInEngine(true);
              }
            }, 260);
            bgKickTimersRef.current.push(t);
          }
          return;
        }

        if (nextState === 'active') {
          clearBgKickTimers();
          clearPendingPauseConfirm();
          enteredBackgroundAtRef.current = 0;
          enteredForegroundAtRef.current = Date.now();
          bgAutoNudgeCountRef.current = 0;

          const store = useAudioStore.getState();
          if (
            store.activeEngine === 'native' &&
            NativeModules?.TrackPlayerModule &&
            store.currentTrack
          ) {
            Promise.all([
              TrackPlayer.getProgress().catch(() => null),
              TrackPlayer.getPlaybackState().catch(() => null),
            ])
              .then(([prog, pb]) => {
                const cur = useAudioStore.getState();
                if (cur.activeEngine !== 'native') return;
                if (prog && typeof prog.position === 'number' && prog.position >= 0) {
                  const durMs =
                    typeof prog.duration === 'number' && prog.duration > 2
                      ? Math.round(prog.duration * 1000)
                      : cur.durationMillis;
                  useAudioStore.setState({
                    positionMillis: Math.round(prog.position * 1000),
                    durationMillis: durMs,
                  });
                }
                if (pb?.state === State.Playing && !cur.isUserPauseAction) {
                  useAudioStore.setState({
                    isPlaying: true,
                    isUserPauseAction: false,
                    isLoading: false,
                    loadingTrackId: null,
                  });
                } else if (pb?.state === State.Paused || pb?.state === State.Stopped) {
                  if (!cur.isLoading) {
                    useAudioStore.setState({ isPlaying: false, isUserPauseAction: true });
                  }
                }
              })
              .catch(() => {});
            return;
          }

          if (store.activeEngine !== 'youtube' || !store.currentTrack) return;

          if (wasBackgroundOrInactive) {
            setTimeout(() => {
              requestSnapshot().then(reconcileSnapshotToStore);
            }, 160);
          }
        }
      });
      return () => {
        clearBgKickTimers();
        sub.remove();
      };
    }, [
      clearBgKickTimers,
      clearPendingPauseConfirm,
      playInEngine,
      reconcileSnapshotToStore,
      requestSnapshot,
    ]);

    useEffect(() => {
      if (activeEngine !== 'youtube') {
        pauseInEngine();
        lastLoadedVideoIdRef.current = null;
      }
    }, [activeEngine, pauseInEngine]);

    useEffect(() => {
      if (activeEngine !== 'youtube' || !currentTrack?.videoId) return;

      const store = useAudioStore.getState();
      const targetId = currentTrack.videoId;
      const startSec =
        pendingSeekSecRef.current ??
        (store.positionMillis > 1500 ? Math.floor(store.positionMillis / 1000) : 0);

      if (lastLoadedVideoIdRef.current !== targetId) {
        pendingSeekSecRef.current = null;
        const meta = buildTrackMeta(currentTrack);
        loadVideoInEngine(targetId, startSec, !store.isUserPauseAction, meta);
      }
    }, [activeEngine, buildTrackMeta, currentTrack, loadVideoInEngine]);

    useEffect(() => {
      if (activeEngine !== 'youtube' || !audioEngineAction || !currentTrack?.videoId) return;

      const { type, position, videoId } = audioEngineAction;
      if (type === 'seek' && typeof position === 'number') {
        seekInEngine(Math.floor(position));
        useAudioStore.setState({ audioEngineAction: null });
      } else if (type === 'play') {
        const startSec = typeof position === 'number' ? Math.floor(position) : 0;
        const targetVideoId = videoId || currentTrack.videoId;
        const meta = buildTrackMeta(currentTrack);
        loadVideoInEngine(targetVideoId, startSec, true, meta);
        useAudioStore.setState({ audioEngineAction: null });
      } else if (type === 'resume') {
        playInEngine(false);
        useAudioStore.setState({ audioEngineAction: null });
      } else if (type === 'pause') {
        pauseInEngine();
        useAudioStore.setState({ audioEngineAction: null });
      }
    }, [
      activeEngine,
      audioEngineAction,
      buildTrackMeta,
      currentTrack,
      loadVideoInEngine,
      pauseInEngine,
      playInEngine,
      seekInEngine,
    ]);

    useEffect(() => {
      if (activeEngine !== 'youtube' || !currentTrack?.videoId || !isPlaying) return;
      const timer = setInterval(() => {
        const s = useAudioStore.getState();
        if (s.activeEngine !== 'youtube' || !s.isPlaying) return;
        injectHostCall(`window.__A7Host && window.__A7Host.pollProgress();`);
      }, 500);
      return () => clearInterval(timer);
    }, [activeEngine, currentTrack?.videoId, injectHostCall, isPlaying]);

    const handlePlayerReadyFromHost = useCallback(() => {
      playerReadyRef.current = true;
      const s = useAudioStore.getState();
      const pending = pendingLoadRef.current;

      if (s.activeEngine === 'youtube' && s.currentTrack?.videoId) {
        const desired = pending?.videoId === s.currentTrack.videoId ? pending : null;
        const startSec =
          pendingSeekSecRef.current ??
          desired?.startSec ??
          (s.positionMillis > 1500 ? Math.floor(s.positionMillis / 1000) : 0);
        pendingSeekSecRef.current = null;
        pendingLoadRef.current = null;

        const meta = desired?.meta || buildTrackMeta(s.currentTrack);
        injectHostCall(
          `window.__A7Host && window.__A7Host.setBackgroundAllowed(${
            s.backgroundAudioEnabled ? 'true' : 'false'
          });`
        );
        if (s.isPlaying && !s.isUserPauseAction) {
          const metaArg = meta ? JSON.stringify(meta) : 'null';
          injectHostCall(
            `if (window.__A7Host) { window.__A7Host.loadVideo(${JSON.stringify(
              s.currentTrack.videoId
            )}, ${Math.floor(startSec)}, true, ${metaArg}); } else if (typeof player !== 'undefined' && player) { try { player.unMute(); player.setVolume(100); player.playVideo(); } catch (e) {} }`
          );
        } else if (meta) {
          syncMetadataInEngine(meta, false);
        }
      }
    }, [buildTrackMeta, injectHostCall, syncMetadataInEngine]);

    const handleWebViewLoadEnd = useCallback(() => {
      webViewLoadedRef.current = true;
      const bgAllowed = useAudioStore.getState().backgroundAudioEnabled;
      injectHostCall(ALL_FRAMES_BRIDGE_SCRIPT);
      injectHostCall(
        `window.__A7Host && (window.__A7Host.setBackgroundAllowed(${
          bgAllowed ? 'true' : 'false'
        }), window.__A7Host.syncLayout(${JSON.stringify(cssFitMode)}));`
      );
      // Flush immediately if YT playerReady already fired before onLoadEnd finished installing __A7Host
      if (playerReadyRef.current || pendingLoadRef.current) {
        const s = useAudioStore.getState();
        if (s.activeEngine === 'youtube' && s.currentTrack?.videoId && s.isPlaying && !s.isUserPauseAction) {
          const startSec =
            pendingSeekSecRef.current ??
            pendingLoadRef.current?.startSec ??
            (s.positionMillis > 1500 ? Math.floor(s.positionMillis / 1000) : 0);
          const meta = buildTrackMeta(s.currentTrack);
          const metaArg = meta ? JSON.stringify(meta) : 'null';
          injectHostCall(
            `if (window.__A7Host) { window.__A7Host.loadVideo(${JSON.stringify(
              s.currentTrack.videoId
            )}, ${Math.floor(startSec)}, true, ${metaArg}); } else if (typeof player !== 'undefined' && player) { try { player.unMute(); player.setVolume(100); player.playVideo(); } catch (e) {} }`
          );
        }
      }
    }, [buildTrackMeta, cssFitMode, injectHostCall]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        let msg: any;
        try {
          msg = JSON.parse(event.nativeEvent.data);
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object') return;

        if (msg.eventType === 'playerReady') {
          handlePlayerReadyFromHost();
          return;
        }

        if (msg.type === 'snapshot' && msg.requestId) {
          const resolver = pendingSnapshotResolversRef.current.get(msg.requestId);
          if (resolver) {
            pendingSnapshotResolversRef.current.delete(msg.requestId);
            resolver(msg as YoutubeEngineSnapshot);
          }
          return;
        }

        const store = useAudioStore.getState();
        if (store.activeEngine !== 'youtube') return;

        if (msg.eventType === 'playerError' || msg.type === 'ytError') {
          const errCode = Number(msg.data ?? msg.code ?? -1);
          const vid = store.currentTrack?.videoId;
          if (!vid) return;
          if ([100, 101, 150, 152, 153].includes(errCode)) {
            markVideoUnembeddable(vid);
          }
          beginTrackPlayerTransition(800);
          store
            .handlePlaybackFallback(vid, Math.floor(store.positionMillis / 1000))
            .catch(() => {});
          return;
        }

        if (msg.type === 'progress') {
          if (typeof msg.currentTime === 'number' && msg.currentTime >= 0) {
            const curMillis = Math.floor(msg.currentTime * 1000);
            const durMillis =
              typeof msg.duration === 'number' && msg.duration > 0
                ? Math.floor(msg.duration * 1000)
                : store.durationMillis;
            store.updateProgress(curMillis, durMillis);
          }
          return;
        }

        if (msg.type === 'remoteAction') {
          markBridgeCommandTimestamp();
          if (msg.action === 'play') {
            useAudioStore.setState({
              isPlaying: true,
              isUserPauseAction: false,
              isLoading: false,
              loadingTrackId: null,
            });
            store.resumeTrack().catch(() => {});
          } else if (msg.action === 'pause') {
            store.pauseTrack();
          } else if (msg.action === 'next') {
            store.nextTrack().catch(() => {});
          } else if (msg.action === 'previous') {
            store.prevTrack().catch(() => {});
          } else if (msg.action === 'seekto' && typeof msg.position === 'number') {
            store.seekTo(Math.floor(msg.position * 1000)).catch(() => {});
          }
          return;
        }

        if (msg.type === 'videoEvent') {
          const evName = msg.event;
          if (evName === 'playing' || evName === 'play') {
            if (store.isUserPauseAction || msg.userPaused === true) {
              pauseInEngine();
              return;
            }
            clearPendingPauseConfirm();
            const now = Date.now();
            if (now - lastDomPlaySyncRef.current < 150) return;
            lastDomPlaySyncRef.current = now;

            if (store.backgroundAudioEnabled) {
              startSilentBackgroundKeepAlive().catch(() => {});
            }
            if (typeof pendingSeekSecRef.current === 'number' && pendingSeekSecRef.current > 0) {
              const s = pendingSeekSecRef.current;
              pendingSeekSecRef.current = null;
              seekInEngine(s);
            }
            if (!store.isPlaying || store.isLoading) {
              useAudioStore.setState({
                isPlaying: true,
                isUserPauseAction: false,
                isLoading: false,
                loadingTrackId: null,
              });
            }
            if (typeof msg.duration === 'number' && msg.duration > 0) {
              store.updateProgress(
                Math.floor((msg.currentTime || 0) * 1000),
                Math.floor(msg.duration * 1000)
              );
            }
          } else if (evName === 'pause') {
            handleEnginePausedSignal();
          } else if (evName === 'ended') {
            const trackKey = `${store.currentTrack?.videoId || ''}_${Math.floor(
              (msg.duration || 0) * 1000
            )}`;
            if ((msg.duration || 0) > 2 && markTrackEndHandled(trackKey)) {
              store.handleTrackEnded().catch(() => {});
            }
          }
          return;
        }

        if (msg.eventType === 'playerStateChange' || msg.type === 'ytState') {
          const stateCode = Number(msg.eventType === 'playerStateChange' ? msg.data : msg.state);
          if (stateCode === 1) {
            if (store.isUserPauseAction) {
              pauseInEngine();
              return;
            }
            clearPendingPauseConfirm();
            if (typeof pendingSeekSecRef.current === 'number' && pendingSeekSecRef.current > 0) {
              const s = pendingSeekSecRef.current;
              pendingSeekSecRef.current = null;
              seekInEngine(s);
            }
            if (store.backgroundAudioEnabled) {
              startSilentBackgroundKeepAlive().catch(() => {});
            }
            const meta = buildTrackMeta(store.currentTrack);
            if (meta) syncMetadataInEngine(meta, true);

            useAudioStore.setState({
              isPlaying: true,
              isUserPauseAction: false,
              isLoading: false,
              loadingTrackId: null,
            });
            if (typeof msg.duration === 'number' && msg.duration > 0) {
              store.updateProgress(
                Math.floor((msg.currentTime || 0) * 1000),
                Math.floor(msg.duration * 1000)
              );
            }
          } else if (stateCode === 3) {
            if (store.isPlaying && !store.isUserPauseAction) {
              useAudioStore.setState({
                isLoading: true,
                loadingTrackId: store.currentTrack?.videoId || null,
              });
            }
          } else if (stateCode === 2) {
            handleEnginePausedSignal();
          } else if (stateCode === 0) {
            const curSec = Math.floor(store.positionMillis / 1000);
            const durSec = Math.floor(store.durationMillis / 1000);
            const trackKey = `${store.currentTrack?.videoId || ''}_${durSec}`;
            if ((curSec > 2 || durSec <= 2) && markTrackEndHandled(trackKey)) {
              store.handleTrackEnded().catch(() => {});
            }
          }
        }
      },
      [
        buildTrackMeta,
        clearPendingPauseConfirm,
        handleEnginePausedSignal,
        handlePlayerReadyFromHost,
        pauseInEngine,
        seekInEngine,
        syncMetadataInEngine,
      ]
    );

    const handleShouldStartLoadWithRequest = useCallback((request: any) => {
      try {
        const url = String(request?.mainDocumentURL || request?.url || '');
        if (!url || url === 'about:blank') return true;
        if (
          url.startsWith('https://lonelycpp.github.io/') ||
          url.startsWith('https://www.youtube.com/embed/') ||
          url.startsWith('https://www.youtube-nocookie.com/embed/') ||
          url.startsWith('https://accounts.google.com/')
        ) {
          return true;
        }
        return false;
      } catch {
        return true;
      }
    }, []);

    const handleStagePress = useCallback(() => {
      if (onVideoPress) {
        onVideoPress();
      } else {
        useAudioStore.getState().togglePlay().catch(() => {});
      }
    }, [onVideoPress]);

    const shouldShowVideoStage =
      Boolean(currentTrack?.videoId) &&
      (isVideoFullscreen || (isVideoVisible && isPlayerModalVisible));

    const isYoutubePlaybackActive =
      activeEngine === 'youtube' && Boolean(currentTrack?.videoId);

    const animatedFollowSheetStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateY:
            shouldShowVideoStage && !isVideoFullscreen
              ? (sheetTranslateY ? sheetTranslateY.value : playerModalTranslateY.value)
              : 0,
        },
      ],
    }));

    const outerWrapperStyle = isVideoFullscreen
      ? styles.fullscreenBackdrop
      : shouldShowVideoStage
        ? {
            position: 'absolute' as const,
            top: stageTop,
            left: stageLeft,
            width: stageWidth,
            height: stageHeight,
            borderRadius: 18,
            overflow: 'hidden' as const,
            zIndex: 100001,
            elevation: 20,
            backgroundColor: '#000000',
          }
        : styles.hiddenPrewarmContainer;

    const innerBoxStyle = isVideoFullscreen
      ? {
          width: fullscreenWidth,
          height: fullscreenHeight,
          overflow: 'hidden' as const,
          opacity: isYoutubePlaybackActive ? 1 : 0.01,
        }
      : [styles.visibleFill, !isYoutubePlaybackActive && shouldShowVideoStage && { opacity: 0.01 }];

    return (
      <Animated.View
        style={[outerWrapperStyle, animatedFollowSheetStyle]}
        pointerEvents={shouldShowVideoStage && !isVideoFullscreen ? 'auto' : 'none'}
      >
        <View style={innerBoxStyle} pointerEvents="none">
          {/* WebView remains at an invariant React tree position so cover/video/fullscreen toggles never remount it */}
          <NativeWebView
            key={remountKey}
            ref={webViewRef}
            source={{ uri: sourceUri }}
            style={styles.visibleFill}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsAirPlayForMediaPlayback
            allowsFullscreenVideo={false}
            scrollEnabled={false}
            bounces={false}
            mixedContentMode="always"
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            injectedJavaScriptBeforeContentLoaded={BEFORE_CONTENT_LOADED_SCRIPT}
            injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
            injectedJavaScript={ALL_FRAMES_BRIDGE_SCRIPT}
            injectedJavaScriptForMainFrameOnly={false}
            allowsPictureInPictureMediaPlayback={false}
            onLoadEnd={handleWebViewLoadEnd}
            onContentProcessDidTerminate={() => {
              const s = useAudioStore.getState();
              const curSec = Math.max(0, Math.floor(s.positionMillis / 1000));
              if (curSec > 0) pendingSeekSecRef.current = curSec;
              const vid = s.currentTrack?.videoId || '';
              lastLoadedVideoIdRef.current = null;
              playerReadyRef.current = false;
              webViewLoadedRef.current = false;
              setSourceUri(buildHostedPlayerUrl(vid));
              setRemountKey((k) => k + 1);
            }}
            onMessage={handleMessage}
            onError={() => {
              const s = useAudioStore.getState();
              if (s.currentTrack) {
                s.handlePlaybackFallback(
                  s.currentTrack.videoId,
                  Math.floor(s.positionMillis / 1000)
                ).catch(() => {});
              }
            }}
          />
        </View>
        {shouldShowVideoStage && isYoutubePlaybackActive && !isVideoFullscreen && (
          <>
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleStagePress}
              style={StyleSheet.absoluteFill}
            />
            {onEnterFullscreen && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onEnterFullscreen();
                }}
                style={styles.youtubeFullscreenBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="scan-outline" size={17} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </>
        )}
        {shouldShowVideoStage && !isYoutubePlaybackActive && (
          <View style={styles.videoNativeFallbackWrap}>
            <Ionicons name="musical-notes" size={32} color="#1DB954" />
            <Text style={styles.videoFallbackSubtitle}>Audio Mode Active</Text>
            {onSwitchToCover && (
              <TouchableOpacity
                style={styles.videoReturnCoverBtn}
                onPress={() => {
                  if (isVideoFullscreen) useAudioStore.getState().setVideoFullscreen(false);
                  onSwitchToCover();
                }}
              >
                <Text style={styles.videoReturnCoverBtnText}>Music</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
    );
  }
);

const styles = StyleSheet.create({
  visibleFill: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  fullscreenBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 100002,
    elevation: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenPrewarmContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 320,
    height: 180,
    opacity: 0.015,
    zIndex: -999,
    overflow: 'hidden',
  },
  youtubeFullscreenBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  videoNativeFallbackWrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 18, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  videoFallbackSubtitle: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
  videoReturnCoverBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  videoReturnCoverBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
