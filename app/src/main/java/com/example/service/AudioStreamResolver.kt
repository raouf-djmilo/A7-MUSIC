package com.example.service

import com.example.model.Track

/**
 * Detailed resolution result including authentic duration and metadata
 */
data class ResolvedStreamResult(
    val streamUrl: String,
    val durationSeconds: Long = 0L,
    val isAuthenticDirect: Boolean = true,
    val mimeType: String = "audio/webm"
)

/**
 * Audio Stream Resolver Contract:
 * Decoupled interface for resolving direct, raw audio streams (Opus / AAC / DASH)
 * from video/track IDs, with no HTML rendering or DOM querying.
 */
interface AudioStreamResolver {
    suspend fun resolveAudioStream(videoId: String): String?
    suspend fun resolveStreamDetails(videoId: String): ResolvedStreamResult? = null
    suspend fun getStreamDurationSeconds(videoId: String): Long? = null
    suspend fun searchTracksOnline(query: String): List<Track> = emptyList()
}
