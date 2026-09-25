import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, NativeModules, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioStore, getLastUserToggleTimestamp, setLastUserToggleTimestamp } from '../store/useAudioStore';
import { ToastManager } from './InAppToast';

// ── Lazy safe getter for expo-av Audio module (checks NativeModules before requiring) ──
let _cachedAudio: any = undefined;
const getSafeAudio = (): any | null => {
  if (_cachedAudio !== undefined) return _cachedAudio;
  try {
    const hasExponentAV = !!(
      NativeModules?.ExponentAV ||
      (globalThis as any)?.expo?.modules?.ExponentAV ||
      (globalThis as any)?.__expo?.modules?.ExponentAV
    );
    if (!hasExponentAV) {
      _cachedAudio = null;
      return null;
    }
    const expoAv = require('expo-av');
    _cachedAudio = expoAv?.Audio ?? null;
    return _cachedAudio;
  } catch (e) {
    _cachedAudio = null;
    return null;
  }
};

// ── Lazy safe getter for expo-video player module (modern Expo SDK 57 player) ──
let _cachedCreateVideoPlayer: any = undefined;
const getSafeVideoPlayer = (): any | null => {
  if (_cachedCreateVideoPlayer !== undefined) return _cachedCreateVideoPlayer;
  try {
    const expoVideo = require('expo-video');
    if (expoVideo && typeof expoVideo.createVideoPlayer === 'function') {
      _cachedCreateVideoPlayer = expoVideo.createVideoPlayer;
      return _cachedCreateVideoPlayer;
    }
    _cachedCreateVideoPlayer = null;
    return null;
  } catch (e) {
    _cachedCreateVideoPlayer = null;
    return null;
  }
};

// ── 🛡️ Cross-Frame Deep Ad-Killer Script (Executed in main window + inside YouTube embed iframe) ──
const AD_KILLER_INJECTION_SCRIPT = `
(function() {
  // ⚡ Strict Discriminator Ad-Destroyer (Zero false-positives on actual songs)
  function destroyAds() {
    try {
      // 🛡️ STRICT DISCRIMINATOR: Only touch playback if explicit ad container is active
      var adWrapper = document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay, .ytp-ad-overlay-container, .ytp-ad-text');
      var video = document.querySelector('video');

      if (adWrapper && video) {
        video.muted = true;
        video.playbackRate = 16.0;
        if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
          video.currentTime = video.duration;
        }
      } else if (video && video.muted && !adWrapper) {
        video.muted = false;
        video.playbackRate = 1.0;
      }

      // Auto-click Skip button if present
      var skipSelectors = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button-text',
        '.videoAdUiSkipButton',
        'button.ytp-ad-skip-button-slot',
        '.ytp-ad-overlay-close-button'
      ];
      for (var i = 0; i < skipSelectors.length; i++) {
        var btn = document.querySelector(skipSelectors[i]);
        if (btn && typeof btn.click === 'function') {
          btn.click();
          break;
        }
      }

      // Hide static ad banners
      var overlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-message-container');
      for (var j = 0; j < overlays.length; j++) {
        overlays[j].style.display = 'none';
      }
    } catch(err) {}
  }

  // Event-Driven Ad-Killer via MutationObserver + 250ms Gentle Fallback
  try {
    if (window.MutationObserver) {
      var observer = new MutationObserver(function() {
        destroyAds();
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
  } catch(obsErr) {}

  setInterval(destroyAds, 250);
})();
true;
`;

