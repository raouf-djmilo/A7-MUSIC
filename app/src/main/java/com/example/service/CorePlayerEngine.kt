package com.example.service

import com.example.model.Track
import kotlinx.coroutines.flow.StateFlow

/**
 * Platform-Agnostic Core Player Engine Interface.
 * Decouples Compose UI, ViewModels, and state management from the native player implementation.
 * Architecture is ready for future multiplatform/iOS (AVPlayer) implementations.
 */
interface CorePlayerEngine {
    val isPlaying: StateFlow<Boolean>
    val isBuffering: StateFlow<Boolean>
    val currentPositionMs: StateFlow<Long>
    val durationMs: StateFlow<Long>
    val currentTrack: StateFlow<Track?>

    fun playTrack(track: Track, streamUrl: String)
    fun resume()
    fun pause()
    fun seekTo(positionMs: Long)
    fun setPlaybackSpeed(speed: Float)
    fun release()

    var onPlaybackEnded: (() -> Unit)?
    var onPlayerError: ((String) -> Unit)?
}
