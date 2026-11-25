import React, { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const ShortWebView = WebView as any;

export interface YouTubeShortWebViewHandle {
  play: () => void;
  pause: () => void;
  pauseAndMute: () => void;
  replay: () => void;
  setMuted: (muted: boolean) => void;
}

interface YouTubeShortWebViewProps {
  videoId: string;
  play: boolean;
  muted: boolean;
  width: number;
  height: number;
  onStateChange?: (state: 'playing' | 'paused' | 'ended' | 'buffering' | 'unstarted') => void;
}

/**
 * Custom cropped WKWebView YouTube IFrame wrapper engineered specifically for Music Shorts:
 * - Zero YouTube title bar / "Watch on YouTube" chrome (clean 1.18x crop + pointer-events: none)
 * - Instant synchronous mute / unMute / setVolume JS execution (no postMessage race)
 * - Stays opacity: 0 behind the native poster Image until actual PLAYING frames start
 *   so YouTube's red Play button, gray pause icon, and end-screen boxes NEVER appear.
 */
export const YouTubeShortWebView = forwardRef<YouTubeShortWebViewHandle, YouTubeShortWebViewProps>(
  ({ videoId, play, muted, width, height, onStateChange }, ref) => {
    const webViewRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlayingFrames, setIsPlayingFrames] = useState(false);

    const playRef = useRef(play);
    const mutedRef = useRef(muted);
    const lastVideoIdRef = useRef(videoId);
    playRef.current = play;
    mutedRef.current = muted;

    const inject = (js: string) => {
      webViewRef.current?.injectJavaScript(`(function(){try{${js}}catch(e){}})();true;`);
    };

    const syncMuteJs = (m: boolean) =>
      m
        ? 'if(window.ytPlayer){window.ytPlayer.mute();window.ytPlayer.setVolume(0);}'
        : 'if(window.ytPlayer){window.ytPlayer.unMute();window.ytPlayer.setVolume(100);}';

    useImperativeHandle(ref, () => ({
      play: () => {
        inject('if(window.ytPlayer){window.ytPlayer.playVideo();}');
      },
      pause: () => {
        setIsPlayingFrames(false);
        inject('if(window.ytPlayer){window.ytPlayer.pauseVideo();}');
      },
      pauseAndMute: () => {
        setIsPlayingFrames(false);
        inject('if(window.ytPlayer){window.ytPlayer.mute();window.ytPlayer.setVolume(0);window.ytPlayer.pauseVideo();}');
      },
      replay: () => {
        inject('if(window.ytPlayer){window.ytPlayer.seekTo(0,true);window.ytPlayer.playVideo();}');
      },
      setMuted: (nextMuted: boolean) => {
        inject(syncMuteJs(nextMuted));
      },
    }));

    // Build initial HTML once per mount; video changes use fast loadVideoById()
    const htmlSource = useMemo(() => {
      const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
      const initMute = muted ? 1 : 0;
      const initPlay = play ? 1 : 0;
      return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;}
  #crop{position:fixed;inset:0;overflow:hidden;pointer-events:none;}
  #player{position:absolute;top:-12%;left:-8%;width:116%;height:124%;border:0;pointer-events:none;}
</style>
</head>
<body>
  <div id="crop"><div id="player"></div></div>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    var wantPlay=${initPlay};
    var wantMute=${initMute};
    function post(type,data){
      if(window.ReactNativeWebView){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:type,data:data}));
      }
    }
    function onYouTubeIframeAPIReady(){
      window.ytPlayer=new YT.Player('player',{
        videoId:'${safeId}',
        playerVars:{
          autoplay:wantPlay,
          controls:0,
          disablekb:1,
          fs:0,
          iv_load_policy:3,
          modestbranding:1,
          playsinline:1,
          rel:0,
          showinfo:0,
          mute:wantMute
        },
        events:{
          onReady:function(e){
            if(wantMute){e.target.mute();e.target.setVolume(0);}
            else{e.target.unMute();e.target.setVolume(100);}
            if(wantPlay){e.target.playVideo();}
            post('ready',true);
          },
          onStateChange:function(e){
            var map={'-1':'unstarted','0':'ended','1':'playing','2':'paused','3':'buffering'};
            post('state',map[String(e.data)]||'unstarted');
          }
        }
      });
    }
  </script>
</body>
</html>`;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Switch video cleanly without destroying WKWebView
    useEffect(() => {
      if (!isReady || lastVideoIdRef.current === videoId) return;
      lastVideoIdRef.current = videoId;
      setIsPlayingFrames(false);
      const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
      inject(
        `if(window.ytPlayer){` +
          syncMuteJs(mutedRef.current) +
          (playRef.current
            ? `window.ytPlayer.loadVideoById('${safeId}');`
            : `window.ytPlayer.cueVideoById('${safeId}');`) +
          `}`
      );
    }, [videoId, isReady]);

    // Sync play / pause immediately
    useEffect(() => {
      if (!isReady) return;
      if (play) {
        inject(`${syncMuteJs(mutedRef.current)}if(window.ytPlayer){window.ytPlayer.playVideo();}`);
      } else {
        setIsPlayingFrames(false);
        inject('if(window.ytPlayer){window.ytPlayer.pauseVideo();}');
      }
    }, [play, isReady]);

    // Sync mute / unMute immediately
    useEffect(() => {
      if (!isReady) return;
      inject(syncMuteJs(muted));
    }, [muted, isReady]);

    // Ensure zero audio leakage on unmount
    useEffect(() => {
      return () => {
        webViewRef.current?.injectJavaScript(
          '(function(){try{if(window.ytPlayer){window.ytPlayer.mute();window.ytPlayer.setVolume(0);window.ytPlayer.pauseVideo();}}catch(e){}})();true;'
        );
      };
    }, []);

    return (
      <View
        style={[
          styles.container,
          { width, height, opacity: isPlayingFrames && play ? 1 : 0 },
        ]}
        pointerEvents="none"
      >
        <ShortWebView
          ref={webViewRef}
          source={{ html: htmlSource, baseUrl: 'https://www.youtube.com' }}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          onMessage={(event: any) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === 'ready') {
                setIsReady(true);
                inject(syncMuteJs(mutedRef.current));
                if (playRef.current) {
                  inject('if(window.ytPlayer){window.ytPlayer.playVideo();}');
                }
              } else if (msg.type === 'state') {
                const st = msg.data as 'playing' | 'paused' | 'ended' | 'buffering' | 'unstarted';
                if (st === 'playing') {
                  setIsPlayingFrames(true);
                  inject(syncMuteJs(mutedRef.current));
                } else if (st === 'paused' || st === 'ended') {
                  setIsPlayingFrames(false);
                }
                onStateChange?.(st);
              }
            } catch {
              // Ignore non-JSON bridge events
            }
          }}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