// ── 🌐 Online YouTube IFrame Bridge (requires remote origin for YouTube API) ──
const YOUTUBE_HTML_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body, html { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; -webkit-user-select:none; user-select:none; }
    #player { width:100%; height:100%; position:absolute; top:0; left:0; }
    iframe { width:100% !important; height:100% !important; border:none; pointer-events:none; }
    audio { display:none; }

    /* 🛡️ Pristine Media Display - Hide YouTube Chrome, Watermarks, Cards, Related Videos */
    .ytp-chrome-top,
    .ytp-show-cards-title,
    .ytp-watermark,
    .ytp-pause-overlay,
    .ytp-scroll-min,
    .ytp-gradient-top,
    .ytp-gradient-bottom,
    .branding-img,
    .ytp-youtube-button,
    .ytp-title-link,
    .ytp-cards-teaser,
    .ytp-endscreen-content {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    video {
      object-fit: contain !important;
    }
  </style>
</head>
<body>
  <div id="player"></div>
  <audio id="html5Audio" playsinline preload="auto"></audio>

  <script>
    var activeEngine = 'none'; // 'html5' | 'youtube'
    var ytPlayer = null;
    var ytReady = false;
    var html5Audio = document.getElementById('html5Audio');
    var isSwitchingMedia = false;
    var hasStartedPlaying = false;
    var currentPlayingVideoId = '';
    var pendingPlayAction = null;

    function sendToRN(type, data) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ eventType: type, data: data }));
        }
      } catch(e) {}
    }

    // HTML5 Audio Events
    html5Audio.addEventListener('playing', function() {
      isSwitchingMedia = false;
      hasStartedPlaying = true;
      if (activeEngine === 'html5') {
        sendToRN('playerStateChange', 1); // 1 = Playing
      }
    });

    html5Audio.addEventListener('pause', function() {
      if (activeEngine === 'html5' && !html5Audio.ended) {
        sendToRN('playerStateChange', 2); // 2 = Paused
      }
    });

    html5Audio.addEventListener('ended', function() {
      if (activeEngine === 'html5' && !isSwitchingMedia) {
        sendToRN('playerStateChange', 0); // 0 = Ended
      }
    });

    html5Audio.addEventListener('error', function(e) {
      if (activeEngine === 'html5') {
        console.warn('HTML5 Audio error:', html5Audio.error);
        sendToRN('playerError', 404);
      }
    });

    // YouTube API Load
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = function() {
      ytPlayer = new YT.Player('player', {
        height: '100%',
        width: '100%',
        host: 'https://www.youtube.com',
        playerVars: {
          controls: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          iv_load_policy: 3,
          autoplay: 1,
          enablejsapi: 1,
          fs: 0,
          origin: 'https://lonelycpp.github.io'
        },
        events: {
          onReady: function() {
            ytReady = true;
            sendToRN('playerReady', true);
            if (pendingPlayAction) {
              var act = pendingPlayAction;
              pendingPlayAction = null;
              window.playMedia(act);
            }
          },
          onStateChange: function(event) {
            // event.data: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
            if (event.data === 1) { // Playing
              isSwitchingMedia = false;
              hasStartedPlaying = true;
            }
            if (activeEngine === 'youtube') {
              // 🛡️ CRITICAL GLITCH FIX: Suppress premature pause (2) during transition/buffering
              if (event.data === 2 && (isSwitchingMedia || !hasStartedPlaying)) {
                return;
              }
              // 🛡️ PREVENT AD-ENDED GHOST SKIP:
              // If an ad was showing, state 0 (ended) is the AD ending, not the song!
              if (event.data === 0) {
                var isAdActive = !!document.querySelector('.ad-showing, .ad-interrupting');
                if (isAdActive) {
                  return;
                }
              }
              sendToRN('playerStateChange', event.data);
            }
          },
          onError: function(event) {
            if (activeEngine === 'youtube') {
              sendToRN('playerError', event.data);
            }
          }
        }
      });
    };

    // 🛡️ Strict Ad-Killer Engine (Event-driven via MutationObserver + 250ms fallback)
    (function initAdKiller() {
      function killAds() {
        try {
          var adWrapper = document.querySelector('.ad-showing, .ad-interrupting');
          var video = document.querySelector('video');

          if (adWrapper && video) {
            // Instantly mute ad audio so user never hears ads
            video.muted = true;
            // Accelerate ad playback speed to 16x
            video.playbackRate = 16.0;
            // Seek directly to end of ad
            if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
              video.currentTime = video.duration;
            }
          } else if (video && video.muted && !adWrapper) {
            video.muted = false;
            video.playbackRate = 1.0;
          }

          // Auto-click any Skip Ad buttons
          var skipSelectors = [
            '.ytp-ad-skip-button',
            '.ytp-ad-skip-button-modern',
            '.ytp-skip-ad-button',
            '.ytp-ad-skip-button-text',
            '.videoAdUiSkipButton',
            'button.ytp-ad-skip-button-slot'
          ];
          for (var i = 0; i < skipSelectors.length; i++) {
            var btn = document.querySelector(skipSelectors[i]);
            if (btn && typeof btn.click === 'function') {
              btn.click();
              break;
            }
          }

          var overlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-message-container');
          for (var j = 0; j < overlays.length; j++) {
            overlays[j].style.display = 'none';
          }
        } catch(e) {}
      }

      try {
        if (window.MutationObserver) {
          var obs = new MutationObserver(killAds);
          obs.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
          });
        }
      } catch(e) {}

      setInterval(killAds, 250);
    })();

    // Continuous Progress Reporter (every 250ms for smooth timeline)
    setInterval(function() {
      try {
        if (isSwitchingMedia) return;
        // Suppress timeline jumps during transient ad-killing
        var isAdActive = !!document.querySelector('.ad-showing, .ad-interrupting');
        if (isAdActive) return;

        if (activeEngine === 'html5' && html5Audio) {
          var cur = html5Audio.currentTime || 0;
          var dur = html5Audio.duration || 0;
          if (dur > 0 && !isNaN(dur)) {
            sendToRN('progressUpdate', {
              positionMillis: Math.floor(cur * 1000),
              durationMillis: Math.floor(dur * 1000)
            });
          }
        } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
          var cur = ytPlayer.getCurrentTime() || 0;
          var dur = ytPlayer.getDuration() || 0;
          if (dur > 0 && !isNaN(dur)) {
            sendToRN('progressUpdate', {
              positionMillis: Math.floor(cur * 1000),
              durationMillis: Math.floor(dur * 1000)
            });
          }
        }
      } catch(e) {}
    }, 250);

    // ── 🛡️ Anti-Throttling Heartbeat & Buffer Stall Recovery Watchdog ──
    var bufferStallStart = 0;
    var consecutivePlayedCount = 0;

    setInterval(function() {
      try {
        if (ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
          var state = ytPlayer.getPlayerState();
          // State: 1 = Playing, 3 = Buffering, 2 = Paused
          if (state === 1) {
            bufferStallStart = 0;
            // Keep AudioContext awake if suspended by Android Doze Mode
            if (typeof window.AudioContext !== 'undefined' && window._audioCtx && window._audioCtx.state === 'suspended') {
              try { window._audioCtx.resume(); } catch(e){}
            }
          } else if (state === 3) {
            // Buffer freeze detector (> 6 seconds)
            if (!bufferStallStart) {
              bufferStallStart = Date.now();
            } else if (Date.now() - bufferStallStart > 6000) {
              console.log('[Heartbeat Watchdog] Buffer stall detected > 6s. Re-triggering playback...');
              bufferStallStart = 0;
              try { ytPlayer.playVideo(); } catch(e){}
            }
          } else {
            bufferStallStart = 0;
          }
        }
      } catch(e) {}
    }, 5000);

    // Controller API
    window.playMedia = function(params) {
      consecutivePlayedCount++;
      if (consecutivePlayedCount >= 20) {
        consecutivePlayedCount = 0;
        try {
          if (html5Audio && activeEngine !== 'html5') {
            html5Audio.src = '';
            html5Audio.load();
          }
        } catch(e){}
      }
      // 🛡️ WebKit Security Guard: Never attempt to load local file:// inside https:// WebView
      if (params.url && (params.url.indexOf('file://') === 0 || params.url.indexOf('temp_stream_') !== -1 || params.url.indexOf('a7flow_download') !== -1)) {
        window.stopMedia();
        return;
      }
      var hasValidVideoId = !!(params.videoId && typeof params.videoId === 'string' && params.videoId.trim().length === 11);

      if (hasValidVideoId) {
        activeEngine = 'youtube';
        try {
          html5Audio.pause();
          html5Audio.src = '';
        } catch(e) {}

        if (!ytPlayer || typeof ytPlayer.loadVideoById !== 'function') {
          pendingPlayAction = params;
          return;
        }

        isSwitchingMedia = true;
        hasStartedPlaying = false;

        if (currentPlayingVideoId === params.videoId) {
          try { 
            if (typeof params.position === 'number' && params.position > 0) {
              ytPlayer.seekTo(params.position, true);
            }
            ytPlayer.playVideo(); 
            isSwitchingMedia = false;
            hasStartedPlaying = true;
          } catch(e){}
        } else {
          currentPlayingVideoId = params.videoId;
          ytPlayer.loadVideoById({
            videoId: params.videoId,
            startSeconds: params.position || 0,
            suggestedQuality: 'default'
          });
          try { ytPlayer.playVideo(); } catch(e){}
        }
      } else if (params.url && (params.url.indexOf('.mp3') !== -1 || params.url.indexOf('.m4a') !== -1 || params.url.indexOf('http') === 0)) {
        isSwitchingMedia = true;
        hasStartedPlaying = false;
        activeEngine = 'html5';
        currentPlayingVideoId = '';
        if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
          try { ytPlayer.pauseVideo(); } catch(e){}
        }
        if (html5Audio.src !== params.url) {
          html5Audio.src = params.url;
        }
        if (typeof params.position === 'number' && params.position > 0) {
          html5Audio.currentTime = params.position;
        }
        var p = html5Audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function(err) {
            console.warn('HTML5 Play Error:', err);
          });
        }
      }
    };

    window.pauseMedia = function() {
      isSwitchingMedia = false;
      if (activeEngine === 'html5') {
        html5Audio.pause();
      } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        try { ytPlayer.pauseVideo(); } catch(e){}
      }
    };

    window.resumeMedia = function() {
      if (activeEngine === 'html5') {
        var p = html5Audio.play();
        if (p && typeof p.catch === 'function') p.catch(function(){});
      } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        try { ytPlayer.playVideo(); } catch(e){}
      }
    };

    window.cueOrPrepareMedia = function(videoId, positionSec) {
      activeEngine = 'youtube';
      currentPlayingVideoId = videoId;
      var pos = (typeof positionSec === 'number' && positionSec >= 0) ? positionSec : 0;
      if (ytPlayer && typeof ytPlayer.cueVideoById === 'function') {
        try {
          ytPlayer.cueVideoById({
            videoId: videoId,
            startSeconds: pos,
            suggestedQuality: 'default'
          });
        } catch(e){}
      }
    };

    window.handoverFromVideo = function(videoId, positionSec, shouldPlay) {
      activeEngine = 'youtube';
      isSwitchingMedia = true;
      hasStartedPlaying = false;
      var pos = (typeof positionSec === 'number' && positionSec >= 0) ? positionSec : 0;

      if (!ytPlayer || typeof ytPlayer.loadVideoById !== 'function') {
        pendingPlayAction = { videoId: videoId, position: pos };
        return;
      }

      if (currentPlayingVideoId !== videoId) {
        currentPlayingVideoId = videoId;
        ytPlayer.loadVideoById({
          videoId: videoId,
          startSeconds: pos,
          suggestedQuality: 'default'
        });
        if (shouldPlay) {
          try { ytPlayer.playVideo(); } catch(e){}
        } else {
          try { ytPlayer.pauseVideo(); } catch(e){}
        }
      } else {
        try {
          ytPlayer.seekTo(pos, true);
          if (shouldPlay) {
            ytPlayer.playVideo();
          } else {
            ytPlayer.pauseVideo();
          }
        } catch(e) {
          try {
            ytPlayer.loadVideoById({
              videoId: videoId,
              startSeconds: pos,
              suggestedQuality: 'default'
            });
            if (shouldPlay) ytPlayer.playVideo();
          } catch(e2){}
        }
      }

      setTimeout(function() {
        isSwitchingMedia = false;
        hasStartedPlaying = true;
      }, 600);
    };

    window.seekMedia = function(sec) {
      if (activeEngine === 'html5') {
        html5Audio.currentTime = sec;
      } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.seekTo === 'function') {
        try { ytPlayer.seekTo(sec, true); } catch(e){}
      }
    };

    window.stopMedia = function() {
      currentPlayingVideoId = '';
      isSwitchingMedia = false;
      hasStartedPlaying = false;
      activeEngine = 'none';
      try {
        if (html5Audio) {
          html5Audio.pause();
          html5Audio.src = '';
          html5Audio.currentTime = 0;
        }
      } catch(e) {}
      try {
        if (ytPlayer) {
          if (typeof ytPlayer.stopVideo === 'function') {
            try { ytPlayer.stopVideo(); } catch(e){}
          }
          if (typeof ytPlayer.pauseVideo === 'function') {
            try { ytPlayer.pauseVideo(); } catch(e){}
          }
        }
      } catch(e) {}
      try {
        var allVideos = document.querySelectorAll('video');
        for (var i = 0; i < allVideos.length; i++) {
          allVideos[i].pause();
          allVideos[i].muted = true;
          allVideos[i].currentTime = 0;
        }
      } catch(e) {}
    };

    window.setQuality = function(q) {
      if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.setPlaybackQuality === 'function') {
        try { ytPlayer.setPlaybackQuality(q || 'hd720'); } catch(e){}
      }
    };
  </script>
