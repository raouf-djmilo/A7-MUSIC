package com.example.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.example.model.Track

@Entity(tableName = "tracks")
data class TrackEntity(
    @PrimaryKey
    val id: String,
    val videoId: String,
    val title: String,
    val artist: String,
    val durationSeconds: Int,
    val thumbnailUrl: String,
    val streamUrl: String,
    val category: String,
    val isFavorite: Boolean = false,
    val lyrics: String = "",
    val lastPlayedTimestamp: Long = 0L,
    val playsCount: Int = 0,
    val album: String = "",
    val channelName: String = "",
    val artistBio: String = "",
    val releaseYear: String = "",
    val viewsCountFormatted: String = ""
) {
    fun toTrack(): Track {
        return Track(
            id = id,
            videoId = videoId,
            title = title,
            artist = artist,
            durationSeconds = durationSeconds,
            thumbnailUrl = thumbnailUrl,
            streamUrl = streamUrl.ifBlank { null },
            category = category,
            isFavorite = isFavorite,
            lyrics = lyrics,
            playsCount = playsCount,
            album = album,
            channelName = channelName,
            artistBio = artistBio,
            releaseYear = releaseYear,
            viewsCountFormatted = viewsCountFormatted
        )
    }

    companion object {
        fun fromTrack(track: Track, lastPlayed: Long = 0L): TrackEntity {
            return TrackEntity(
                id = track.id,
                videoId = track.videoId,
                title = track.title,
                artist = track.artist,
                durationSeconds = track.durationSeconds,
                thumbnailUrl = track.thumbnailUrl,
                streamUrl = track.streamUrl.orEmpty(),
                category = track.category,
                isFavorite = track.isFavorite,
                lyrics = track.lyrics,
                lastPlayedTimestamp = lastPlayed,
                playsCount = track.playsCount,
                album = track.album,
                channelName = track.channelName,
                artistBio = track.artistBio,
                releaseYear = track.releaseYear,
                viewsCountFormatted = track.viewsCountFormatted
            )
        }
    }
}

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String,
    val description: String = "",
    val coverUrl: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "playlist_tracks", primaryKeys = ["playlistId", "trackId"])
data class PlaylistTrackCrossRef(
    val playlistId: Long,
    val trackId: String,
    val addedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "search_history")
data class SearchHistoryEntity(
    @PrimaryKey
    val query: String,
    val timestamp: Long = System.currentTimeMillis()
)
