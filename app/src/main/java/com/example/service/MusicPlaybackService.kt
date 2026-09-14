package com.example.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.example.MainActivity

/**
 * MusicPlaybackService:
 * AndroidX Media3 MediaSessionService implementation.
 * Ensures system media integration, lock-screen controls, Bluetooth media commands,
 * and uninterrupted background playback.
 */
class MusicPlaybackService : MediaSessionService() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return AudioPlayerManager.getInstance(this).mediaSession
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "PurePlay Music"
        val artist = intent?.getStringExtra(EXTRA_ARTIST) ?: "Native High-Res Audio"
        val isPlaying = intent?.getBooleanExtra(EXTRA_IS_PLAYING, false) ?: false

        val manager = AudioPlayerManager.getInstance(this)
        when (intent?.action) {
            ACTION_PLAY_PAUSE -> {
                manager.togglePlayPause()
                val currentTrack = manager.currentTrack.value
                val currentTitle = currentTrack?.title ?: title
                val currentArtist = currentTrack?.artist ?: artist
                val nowPlaying = manager.isPlaying.value
                val notification = buildNotification(currentTitle, currentArtist, nowPlaying)
                startForegroundWithMedia(notification)
            }
            ACTION_NEXT -> {
                manager.playNext()
                val currentTrack = manager.currentTrack.value
                val currentTitle = currentTrack?.title ?: title
                val currentArtist = currentTrack?.artist ?: artist
                val nowPlaying = manager.isPlaying.value
                val notification = buildNotification(currentTitle, currentArtist, nowPlaying)
                startForegroundWithMedia(notification)
            }
            ACTION_PREV -> {
                manager.playPrevious()
                val currentTrack = manager.currentTrack.value
                val currentTitle = currentTrack?.title ?: title
                val currentArtist = currentTrack?.artist ?: artist
                val nowPlaying = manager.isPlaying.value
                val notification = buildNotification(currentTitle, currentArtist, nowPlaying)
                startForegroundWithMedia(notification)
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                val notification = buildNotification(title, artist, isPlaying)
                startForegroundWithMedia(notification)
            }
        }

        super.onStartCommand(intent, flags, startId)
        return START_NOT_STICKY
    }

    private fun startForegroundWithMedia(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(title: String, artist: String, isPlaying: Boolean): Notification {
        val mainIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this, 0, mainIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val prevIntent = Intent(this, MusicPlaybackService::class.java).apply { action = ACTION_PREV }
        val prevPending = PendingIntent.getService(this, 1, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val playPauseIntent = Intent(this, MusicPlaybackService::class.java).apply { action = ACTION_PLAY_PAUSE }
        val playPausePending = PendingIntent.getService(this, 2, playPauseIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val nextIntent = Intent(this, MusicPlaybackService::class.java).apply { action = ACTION_NEXT }
        val nextPending = PendingIntent.getService(this, 3, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText("PurePlay Native High-Res Audio")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(contentPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(isPlaying)
            .addAction(android.R.drawable.ic_media_previous, "Prev", prevPending)
            .addAction(if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play, if (isPlaying) "Pause" else "Play", playPausePending)
            .addAction(android.R.drawable.ic_media_next, "Next", nextPending)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PurePlay Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Uninterrupted background audio and lock-screen controls"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "pureplay_playback_channel"
        const val NOTIFICATION_ID = 101

        const val ACTION_PLAY_PAUSE = "com.example.pureplay.ACTION_PLAY_PAUSE"
        const val ACTION_NEXT = "com.example.pureplay.ACTION_NEXT"
        const val ACTION_PREV = "com.example.pureplay.ACTION_PREV"
        const val ACTION_STOP = "com.example.pureplay.ACTION_STOP"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_ARTIST = "extra_artist"
        const val EXTRA_IS_PLAYING = "extra_is_playing"

        fun startService(context: Context, title: String, artist: String, isPlaying: Boolean) {
            val intent = Intent(context, MusicPlaybackService::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ARTIST, artist)
                putExtra(EXTRA_IS_PLAYING, isPlaying)
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                // Ignore background start exceptions
            }
        }
    }
}