</body>
</html>
`;

// ── 📱 Pure Native Offline HTML5 Audio Bridge (Fallback memory player for data: URLs) ──
const OFFLINE_HTML_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body, html { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; }
    audio { display:none; }
  </style>
</head>
<body>
  <audio id="nativePlayer" playsinline preload="none"></audio>

  <script>
    var audio = document.getElementById('nativePlayer');

    function sendToRN(type, data) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ source: 'offline_webview', eventType: type, data: data }));
        }
      } catch(e) {}
    }

    audio.addEventListener('playing', function() {
      sendToRN('playerStateChange', 1);
    });

    audio.addEventListener('pause', function() {
      if (!audio.ended) {
        sendToRN('playerStateChange', 2);
      }
    });

    audio.addEventListener('ended', function() {
      sendToRN('playerStateChange', 0);
    });

    audio.addEventListener('error', function(e) {
      if (!audio.src || audio.src === '' || audio.src === window.location.href || !audio.currentSrc) {
        return;
      }
      var err = audio.error;
      console.warn('[OfflineBridge] audio error:', err);
      sendToRN('offlinePlayerError', err ? err.code : 404);
    });

    setInterval(function() {
      if (audio && !audio.paused) {
        var cur = audio.currentTime || 0;
        var dur = audio.duration || 0;
        if (dur > 0 && !isNaN(dur)) {
          sendToRN('progressUpdate', {
            positionMillis: Math.floor(cur * 1000),
            durationMillis: Math.floor(dur * 1000)
          });
        }
      }
    }, 350);

    window.playOffline = function(url, pos) {
      try {
        if (audio.src !== url) {
          audio.src = url;
        }
        if (typeof pos === 'number' && pos > 0) {
          audio.currentTime = pos;
        }
        var p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function(err) {
            console.warn('[OfflineBridge] Play error catch:', err);
            sendToRN('offlinePlayerError', 404);
          });
        }
      } catch(e) {
        console.warn('[OfflineBridge] Play exception:', e);
        sendToRN('offlinePlayerError', 404);
      }
    };

    window.pauseOffline = function() {
      try { audio.pause(); } catch(e){}
    };

    window.resumeOffline = function() {
      try {
        var p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(function(){});
      } catch(e){}
    };

    window.seekOffline = function(sec) {
      try { audio.currentTime = sec; } catch(e){}
    };

    window.stopOffline = function() {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch(e){}
    };
  </script>
</body>
</html>
`;

