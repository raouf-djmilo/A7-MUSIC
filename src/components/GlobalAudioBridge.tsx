import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, NativeModules } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioStore, getLastUserToggleTimestamp } from '../store/useAudioStore';
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

// ── 🌐 Online YouTube IFrame Bridge (requires remote origin for YouTube API) ──
const YOUTUBE_HTML_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body, html { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; }
    #player { width:100%; height:100%; }
    audio { display:none; }
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
    var currentPlayingVideoId = '';

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
        height: '240',
        width: '320',
        playerVars: {
          controls: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          iv_load_policy: 3,
          autoplay: 0,
          enablejsapi: 1,
          fs: 0,
          origin: 'https://lonelycpp.github.io'
        },
        events: {
          onReady: function() {
            ytReady = true;
            sendToRN('playerReady', true);
          },
          onStateChange: function(event) {
            if (event.data === 1) { // Playing
              isSwitchingMedia = false;
            }
            if (activeEngine === 'youtube') {
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

    // Continuous Progress Reporter (every 350ms)
    setInterval(function() {
      try {
        if (isSwitchingMedia) return;
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
    }, 350);

    // Controller API
    window.playMedia = function(params) {
      isSwitchingMedia = true;
      var isDirectAudio = !!params.url && (
        params.url.indexOf('http') === 0 ||
        params.url.indexOf('.mp3') !== -1 ||
        params.url.indexOf('.m4a') !== -1 ||
        !params.videoId ||
        params.videoId.length !== 11
      );

      if (isDirectAudio) {
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
      } else if (params.videoId && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        activeEngine = 'youtube';
        try {
          html5Audio.pause();
          html5Audio.src = '';
        } catch(e) {}

        if (currentPlayingVideoId === params.videoId) {
          try { ytPlayer.playVideo(); } catch(e){}
          isSwitchingMedia = false;
        } else {
          currentPlayingVideoId = params.videoId;
          ytPlayer.loadVideoById({
            videoId: params.videoId,
            startSeconds: params.position || 0
          });
        }
      }
    };

    window.pauseMedia = function() {
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

    window.seekMedia = function(sec) {
      if (activeEngine === 'html5') {
        html5Audio.currentTime = sec;
      } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.seekTo === 'function') {
        try { ytPlayer.seekTo(sec, true); } catch(e){}
      }
    };

    window.stopMedia = function() {
      currentPlayingVideoId = '';
      if (activeEngine === 'html5') {
        html5Audio.pause();
        html5Audio.currentTime = 0;
      } else if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        try { ytPlayer.stopVideo(); } catch(e){}
      }
    };

    window.setQuality = function(q) {
      if (activeEngine === 'youtube' && ytPlayer && typeof ytPlayer.setPlaybackQuality === 'function') {
        try { ytPlayer.setPlaybackQuality(q); } catch(e){}
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
  <audio id="nativePlayer" playsinline preload="auto"></audio>

  <script>
    var audio = document.getElementById('nativePlayer');

    function sendToRN(type, data) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ eventType: type, data: data }));
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
      var err = audio.error;
      console.warn('[OfflineBridge] audio error:', err);
      sendToRN('playerError', err ? err.code : 404);
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
            sendToRN('playerError', 404);
          });
        }
      } catch(e) {
        console.warn('[OfflineBridge] Play exception:', e);
        sendToRN('playerError', 404);
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
        audio.currentTime = 0;
        audio.src = '';
      } catch(e){}
    };
  </script>
