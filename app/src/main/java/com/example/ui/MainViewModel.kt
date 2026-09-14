package com.example.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.local.AppDatabase
import com.example.data.repository.MusicRepository
import com.example.model.AudioQuality
import com.example.model.EqualizerPreset
import com.example.model.PlaybackMode
import com.example.model.Playlist
import com.example.model.Track
import com.example.service.AudioPlayerManager
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = MusicRepository(AppDatabase.getInstance(application))
    val playerManager = AudioPlayerManager.getInstance(application)

    // Player state from PlayerManager
    val currentTrack: StateFlow<Track?> = playerManager.currentTrack
    val isPlaying: StateFlow<Boolean> = playerManager.isPlaying
    val isBuffering: StateFlow<Boolean> = playerManager.isBuffering
    val currentPosition: StateFlow<Int> = playerManager.currentPosition
    val duration: StateFlow<Int> = playerManager.duration
    val queue: StateFlow<List<Track>> = playerManager.queue
    val playbackMode: StateFlow<PlaybackMode> = playerManager.playbackMode
    val isShuffle: StateFlow<Boolean> = playerManager.isShuffle
    val audioQuality: StateFlow<AudioQuality> = playerManager.audioQuality
    val equalizerPreset: StateFlow<EqualizerPreset> = playerManager.equalizerPreset
    val sleepTimerSecondsLeft: StateFlow<Int> = playerManager.sleepTimerSecondsLeft
    val visualizerBands: StateFlow<List<Float>> = playerManager.visualizerBands
    val adsBlockedCount: StateFlow<Int> = playerManager.adsBlockedCount
    val playbackError: StateFlow<String?> = playerManager.playbackError

    fun clearPlaybackError() {
        playerManager.clearPlaybackError()
    }

    fun retryPlayback() {
        playerManager.retryCurrentTrack()
    }

    // Categories
    val categories = listOf("All", "Rai & Maghreb", "Trending", "Hip Hop & Rap", "Chill & Lo-Fi", "Arabic Hits")
    private val _selectedCategory = MutableStateFlow("All")
    val selectedCategory: StateFlow<String> = _selectedCategory.asStateFlow()

    // Curated Tracks
    private val _curatedTracks = MutableStateFlow<List<Track>>(emptyList())
    val curatedTracks: StateFlow<List<Track>> = _curatedTracks.asStateFlow()

    // Room DB flows
    val favoriteTracks: StateFlow<List<Track>> = repository.favoriteTracks
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val recentlyPlayed: StateFlow<List<Track>> = repository.recentlyPlayed
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allPlaylists: StateFlow<List<Playlist>> = repository.allPlaylists
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val searchHistory: StateFlow<List<String>> = repository.searchHistory
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Search state
    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Track>>(emptyList())
    val searchResults: StateFlow<List<Track>> = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private var searchJob: Job? = null

    // UI Dialog States
    private val _isPlayerExpanded = MutableStateFlow(false)
    val isPlayerExpanded: StateFlow<Boolean> = _isPlayerExpanded.asStateFlow()

    private val _trackForPlaylist = MutableStateFlow<Track?>(null)
    val trackForPlaylist: StateFlow<Track?> = _trackForPlaylist.asStateFlow()

    private val _showSleepTimerDialog = MutableStateFlow(false)
    val showSleepTimerDialog: StateFlow<Boolean> = _showSleepTimerDialog.asStateFlow()

    private val _showAdShieldDialog = MutableStateFlow(false)
    val showAdShieldDialog: StateFlow<Boolean> = _showAdShieldDialog.asStateFlow()

    private val _selectedPlaylistTracks = MutableStateFlow<List<Track>>(emptyList())
    val selectedPlaylistTracks: StateFlow<List<Track>> = _selectedPlaylistTracks.asStateFlow()

    private val _currentViewingPlaylist = MutableStateFlow<Playlist?>(null)
    val currentViewingPlaylist: StateFlow<Playlist?> = _currentViewingPlaylist.asStateFlow()

    init {
        loadCuratedTracks()
        playerManager.onTrackChangedListener = { track ->
            viewModelScope.launch {
                repository.recordTrackPlayed(track)
            }
        }

        // Spotify-style debounced search flow: executes after 400ms when query changes
        @OptIn(FlowPreview::class)
        _searchQuery
            .debounce(400)
            .distinctUntilChanged()
            .onEach { query ->
                val trimmed = query.trim()
                if (trimmed.length >= 2) {
                    performOnlineSearch(trimmed)
                } else if (trimmed.isEmpty()) {
                    _searchResults.value = emptyList()
                    _isSearching.value = false
                }
            }
            .launchIn(viewModelScope)
    }

    fun selectCategory(category: String) {
        _selectedCategory.value = category
        _curatedTracks.value = repository.getTracksByCategory(category)
    }

    private fun loadCuratedTracks() {
        _curatedTracks.value = repository.getAllCuratedTracks()
    }

    fun playTrack(track: Track, newQueue: List<Track>? = null) {
        val favs = favoriteTracks.value
        val isFav = favs.any { it.id == track.id }
        val updatedTrack = track.copy(isFavorite = isFav)
        playerManager.playTrack(updatedTrack, newQueue)
    }

    fun toggleFavorite(track: Track) {
        viewModelScope.launch {
            repository.toggleFavorite(track)
            // Update in current player if same track
            if (currentTrack.value?.id == track.id) {
                val newFav = !(currentTrack.value?.isFavorite ?: false)
                // player keeps playing
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
        if (query.isBlank()) {
            searchJob?.cancel()
            _searchResults.value = emptyList()
            _isSearching.value = false
        }
    }

    fun onSearchExecuted(query: String) {
        val trimmed = query.trim()
        if (trimmed.isNotEmpty()) {
            viewModelScope.launch {
                repository.recordSearchQuery(trimmed)
            }
            performOnlineSearch(trimmed)
        }
    }

    private fun performOnlineSearch(query: String) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            _isSearching.value = true
            try {
                val results = repository.searchOnline(query)
                _searchResults.value = results
            } catch (e: Exception) {
                _searchResults.value = emptyList()
            } finally {
                _isSearching.value = false
            }
        }
    }

    fun clearSearch() {
        _searchQuery.value = ""
        _searchResults.value = emptyList()
        _isSearching.value = false
    }

    fun deleteSearchHistoryItem(query: String) {
        viewModelScope.launch {
            repository.deleteSearchQuery(query)
        }
    }

    fun clearAllSearchHistory() {
        viewModelScope.launch {
            repository.clearSearchHistory()
        }
    }

    fun clearRecentSearch(item: String) = deleteSearchHistoryItem(item)
    fun clearAllRecentSearches() = clearAllSearchHistory()

    fun createPlaylist(name: String, description: String = "") {
        viewModelScope.launch {
            repository.createPlaylist(name, description)
        }
    }

    fun deletePlaylist(playlistId: Long) {
        viewModelScope.launch {
            repository.deletePlaylist(playlistId)
            if (_currentViewingPlaylist.value?.id == playlistId) {
                _currentViewingPlaylist.value = null
                _selectedPlaylistTracks.value = emptyList()
            }
        }
    }

    fun addTrackToPlaylist(playlistId: Long, track: Track) {
        viewModelScope.launch {
            repository.addTrackToPlaylist(playlistId, track)
            _trackForPlaylist.value = null
        }
    }

    fun viewPlaylist(playlist: Playlist) {
        _currentViewingPlaylist.value = playlist
        viewModelScope.launch {
            repository.getTracksForPlaylist(playlist.id).collect { tracks ->
                _selectedPlaylistTracks.value = tracks
            }
        }
    }

    fun closePlaylistView() {
        _currentViewingPlaylist.value = null
        _selectedPlaylistTracks.value = emptyList()
    }

    // UI Dialog Controls
    fun setPlayerExpanded(expanded: Boolean) {
        _isPlayerExpanded.value = expanded
    }

    fun showAddToPlaylistDialog(track: Track?) {
        _trackForPlaylist.value = track
    }

    fun setShowSleepTimerDialog(show: Boolean) {
        _showSleepTimerDialog.value = show
    }

    fun setShowAdShieldDialog(show: Boolean) {
        _showAdShieldDialog.value = show
    }

    fun setPlaybackSpeed(speed: Float) {
        playerManager.setPlaybackSpeed(speed)
    }

    fun setAudioQuality(quality: AudioQuality) {
        playerManager.setAudioQuality(quality)
    }

    fun setEqualizerPreset(preset: EqualizerPreset) {
        playerManager.setEqualizerPreset(preset)
    }

    fun startSleepTimer(minutes: Int) {
        playerManager.startSleepTimer(minutes)
        _showSleepTimerDialog.value = false
    }

    fun cancelSleepTimer() {
        playerManager.cancelSleepTimer()
        _showSleepTimerDialog.value = false
    }
}