export const GlobalAudioBridge: React.FC = () => {
  const isPlayerModalVisible = useAudioStore((s) => s.isPlayerModalVisible);
  const playerMediaMode = useAudioStore((s) => s.playerMediaMode);
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const activeEngine = useAudioStore((s) => s.activeEngine);

  const youtubeWebRef = useRef<WebView>(null);
  const offlineWebRef = useRef<WebView>(null);
  const videoPlayerRef = useRef<any>(null);
  const avSoundRef = useRef<any>(null);
  const [offlineHtmlReady, setOfflineHtmlReady] = useState<boolean>(false);
  const lastActionId = useRef<number>(0);
  const isYtPlayerReady = useRef<boolean>(false);
  const isOfflinePlayerReady = useRef<boolean>(false);
  const pendingYtAction = useRef<any>(null);
  const pendingOfflineAction = useRef<any>(null);
  const currentEngine = useRef<'youtube' | 'expo_video' | 'av_offline' | 'webview_offline' | 'none'>('none');
  const lastErrorTime = useRef<number>(0);
  const consecutiveErrors = useRef<number>(0);
  const lastHandoverTimeRef = useRef<number>(0);

  // ── Setup offline player HTML file on disk once (allows direct file:// playback in WKWebView) ──
  useEffect(() => {
    let isMounted = true;
    const initHtml = async () => {
      try {
        const path = `${FileSystem.documentDirectory}a7flow_offline_player.html`;
        await FileSystem.writeAsStringAsync(path, OFFLINE_HTML_CONTENT);
        if (isMounted) setOfflineHtmlReady(true);
      } catch (e) {
        if (isMounted) setOfflineHtmlReady(true);
      }
    };
    initHtml();
    return () => { isMounted = false; };
  }, []);

  // ── Release previous native players to free memory and prevent overlaps ──
  const releaseNativePlayers = async () => {
    if (videoPlayerRef.current) {
      try {
        videoPlayerRef.current.pause();
        if (typeof videoPlayerRef.current.release === 'function') {
          videoPlayerRef.current.release();
        }
      } catch (e) {}
      videoPlayerRef.current = null;
    }
    if (avSoundRef.current) {
      try {
        await avSoundRef.current.stopAsync();
        await avSoundRef.current.unloadAsync();
      } catch (e) {}
      avSoundRef.current = null;
    }
  };

  // ── Multi-Tier Offline Playback Architecture ──
  const playOfflineTrack = async (fileUri: string, startPosSec: number) => {
    // 1. Try modern expo-video player (Expo SDK 57 official media engine)
    const createPlayer = getSafeVideoPlayer();
    if (createPlayer) {
      try {
        await releaseNativePlayers();
        currentEngine.current = 'expo_video';
        console.log('[ExpoVideoOffline] ⚡ Playing local audio with expo-video:', fileUri);

        const player = createPlayer({ uri: fileUri });
        player.timeUpdateEventInterval = 0.35;
        if (typeof startPosSec === 'number' && startPosSec > 0) {
          player.currentTime = startPosSec;
        }
        player.play();

        player.addListener('playingChange', (payload: any) => {
          const isPlaying = !!payload?.isPlaying;
          useAudioStore.setState({ isPlaying, isLoading: false, loadingTrackId: null });
        });

        player.addListener('timeUpdate', (payload: any) => {
          const curSec = typeof payload?.currentTime === 'number' ? payload.currentTime : (player.currentTime || 0);
          const durSec = typeof player.duration === 'number' ? player.duration : 0;
          if (durSec > 0) {
            useAudioStore.getState().updateProgress(
              Math.round(curSec * 1000),
              Math.round(durSec * 1000)
            );
          }
        });

        player.addListener('playToEnd', () => {
          console.log('[ExpoVideoOffline] Track playback ended');
          useAudioStore.getState().handleTrackEnded();
        });

        player.addListener('statusChange', (payload: any) => {
          if (payload?.status === 'error' || payload?.error) {
            console.warn('[ExpoVideoOffline] Error:', payload.error);
            playWithWebViewOffline(fileUri, startPosSec);
          }
        });

        videoPlayerRef.current = player;
        return;
      } catch (e) {
        console.warn('[ExpoVideoOffline] createVideoPlayer failed, trying fallback:', e);
      }
    }

    // 2. Try expo-av if ExponentAV native module exists
    const Audio = getSafeAudio();
    if (Audio) {
      try {
        await releaseNativePlayers();
        currentEngine.current = 'av_offline';
        console.log('[AvOffline] ⚡ Playing with expo-av:', fileUri);
        const { sound } = await Audio.Sound.createAsync(
          { uri: fileUri },
          {
            shouldPlay: true,
            positionMillis: Math.round(startPosSec * 1000),
            progressUpdateIntervalMillis: 350,
          },
          (playbackStatus: any) => {
            if (!playbackStatus.isLoaded) {
              if (playbackStatus.error) {
                playWithWebViewOffline(fileUri, startPosSec);
              }
              return;
            }
            if (playbackStatus.isPlaying) {
              useAudioStore.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
            } else if (!playbackStatus.isPlaying && !playbackStatus.didJustFinish) {
              const timeSinceToggle = Date.now() - getLastUserToggleTimestamp();
              if (timeSinceToggle > 1200) {
                useAudioStore.setState({ isPlaying: false });
              }
            }
            if ((playbackStatus.durationMillis || 0) > 0) {
              useAudioStore.getState().updateProgress(
                playbackStatus.positionMillis || 0,
                playbackStatus.durationMillis || 0
              );
            }
            if (playbackStatus.didJustFinish) {
              useAudioStore.getState().handleTrackEnded();
            }
          }
        );
        avSoundRef.current = sound;
        return;
      } catch (err) {
        console.warn('[AvOffline] expo-av failed, trying WebView offline player:', err);
      }
    }

    // 3. Fallback: Pure Native HTML5 Offline Player loaded directly inside local file sandbox
    playWithWebViewOffline(fileUri, startPosSec);
  };

  const playWithWebViewOffline = (fileUri: string, startPos: number) => {
    currentEngine.current = 'webview_offline';
    console.log('[WebViewOffline] ⚡ Playing local file in WebView player:', fileUri);

    if (!isOfflinePlayerReady.current) {
      pendingOfflineAction.current = { url: fileUri, position: startPos };
    } else {
      offlineWebRef.current?.injectJavaScript(
        `try { window.playOffline(${JSON.stringify(fileUri)}, ${startPos}); } catch(e) {} true;`
      );
    }
  };

  useEffect(() => {
    const unsubscribe = useAudioStore.subscribe((state) => {
      const action = state.audioEngineAction;
      if (!action || action.id === lastActionId.current) return;
      lastActionId.current = action.id;

      const isOfflineTarget = !!(
        action.isOfflinePlayback ||
        (action.url && (action.url.startsWith('file://') || action.url.includes('a7flow_download_music') || action.url.includes('temp_stream_')))
      );

      if (action.type === 'play') {
        if (state.activeEngine === 'native' || isOfflineTarget || (action.url && action.url.startsWith('file://'))) {
          // Native / offline playback handled by nativeAudioService or offlineWebRef
          youtubeWebRef.current?.injectJavaScript(`try { window.stopMedia(); } catch(e) {} true;`);
          return;
        }

        // Online YouTube audio is natively & synchronously handled by UnifiedPlayerSheet's persistent YoutubePlayer
        youtubeWebRef.current?.injectJavaScript(`try { window.stopMedia(); } catch(e) {} true;`);
        releaseNativePlayers().catch(() => {});
        offlineWebRef.current?.injectJavaScript('try { window.pauseOffline(); } catch(e) {} true;');
        return;
      } else if (action.type === 'pause') {
        if (currentEngine.current === 'expo_video') {
          videoPlayerRef.current?.pause();
        } else if (currentEngine.current === 'av_offline') {
          avSoundRef.current?.pauseAsync().catch(() => {});
        } else if (currentEngine.current === 'webview_offline') {
          offlineWebRef.current?.injectJavaScript('try { window.pauseOffline(); } catch(e) {} true;');
        }
      } else if (action.type === 'resume') {
        if (currentEngine.current === 'expo_video') {
          videoPlayerRef.current?.play();
        } else if (currentEngine.current === 'av_offline') {
          avSoundRef.current?.playAsync().catch(() => {});
        } else if (currentEngine.current === 'webview_offline') {
          offlineWebRef.current?.injectJavaScript('try { window.resumeOffline(); } catch(e) {} true;');
        }
      } else if (action.type === 'seek') {
        if (typeof action.position === 'number') {
          if (currentEngine.current === 'expo_video') {
            try { videoPlayerRef.current.currentTime = action.position; } catch(e){}
          } else if (currentEngine.current === 'av_offline') {
            avSoundRef.current?.setPositionAsync(Math.round(action.position * 1000)).catch(() => {});
          } else if (currentEngine.current === 'webview_offline') {
            offlineWebRef.current?.injectJavaScript(`try { window.seekOffline(${action.position}); } catch(e) {} true;`);
          }
        }
      } else if (action.type === 'stop') {
        releaseNativePlayers().catch(() => {});
        offlineWebRef.current?.injectJavaScript('try { window.stopOffline(); } catch(e) {} true;');
        youtubeWebRef.current?.injectJavaScript('try { window.stopMedia(); } catch(e) {} true;');
      } else if (action.type === 'quality') {
        youtubeWebRef.current?.injectJavaScript(`try { window.setQuality("${action.quality || 'hd1080'}"); } catch(e) {} true;`);
      } else if (action.type === 'handover_from_video') {
        currentEngine.current = 'youtube';
        lastHandoverTimeRef.current = Date.now();
        setLastUserToggleTimestamp(Date.now());
        const vid = action.videoId || state.currentTrack?.videoId;
        const posSec = typeof action.position === 'number' ? action.position : Math.max(0, Math.floor(state.positionMillis / 1000));
        const shouldPlay = state.isPlaying;
        if (vid) {
          youtubeWebRef.current?.injectJavaScript(`
            try {
              window.handoverFromVideo(${JSON.stringify(vid)}, ${posSec}, ${shouldPlay});
            } catch(e) {}
            true;
          `);
        }
      } else if (action.type === 'pause_bridge') {
        youtubeWebRef.current?.injectJavaScript('try { window.pauseMedia(); } catch(e){} true;');
      } else if (action.type === 'resume_bridge') {
        youtubeWebRef.current?.injectJavaScript('try { window.resumeMedia(); } catch(e){} true;');
      }
    });

    return () => {
      unsubscribe();
      releaseNativePlayers().catch(() => {});
    };
  }, []);

  const handleMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      const store = useAudioStore.getState();

      if (msg.eventType === 'playerReady') {
        isYtPlayerReady.current = true;
        if (pendingYtAction.current) {
          const payload = pendingYtAction.current;
          pendingYtAction.current = null;
          youtubeWebRef.current?.injectJavaScript(`try { window.playMedia(${JSON.stringify(payload)}); } catch(e) {} true;`);
        }
      } else if (msg.eventType === 'progressUpdate' && msg.data) {
        // Online YouTube playback and progress is exclusively managed by UnifiedPlayerSheet
        if (store.activeEngine === 'youtube' || store.activeEngine === 'native') return;
        if (typeof msg.data.positionMillis === 'number' && msg.data.positionMillis >= 0) {
          store.updateProgress(msg.data.positionMillis, msg.data.durationMillis || store.durationMillis);
        }
      } else if (msg.eventType === 'playerStateChange') {
        // Online YouTube playback state is exclusively managed by UnifiedPlayerSheet
        if (store.activeEngine === 'youtube' || store.activeEngine === 'native') return;
        // State: 1 = Playing, 2 = Paused, 0 = Ended
        const now = Date.now();
        const timeSinceUserToggle = now - getLastUserToggleTimestamp();
        const isDuringHandover = (now - lastHandoverTimeRef.current) < 2500;

        if (msg.data === 1) {
          consecutiveErrors.current = 0;
          if (!store.isPlaying || store.isLoading) {
            useAudioStore.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
          }
        } else if (msg.data === 2) {
          if (!isDuringHandover && timeSinceUserToggle > 2500 && store.isPlaying && !store.isLoading) {
            useAudioStore.setState({ isPlaying: false });
          }
        } else if (msg.data === 0) {
          const pos = store.positionMillis;
          const dur = store.durationMillis;
          // 🛡️ False-Positive Track-End Guard:
          // Song must have played past at least 15 seconds AND be near completion (> 75% or within 8s of end).
          // If ended fires in the first seconds, an ad clip ended, NOT the song!
          const isRealEnd = dur > 30000 
            ? (pos >= Math.max(15000, dur - 8000) && pos >= dur * 0.75) 
            : (pos > 5000);

          if (timeSinceUserToggle > 3000 && isRealEnd) {
            store.handleTrackEnded();
          } else {
            console.log('[GlobalAudioBridge] Filtered out premature/ad-ended event (pos:', pos, 'dur:', dur, ')');
          }
        }
      } else if (msg.eventType === 'playerError') {
        const errCode = Number(msg.data);

        // 🛡️ SPURIOUS CODE GUARD:
        // Filter out code 4 (HTML5 media error) or invalid codes that do not belong to YouTube API
        if (errCode === 4 || isNaN(errCode)) {
          console.log('[GlobalAudioBridge] 🔇 Filtered out non-YouTube playerError code:', errCode);
          return;
        }

        // 🛡️ SILENCE GUARD: If activeEngine is already 'native' or fallback transition in progress,
        // strictly ignore all WebView errors (e.g. Error 4 / Error 152 cascades)
        if (store.activeEngine === 'native' || store.isSwitchingToFallback) {
          console.log('[GlobalAudioBridge] 🔇 Ignored playerError code', errCode, 'because engine is already native');
          return;
        }

        console.warn('[GlobalAudioBridge] Audio error code:', errCode, '— Activating Native Direct Stream Fallback...');
        useAudioStore.setState({ isLoading: false, loadingTrackId: null });

        // Immediately silence WebView and destroy its media
        youtubeWebRef.current?.injectJavaScript(`try { window.stopMedia(); } catch(e){} true;`);

        // 🛡️ Immediate Native Audio Stream Fallback:
        // Never swallow error 152/150 or loop in silence. Immediately switch to Native TrackPlayer direct stream!
        store.handlePlaybackFallback();
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  };

  const handleOfflineMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      const store = useAudioStore.getState();
      if (currentEngine.current !== 'webview_offline') return;

      if (msg.eventType === 'playerStateChange') {
        if (msg.data === 1) {
          useAudioStore.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
        } else if (msg.data === 2) {
          useAudioStore.setState({ isPlaying: false });
        } else if (msg.data === 0) {
          store.handleTrackEnded();
        }
      } else if (msg.eventType === 'progressUpdate' && msg.data) {
        store.updateProgress(msg.data.positionMillis, msg.data.durationMillis);
      } else if (msg.eventType === 'offlinePlayerError') {
        console.warn('[OfflineBridge] Offline playback error code:', msg.data);
        useAudioStore.setState({ isLoading: false, loadingTrackId: null, isPlaying: false });
      }
    } catch (e) {}
  };



  // ── Background Audio Continuity: Handled natively by UnifiedPlayerSheet ──

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      {/* ── 1. Online YouTube Audio Bridge (Always strictly hidden, zero-touch interference) ── */}
      <WebView
        ref={youtubeWebRef}
        source={{
          html: YOUTUBE_HTML_CONTENT,
          baseUrl: 'https://lonelycpp.github.io/react-native-youtube-iframe/iframe_v2.html',
        }}
        onMessage={handleMessage}
        onLoadEnd={() => {
          isYtPlayerReady.current = true;
          if (pendingYtAction.current) {
            const payload = pendingYtAction.current;
            pendingYtAction.current = null;
            youtubeWebRef.current?.injectJavaScript(`try { window.playMedia(${JSON.stringify(payload)}); } catch(e) {} true;`);
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          const url = (request.url || '').toLowerCase();
          // 🛡️ Explicit Media Allowlist: Never block audio or media stream chunks
          if (
            url.includes('videoplayback') ||
            url.includes('initplayback') ||
            url.includes('googlevideo') ||
            url.includes('/player')
          ) {
            return true;
          }
          // 🛡️ Block Google Ads, DoubleClick, Pagead, and Ad Tracking networks
          if (
            url.includes('googleads') ||
            url.includes('doubleclick.net') ||
            url.includes('pagead2.googlesyndication.com') ||
            url.includes('/pagead/') ||
            url.includes('/api/stats/ads') ||
            url.includes('adservice.google') ||
            url.includes('youtube.com/pagead')
          ) {
            return false;
          }
          return true;
        }}
        cacheEnabled={true}
        injectedJavaScriptBeforeContentLoaded={AD_KILLER_INJECTION_SCRIPT}
        injectedJavaScript={AD_KILLER_INJECTION_SCRIPT}
        injectedJavaScriptForMainFrameOnly={false}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsProtectedMedia={true}
        androidLayerType="hardware"
        userAgent={Platform.OS === 'android' ? "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Mobile Safari/537.36" : undefined}
        style={styles.hiddenWebView}
      />

      {/* ── 2. Pure Native Offline HTML5 Player Bridge ── */}
      <WebView
        ref={offlineWebRef}
        source={
          offlineHtmlReady
            ? { uri: `${FileSystem.documentDirectory}a7flow_offline_player.html` }
            : { html: OFFLINE_HTML_CONTENT, baseUrl: '' }
        }
        onMessage={handleOfflineMessage}
        onLoadEnd={() => {
          isOfflinePlayerReady.current = true;
          if (pendingOfflineAction.current) {
            const act = pendingOfflineAction.current;
            pendingOfflineAction.current = null;
            offlineWebRef.current?.injectJavaScript(
              `try { window.playOffline(${JSON.stringify(act.url)}, ${act.position || 0}); } catch(e) {} true;`
            );
          }
        }}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        allowingReadAccessToURL={FileSystem.documentDirectory || undefined}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        style={styles.hiddenWebView}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
    zIndex: -1000,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
    backgroundColor: '#000',
  },
});

export default GlobalAudioBridge;