</body>
</html>
`;

export const GlobalAudioBridge: React.FC = () => {
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
        (action.url && (action.url.startsWith('file://') || action.url.includes('a7flow_download_music')))
      );

      if (action.type === 'play') {
        if (isOfflineTarget && action.url) {
          // Stop YouTube WebView player
          youtubeWebRef.current?.injectJavaScript('try { window.pauseMedia(); } catch(e) {} true;');

          // Play offline using high-performance native / local engine
          playOfflineTrack(action.url, action.position || 0);

        } else {
          currentEngine.current = 'youtube';
          // Stop native offline players
          releaseNativePlayers().catch(() => {});
          offlineWebRef.current?.injectJavaScript('try { window.pauseOffline(); } catch(e) {} true;');

          const payload = {
            videoId: action.videoId,
            url: action.url,
            position: typeof action.position === 'number' ? action.position : 0,
          };

          if (!isYtPlayerReady.current) {
            pendingYtAction.current = payload;
          } else {
            youtubeWebRef.current?.injectJavaScript(`try { window.playMedia(${JSON.stringify(payload)}); } catch(e) {} true;`);
          }
        }
      } else if (action.type === 'pause') {
        if (currentEngine.current === 'expo_video') {
          videoPlayerRef.current?.pause();
        } else if (currentEngine.current === 'av_offline') {
          avSoundRef.current?.pauseAsync().catch(() => {});
        } else if (currentEngine.current === 'webview_offline') {
          offlineWebRef.current?.injectJavaScript('try { window.pauseOffline(); } catch(e) {} true;');
        } else {
          youtubeWebRef.current?.injectJavaScript('try { window.pauseMedia(); } catch(e) {} true;');
        }
      } else if (action.type === 'resume') {
        if (currentEngine.current === 'expo_video') {
          videoPlayerRef.current?.play();
        } else if (currentEngine.current === 'av_offline') {
          avSoundRef.current?.playAsync().catch(() => {});
        } else if (currentEngine.current === 'webview_offline') {
          offlineWebRef.current?.injectJavaScript('try { window.resumeOffline(); } catch(e) {} true;');
        } else {
          youtubeWebRef.current?.injectJavaScript('try { window.resumeMedia(); } catch(e) {} true;');
        }
      } else if (action.type === 'seek') {
        if (typeof action.position === 'number') {
          if (currentEngine.current === 'expo_video') {
            try { videoPlayerRef.current.currentTime = action.position; } catch(e){}
          } else if (currentEngine.current === 'av_offline') {
            avSoundRef.current?.setPositionAsync(Math.round(action.position * 1000)).catch(() => {});
          } else if (currentEngine.current === 'webview_offline') {
            offlineWebRef.current?.injectJavaScript(`try { window.seekOffline(${action.position}); } catch(e) {} true;`);
          } else {
            youtubeWebRef.current?.injectJavaScript(`try { window.seekMedia(${action.position}); } catch(e) {} true;`);
          }
        }
      } else if (action.type === 'stop') {
        releaseNativePlayers().catch(() => {});
        offlineWebRef.current?.injectJavaScript('try { window.stopOffline(); } catch(e) {} true;');
        youtubeWebRef.current?.injectJavaScript('try { window.stopMedia(); } catch(e) {} true;');
      } else if (action.type === 'quality') {
        youtubeWebRef.current?.injectJavaScript(`try { window.setQuality("${action.quality || 'hd1080'}"); } catch(e) {} true;`);
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

      if (msg.eventType === 'playerReady') {
        isYtPlayerReady.current = true;
        if (pendingYtAction.current) {
          const payload = pendingYtAction.current;
          pendingYtAction.current = null;
          youtubeWebRef.current?.injectJavaScript(`try { window.playMedia(${JSON.stringify(payload)}); } catch(e) {} true;`);
        }
      } else if (msg.eventType === 'progressUpdate' && msg.data) {
        const now = Date.now();
        // Scrubber Lock: Guard against stale playback positions from previous track during transitions
        if (now - getLastUserToggleTimestamp() > 1500) {
          useAudioStore.getState().updateProgress(msg.data.positionMillis, msg.data.durationMillis);
        }
      } else if (msg.eventType === 'playerStateChange') {
        // State: 1 = Playing, 2 = Paused, 0 = Ended
        const now = Date.now();
        const timeSinceUserToggle = now - getLastUserToggleTimestamp();

        if (msg.data === 1) {
          consecutiveErrors.current = 0;
          const store = useAudioStore.getState();
          if (!store.isPlaying || store.isLoading) {
            useAudioStore.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
          }
        } else if (msg.data === 2) {
          if (timeSinceUserToggle > 1200) {
            const store = useAudioStore.getState();
            if (store.isPlaying) {
              useAudioStore.setState({ isPlaying: false });
            }
          }
        } else if (msg.data === 0) {
          const store = useAudioStore.getState();
          const pos = store.positionMillis;
          const dur = store.durationMillis;
          const isNearEnd = dur > 0 && pos >= Math.max(15000, dur - 8000);

          if (timeSinceUserToggle > 3000 && isNearEnd) {
            store.handleTrackEnded();
          } else {
            console.log('[GlobalAudioBridge] Filtered out premature/aborted ended event');
          }
        }
      } else if (msg.eventType === 'playerError') {
        const errCode = Number(msg.data);
        console.warn('[GlobalAudioBridge] Audio error code:', errCode);
        useAudioStore.setState({ isLoading: false, loadingTrackId: null });

        const now = Date.now();
        const timeSinceUserToggle = now - getLastUserToggleTimestamp();

        if (timeSinceUserToggle < 2000) {
          console.log('[GlobalAudioBridge] Ignored transition abort error:', errCode);
          return;
        }

        if (now - lastErrorTime.current > 2000) {
          lastErrorTime.current = now;
          consecutiveErrors.current += 1;

          if (errCode === 150 || errCode === 152 || errCode === 101 || errCode === 2 || errCode === 404) {
            ToastManager.show({
              title: 'تخطي مسار غير متاح',
              subtitle: 'جاري الانتقال للمسار التالي...',
              icon: 'alert-circle',
              duration: 1800,
            });
          }

          if (consecutiveErrors.current <= 3) {
            setTimeout(() => {
              useAudioStore.getState().nextTrack();
            }, 600);
          } else {
            useAudioStore.setState({ isPlaying: false, isLoading: false, loadingTrackId: null });
            consecutiveErrors.current = 0;
          }
        }
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  };

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      {/* ── 1. Online YouTube Player Bridge ── */}
      <WebView
        ref={youtubeWebRef}
        source={{
          html: YOUTUBE_HTML_CONTENT,
          baseUrl: 'https://lonelycpp.github.io',
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
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsProtectedMedia={true}
        androidLayerType="hardware"
        userAgent={
          Platform.OS === 'android'
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36'
            : undefined
        }
        style={styles.webView}
      />

      {/* ── 2. Pure Native Offline HTML5 Player Bridge (Loaded as local file:// for full filesystem access) ── */}
      <WebView
        ref={offlineWebRef}
        source={
          offlineHtmlReady
            ? { uri: `${FileSystem.documentDirectory}a7flow_offline_player.html` }
            : { html: OFFLINE_HTML_CONTENT, baseUrl: '' }
        }
        onMessage={handleMessage}
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
        style={styles.webView}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 64,
    height: 64,
    opacity: 0.001,
    zIndex: -999,
  },
  webView: {
    width: 64,
    height: 64,
    backgroundColor: '#000',
  },
});

export default GlobalAudioBridge;
