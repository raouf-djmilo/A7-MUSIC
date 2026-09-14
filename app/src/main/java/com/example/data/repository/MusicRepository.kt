package com.example.data.repository

import com.example.data.local.AppDatabase
import com.example.data.local.MusicDao
import com.example.data.local.PlaylistEntity
import com.example.data.local.PlaylistTrackCrossRef
import com.example.data.local.SearchHistoryEntity
import com.example.data.local.TrackEntity
import com.example.data.remote.MusicStreamService
import com.example.model.Playlist
import com.example.model.Track
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class MusicRepository(
    private val database: AppDatabase,
    private val remoteService: MusicStreamService = MusicStreamService()
) {
    private val dao: MusicDao = database.musicDao()

    val favoriteTracks: Flow<List<Track>> = dao.getFavoriteTracks().map { list ->
        list.map { sanitizeTrack(it.toTrack()) }
    }

    val recentlyPlayed: Flow<List<Track>> = dao.getRecentlyPlayed().map { list ->
        list.map { sanitizeTrack(it.toTrack()) }
    }

    val allPlaylists: Flow<List<Playlist>> = dao.getAllPlaylists().map { list ->
        list.map { entity ->
            val count = dao.getPlaylistTrackCount(entity.id)
            Playlist(
                id = entity.id,
                name = entity.name,
                description = entity.description,
                coverUrl = entity.coverUrl,
                trackCount = count
            )
        }
    }

    val searchHistory: Flow<List<String>> = dao.getSearchHistory().map { list ->
        list.map { it.query }
    }

    fun getAllCuratedTracks(): List<Track> = remoteService.getAllCuratedTracks()

    fun getTracksByCategory(category: String): List<Track> = remoteService.getTracksByCategory(category)

    suspend fun searchOnline(query: String): List<Track> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return emptyList()
        return remoteService.searchOnline(trimmed)
    }

    suspend fun searchTracksOnline(query: String): List<Track> = searchOnline(query)

    suspend fun recordSearchQuery(query: String) {
        val trimmed = query.trim()
        if (trimmed.isNotEmpty()) {
            dao.insertSearchQuery(SearchHistoryEntity(trimmed))
        }
    }

    suspend fun toggleFavorite(track: Track) {
        val existing = dao.getTrackById(track.id)
        val newFav = if (existing != null) !existing.isFavorite else !track.isFavorite
        val updated = TrackEntity.fromTrack(track.copy(isFavorite = newFav))
        dao.insertOrUpdateTrack(updated)
        dao.setFavorite(track.id, newFav)
    }

    suspend fun recordTrackPlayed(track: Track) {
        val existing = dao.getTrackById(track.id)
        val isFav = existing?.isFavorite ?: track.isFavorite
        val entity = TrackEntity.fromTrack(track.copy(isFavorite = isFav), System.currentTimeMillis())
        dao.insertOrUpdateTrack(entity)
        dao.recordTrackPlayed(track.id, System.currentTimeMillis())
    }

    suspend fun createPlaylist(name: String, description: String = "", coverUrl: String = ""): Long {
        val entity = PlaylistEntity(name = name, description = description, coverUrl = coverUrl)
        return dao.insertPlaylist(entity)
    }

    suspend fun deletePlaylist(playlistId: Long) {
        dao.deletePlaylist(playlistId)
    }

    suspend fun addTrackToPlaylist(playlistId: Long, track: Track) {
        val entity = TrackEntity.fromTrack(track)
        dao.insertOrUpdateTrack(entity)
        dao.addTrackToPlaylist(PlaylistTrackCrossRef(playlistId, track.id))
    }

    suspend fun removeTrackFromPlaylist(playlistId: Long, trackId: String) {
        dao.removeTrackFromPlaylist(playlistId, trackId)
    }

    fun getTracksForPlaylist(playlistId: Long): Flow<List<Track>> {
        return dao.getTracksForPlaylist(playlistId).map { list ->
            list.map { sanitizeTrack(it.toTrack()) }
        }
    }

    private fun sanitizeTrack(track: Track): Track {
        val canonical = remoteService.getAllCuratedTracks().find {
            it.id == track.id ||
            it.videoId == track.videoId ||
            (it.title.equals(track.title, ignoreCase = true) && it.artist.equals(track.artist, ignoreCase = true))
        }
        return if (canonical != null) {
            track.copy(
                videoId = canonical.videoId,
                thumbnailUrl = canonical.thumbnailUrl,
                durationSeconds = if (canonical.durationSeconds > 0) canonical.durationSeconds else track.durationSeconds,
                lyrics = if (track.lyrics.isNotBlank()) track.lyrics else canonical.lyrics
            )
        } else if (track.videoId == "5dxKD3y7N88" || track.title.contains("C'est La Vie", ignoreCase = true)) {
            track.copy(
                videoId = "hToD6-5wJ_0",
                thumbnailUrl = "https://i.ytimg.com/vi/hToD6-5wJ_0/hqdefault.jpg"
            )
        } else {
            track
        }
    }

    suspend fun deleteSearchQuery(query: String) {
        dao.deleteSearchQuery(query)
    }

    suspend fun clearSearchHistory() {
        dao.clearSearchHistory()
    }
}
