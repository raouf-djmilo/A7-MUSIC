import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAudioStore, getLastUserToggleTimestamp } from '../store/useAudioStore';
import { ToastManager } from './InAppToast';

const HTML_CONTENT = `
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

    function sendToRN(type, data) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ eventType: type, data: data }));
        }
      } catch(e) {}
    }

    // HTML5 Audio Events
    html5Audio.addEventListener('playing', function() {
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
      if (activeEngine === 'html5') {
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
      var isDirectAudio = !!params.url && (
        params.url.indexOf('http') === 0 ||
        params.url.indexOf('.mp3') !== -1 ||
        !params.videoId ||
        params.videoId.length !== 11
      );

      if (isDirectAudio) {
        activeEngine = 'html5';
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
        ytPlayer.loadVideoById({
          videoId: params.videoId,
          startSeconds: params.position || 0
        });
        ytPlayer.playVideo();
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

export const GlobalAudioBridge: React.FC = () => {
  const webRef = useRef<WebView>(null);
  const lastActionId = useRef<number>(0);
  const isPlayerReady = useRef<boolean>(false);
  const pendingAction = useRef<any>(null);
  const lastErrorTime = useRef<number>(0);
  const consecutiveErrors = useRef<number>(0);

  useEffect(() => {
    const unsubscribe = useAudioStore.subscribe((state) => {
      const action = state.audioEngineAction;
      if (!action || action.id === lastActionId.current) return;
      lastActionId.current = action.id;

      if (!webRef.current) return;

      if (action.type === 'play') {
        const payload = {
          videoId: action.videoId,
          url: action.url,
          position: typeof action.position === 'number' ? action.position : 0,
        };

        if (!isPlayerReady.current) {
          pendingAction.current = payload;
          return;
        }

        const js = `try { window.playMedia(${JSON.stringify(payload)}); } catch(e) {} true;`;
        webRef.current.injectJavaScript(js);
      } else if (action.type === 'pause') {
        webRef.current.injectJavaScript('try { window.pauseMedia(); } catch(e) {} true;');
      } else if (action.type === 'resume') {
        webRef.current.injectJavaScript('try { window.resumeMedia(); } catch(e) {} true;');
      } else if (action.type === 'seek') {
        if (typeof action.position === 'number') {
          webRef.current.injectJavaScript(`try { window.seekMedia(${action.position}); } catch(e) {} true;`);
        }
      } else if (action.type === 'stop') {
        webRef.current.injectJavaScript('try { window.stopMedia(); } catch(e) {} true;');
      } else if (action.type === 'quality') {
        webRef.current.injectJavaScript(`try { window.setQuality("${action.quality || 'hd1080'}"); } catch(e) {} true;`);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.eventType === 'playerReady') {
        isPlayerReady.current = true;
        if (pendingAction.current) {
          const payload = pendingAction.current;
          pendingAction.current = null;
          webRef.current?.injectJavaScript(`try { window.playMedia(${JSON.stringify(payload)}); } catch(e) {} true;`);
        }
      } else if (msg.eventType === 'progressUpdate' && msg.data) {
        const now = Date.now();
        // ── Scrubber Lock: Guard against stale playback positions from previous track ──
        if (now - getLastUserToggleTimestamp() > 500) {
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
          // ── Optimistic Lock: If user tapped Play within last 1000ms, ignore lagging paused events ──
          if (timeSinceUserToggle > 1000) {
            const store = useAudioStore.getState();
            if (store.isPlaying) {
              useAudioStore.setState({ isPlaying: false });
            }
          }
        } else if (msg.data === 0) {
          useAudioStore.getState().handleTrackEnded();
        }
      } else if (msg.eventType === 'playerError') {
        const errCode = Number(msg.data);
        console.warn('[GlobalAudioBridge] Audio error code:', errCode);
        useAudioStore.setState({ isLoading: false, loadingTrackId: null });

        const now = Date.now();
        if (now - lastErrorTime.current > 1000) {
          lastErrorTime.current = now;
          consecutiveErrors.current += 1;

          if (errCode === 150 || errCode === 152 || errCode === 101 || errCode === 2 || errCode === 404) {
            ToastManager.show({
              title: 'تخطي مسار مقيد',
              subtitle: 'جاري تشغيل المسار المتاح التالي تلقائياً...',
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
      <WebView
        ref={webRef}
        source={{
          html: HTML_CONTENT,
          baseUrl: 'https://lonelycpp.github.io',
        }}
        onMessage={handleMessage}
        onLoadEnd={() => {
          isPlayerReady.current = true;
          if (pendingAction.current) {
            const payload = pendingAction.current;
            pendingAction.current = null;
            webRef.current?.injectJavaScript(`try { window.playMedia(${JSON.stringify(payload)}); } catch(e) {} true;`);
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
