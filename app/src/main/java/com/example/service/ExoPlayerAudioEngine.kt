package com.example.service

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import com.example.model.Track
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * ExoPlayerAudioEngine:
 * High-performance, native AndroidX Media3 ExoPlayer engine.
 * Guarantees hardware-accelerated audio streaming, direct buffering, lock-screen controls,
 * and background resilience without WebViews or Chromium overhead.
 */
@androidx.annotation.OptIn(UnstableApi::class)
class ExoPlayerAudioEngine(private val context: Context) : CorePlayerEngine {

    private val logTag = "ExoPlayerAudioEngine"
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(Dispatchers.Main + Job())

    val exoPlayer: ExoPlayer
    val mediaSession: MediaSession

    private val _isPlaying = MutableStateFlow(false)
    override val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _isBuffering = MutableStateFlow(false)
    override val isBuffering: StateFlow<Boolean> = _isBuffering.asStateFlow()

    private val _currentPositionMs = MutableStateFlow(0L)
    override val currentPositionMs: StateFlow<Long> = _currentPositionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    override val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    private val _currentTrack = MutableStateFlow<Track?>(null)
    override val currentTrack: StateFlow<Track?> = _currentTrack.asStateFlow()

    override var onPlaybackEnded: (() -> Unit)? = null
    override var onPlayerError: ((String) -> Unit)? = null

    private var progressJob: Job? = null

    init {
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build()

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36")
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000)
            .setAllowCrossProtocolRedirects(true)

        val cacheDataSourceFactory = PlayerCacheManager.buildCacheDataSourceFactory(context)
        val mediaSourceFactory = DefaultMediaSourceFactory(cacheDataSourceFactory)

