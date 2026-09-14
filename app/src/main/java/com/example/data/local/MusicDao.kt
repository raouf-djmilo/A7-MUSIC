package com.example.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface MusicDao {

    @Query("SELECT * FROM tracks WHERE isFavorite = 1 ORDER BY lastPlayedTimestamp DESC")
    fun getFavoriteTracks(): Flow<List<TrackEntity>>

    @Query("SELECT * FROM tracks WHERE lastPlayedTimestamp > 0 ORDER BY lastPlayedTimestamp DESC LIMIT 30")
    fun getRecentlyPlayed(): Flow<List<TrackEntity>>

    @Query("SELECT * FROM tracks WHERE id = :id LIMIT 1")
    suspend fun getTrackById(id: String): TrackEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateTrack(track: TrackEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTracks(tracks: List<TrackEntity>)

    @Query("UPDATE tracks SET isFavorite = :isFav WHERE id = :trackId")
    suspend fun setFavorite(trackId: String, isFav: Boolean)

    @Query("UPDATE tracks SET lastPlayedTimestamp = :timestamp, playsCount = playsCount + 1 WHERE id = :trackId")
    suspend fun recordTrackPlayed(trackId: String, timestamp: Long)

    // Playlists
    @Query("SELECT * FROM playlists ORDER BY createdAt DESC")
    fun getAllPlaylists(): Flow<List<PlaylistEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPlaylist(playlist: PlaylistEntity): Long

    @Query("DELETE FROM playlists WHERE id = :playlistId")
    suspend fun deletePlaylist(playlistId: Long)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun addTrackToPlaylist(crossRef: PlaylistTrackCrossRef)

    @Query("DELETE FROM playlist_tracks WHERE playlistId = :playlistId AND trackId = :trackId")
    suspend fun removeTrackFromPlaylist(playlistId: Long, trackId: String)

    @Transaction
    @Query("""
        SELECT tracks.* FROM tracks
        INNER JOIN playlist_tracks ON tracks.id = playlist_tracks.trackId
        WHERE playlist_tracks.playlistId = :playlistId
        ORDER BY playlist_tracks.addedAt DESC
    """)
    fun getTracksForPlaylist(playlistId: Long): Flow<List<TrackEntity>>

    @Query("SELECT COUNT(*) FROM playlist_tracks WHERE playlistId = :playlistId")
    suspend fun getPlaylistTrackCount(playlistId: Long): Int

    // Search History
    @Query("SELECT * FROM search_history ORDER BY timestamp DESC LIMIT 15")
    fun getSearchHistory(): Flow<List<SearchHistoryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSearchQuery(query: SearchHistoryEntity)

    @Query("DELETE FROM search_history WHERE `query` = :query")
    suspend fun deleteSearchQuery(query: String)

    @Query("DELETE FROM search_history")
    suspend fun clearSearchHistory()
}
