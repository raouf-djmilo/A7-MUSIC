import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, NativeModules } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioStore } from '../store/useAudioStore';

const OfflineWebView = WebView as any;

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

    audio.addEventListener('error', function() {
      if (!audio.src || audio.src === '' || audio.src === window.location.href || !audio.currentSrc) {
        return;
      }
      var err = audio.error;
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
          p.catch(function() {
            sendToRN('offlinePlayerError', 404);
          });
        }
      } catch(e) {
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

/**
 * Legacy Expo Go fallback bridge ONLY when TrackPlayerModule is absent.
 * In all production/native builds with TrackPlayerModule, this renders null so zero hidden WebViews compete for WebKit audio focus.
 */
export const GlobalAudioBridge: React.FC = () => {
  const hasNativeTrackPlayer = Boolean(NativeModules?.TrackPlayerModule);
  const offlineWebRef = useRef<any>(null);
  const [offlineHtmlReady, setOfflineHtmlReady] = useState<boolean>(false);
  const lastActionId = useRef<number>(0);
  const isOfflinePlayerReady = useRef<boolean>(false);
  const isActiveBridge = useRef<boolean>(false);
  const pendingOfflineAction = useRef<{ url: string; position: number } | null>(null);

  useEffect(() => {
    if (hasNativeTrackPlayer) return;
    let isMounted = true;
    const path = `${FileSystem.documentDirectory}a7flow_offline_player.html`;
    FileSystem.writeAsStringAsync(path, OFFLINE_HTML_CONTENT)
      .then(() => {
        if (isMounted) setOfflineHtmlReady(true);
      })
      .catch(() => {
        if (isMounted) setOfflineHtmlReady(true);
      });
    return () => {
      isMounted = false;
    };
  }, [hasNativeTrackPlayer]);

  useEffect(() => {
    if (hasNativeTrackPlayer) return;
    const unsubscribe = useAudioStore.subscribe((state) => {
      const action = state.audioEngineAction;
      if (!action || action.id === lastActionId.current) return;
      lastActionId.current = action.id;

      if (action.type === 'play' && state.activeEngine === 'native' && action.url) {
        // Fallback only used if nativeAudioService couldn't start
        return;
      }
      if (!isActiveBridge.current) return;

      if (action.type === 'pause' || action.type === 'stop') {
        offlineWebRef.current?.injectJavaScript('try { window.pauseOffline(); } catch(e) {} true;');
        if (action.type === 'stop') isActiveBridge.current = false;
      } else if (action.type === 'resume') {
        offlineWebRef.current?.injectJavaScript('try { window.resumeOffline(); } catch(e) {} true;');
      } else if (action.type === 'seek' && typeof action.position === 'number') {
        offlineWebRef.current?.injectJavaScript(`try { window.seekOffline(${action.position}); } catch(e) {} true;`);
      }
    });

    return () => unsubscribe();
  }, [hasNativeTrackPlayer]);

  if (hasNativeTrackPlayer) {
    return null;
  }

  const handleOfflineMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      const store = useAudioStore.getState();
      if (!isActiveBridge.current) return;

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
        isActiveBridge.current = false;
        useAudioStore.setState({ isLoading: false, loadingTrackId: null, isPlaying: false });
      }
    } catch {}
  };

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <OfflineWebView
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
            isActiveBridge.current = true;
            offlineWebRef.current?.injectJavaScript(
              `try { window.playOffline(${JSON.stringify(act.url)}, ${act.position || 0}); } catch(e) {} true;`
            );
          }
        }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowingReadAccessToURL={FileSystem.documentDirectory || undefined}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        originWhitelist={['*']}
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