        exoPlayer = ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaSourceFactory)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        mediaSession = MediaSession.Builder(context, exoPlayer)
            .setId("PurePlayExoSession")
            .build()

        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _isPlaying.value = isPlaying
                if (isPlaying) {
                    _isBuffering.value = false
                    startProgressTracker()
                } else {
                    stopProgressTracker()
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> {
                        _isBuffering.value = true
                    }
                    Player.STATE_READY -> {
                        _isBuffering.value = false
                        val streamDuration = exoPlayer.duration
                        if (streamDuration > 0L) {
                            _durationMs.value = streamDuration
                        } else {
                            val trackSec = _currentTrack.value?.durationSeconds ?: 0
                            val trackDurationMs = trackSec.toLong() * 1000L
                            if (trackDurationMs > 0L) {
                                _durationMs.value = trackDurationMs
                            }
                        }
                    }
                    Player.STATE_ENDED -> {
                        _isPlaying.value = false
                        _isBuffering.value = false
                        stopProgressTracker()
                        onPlaybackEnded?.invoke()
                    }
                    Player.STATE_IDLE -> {
                        _isBuffering.value = false
                    }
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e(logTag, "ExoPlayer playback error: ${error.message}", error)
                _isBuffering.value = false
                _isPlaying.value = false
                stopProgressTracker()
                onPlayerError?.invoke(error.message ?: "Playback error")
            }
        })
    }

    override fun playTrack(track: Track, streamUrl: String) {
        mainHandler.post {
            _currentTrack.value = track
            _isBuffering.value = true
            _durationMs.value = if (track.durationSeconds > 0) track.durationSeconds * 1000L else 0L

            // Use authentic album cover URL directly without forcing YouTube format on numeric IDs
            val videoId = track.videoId.trim()
            val artworkUrl = when {
                track.thumbnailUrl.startsWith("http://") || track.thumbnailUrl.startsWith("https://") -> {
                    track.thumbnailUrl
                }
                videoId.length == 11 && !videoId.all { it.isDigit() } && videoId.matches(Regex("^[a-zA-Z0-9_-]{11}$")) -> {
                    "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
                }
                else -> null
            }

            val safeArtworkUri = artworkUrl?.let {
                try {
                    Uri.parse(it)
                } catch (e: Exception) {
                    null
                }
            }

            val metadata = MediaMetadata.Builder()
                .setTitle(track.title)
                .setArtist(track.artist)
                .setAlbumTitle(track.album.ifEmpty { "Single" })
                .setArtworkUri(safeArtworkUri)
                .build()

            val mediaItem = MediaItem.Builder()
                .setUri(Uri.parse(streamUrl))
                .setMediaMetadata(metadata)
                .build()

            exoPlayer.setMediaItem(mediaItem)
            exoPlayer.prepare()
            exoPlayer.play()
            Log.d(logTag, "Playing native track: ${track.title} with direct stream URL")
        }
    }

    override fun resume() {
        mainHandler.post {
            exoPlayer.play()
        }
    }

    override fun pause() {
        mainHandler.post {
            exoPlayer.pause()
        }
    }

    override fun seekTo(positionMs: Long) {
        mainHandler.post {
            _currentPositionMs.value = positionMs
            exoPlayer.seekTo(positionMs)
        }
    }

    override fun setPlaybackSpeed(speed: Float) {
        mainHandler.post {
            exoPlayer.setPlaybackSpeed(speed)
        }
    }

    override fun release() {
        mainHandler.post {
            stopProgressTracker()
            mediaSession.release()
            exoPlayer.release()
        }
    }

    private fun startProgressTracker() {
        progressJob?.cancel()
        progressJob = scope.launch {
            while (isActive) {
                val currentPos = exoPlayer.currentPosition
                val dur = exoPlayer.duration
                val trackSec = _currentTrack.value?.durationSeconds ?: 0
                val trackDurationMs = trackSec.toLong() * 1000L

                if (trackDurationMs > 0L) {
                    _durationMs.value = trackDurationMs
                    if (currentPos in 0L..trackDurationMs) {
                        _currentPositionMs.value = currentPos
                    } else if (currentPos > trackDurationMs) {
                        _currentPositionMs.value = trackDurationMs
                        mainHandler.post {
                            exoPlayer.pause()
                            _isPlaying.value = false
                            stopProgressTracker()
                            onPlaybackEnded?.invoke()
                        }
                        break
                    }
                } else {
                    if (currentPos >= 0L) {
                        _currentPositionMs.value = currentPos
                    }
                    if (dur > 0L && dur != _durationMs.value) {
                        _durationMs.value = dur
                    }
                }
                delay(250)
            }
        }
    }

    private fun stopProgressTracker() {
        progressJob?.cancel()
        progressJob = null
    }
}

@UnstableApi
object PlayerCacheManager {
    @Volatile
    private var simpleCache: SimpleCache? = null

    fun getCache(context: Context): SimpleCache {
        return simpleCache ?: synchronized(this) {
            simpleCache ?: run {
                val cacheFolder = File(context.cacheDir, "media_cache")
                val evictor = LeastRecentlyUsedCacheEvictor(250 * 1024 * 1024) // 250MB media cache
                val databaseProvider = StandaloneDatabaseProvider(context)
                SimpleCache(cacheFolder, evictor, databaseProvider).also { simpleCache = it }
            }
        }
    }

    fun buildCacheDataSourceFactory(context: Context): DataSource.Factory {
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36")
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000)
            .setAllowCrossProtocolRedirects(true)

        val upstreamFactory = DefaultDataSource.Factory(context, httpFactory)

        // Asynchronously pre-warm the disk cache and database on Dispatchers.IO
        CoroutineScope(Dispatchers.IO).launch {
            try {
                getCache(context)
            } catch (e: Exception) {
                Log.w("PlayerCacheManager", "Error pre-warming media cache: ${e.message}")
            }
        }

        return DataSource.Factory {
            CacheDataSource(
                getCache(context),
                upstreamFactory.createDataSource(),
                CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR
            )
        }
    }
}
