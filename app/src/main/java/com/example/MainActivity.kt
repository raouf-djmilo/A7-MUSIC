package com.example

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.model.Track
import com.example.ui.MainViewModel
import com.example.ui.components.AdShieldInfoDialog
import com.example.ui.components.AddToPlaylistDialog
import com.example.ui.components.AppBottomNav
import com.example.ui.components.AppDestination
import com.example.ui.components.MiniPlayer
import com.example.ui.components.SleepTimerDialog
import com.example.ui.screens.ExploreScreen
import com.example.ui.screens.HomeScreen
import com.example.ui.screens.LibraryScreen
import com.example.ui.screens.PlayerScreen
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.DeepCharcoal
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                MainAppContent(viewModel = viewModel)
            }
        }
    }
}

@Composable
fun MainAppContent(viewModel: MainViewModel) {
    // Request notification permission on Android 13+ to ensure persistent lock-screen playback
    val context = androidx.compose.ui.platform.LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { /* Permission handled */ }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    var currentDestination by remember { mutableStateOf(AppDestination.HOME) }
    var showCreatePlaylistDialog by remember { mutableStateOf(false) }
    var newPlaylistInputName by remember { mutableStateOf("") }

    // State collections
    val currentTrack by viewModel.currentTrack.collectAsStateWithLifecycle()
    val isPlaying by viewModel.isPlaying.collectAsStateWithLifecycle()
    val isBuffering by viewModel.isBuffering.collectAsStateWithLifecycle()
    val currentPosition by viewModel.currentPosition.collectAsStateWithLifecycle()
    val duration by viewModel.duration.collectAsStateWithLifecycle()
    val queue by viewModel.queue.collectAsStateWithLifecycle()
    val playbackMode by viewModel.playbackMode.collectAsStateWithLifecycle()
    val isShuffle by viewModel.isShuffle.collectAsStateWithLifecycle()
    val audioQuality by viewModel.audioQuality.collectAsStateWithLifecycle()
    val equalizerPreset by viewModel.equalizerPreset.collectAsStateWithLifecycle()
    val sleepTimerSecondsLeft by viewModel.sleepTimerSecondsLeft.collectAsStateWithLifecycle()
    val visualizerBands by viewModel.visualizerBands.collectAsStateWithLifecycle()
    val adsBlockedCount by viewModel.adsBlockedCount.collectAsStateWithLifecycle()

    val categories = viewModel.categories
    val selectedCategory by viewModel.selectedCategory.collectAsStateWithLifecycle()
    val curatedTracks by viewModel.curatedTracks.collectAsStateWithLifecycle()
    val favoriteTracks by viewModel.favoriteTracks.collectAsStateWithLifecycle()
    val recentlyPlayed by viewModel.recentlyPlayed.collectAsStateWithLifecycle()
    val allPlaylists by viewModel.allPlaylists.collectAsStateWithLifecycle()
    val searchHistory by viewModel.searchHistory.collectAsStateWithLifecycle()

    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val searchResults by viewModel.searchResults.collectAsStateWithLifecycle()
    val isSearching by viewModel.isSearching.collectAsStateWithLifecycle()

    val isPlayerExpanded by viewModel.isPlayerExpanded.collectAsStateWithLifecycle()
    val playbackError by viewModel.playbackError.collectAsStateWithLifecycle()
    val trackForPlaylist by viewModel.trackForPlaylist.collectAsStateWithLifecycle()
    val showSleepTimerDialog by viewModel.showSleepTimerDialog.collectAsStateWithLifecycle()
    val showAdShieldDialog by viewModel.showAdShieldDialog.collectAsStateWithLifecycle()
    val currentViewingPlaylist by viewModel.currentViewingPlaylist.collectAsStateWithLifecycle()
    val selectedPlaylistTracks by viewModel.selectedPlaylistTracks.collectAsStateWithLifecycle()

    Box(modifier = Modifier.fillMaxSize().background(DeepCharcoal)) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = DeepCharcoal,
            bottomBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.navigationBars)
                ) {
                    // Circuit Breaker Playback Error Alert
                    if (!playbackError.isNullOrBlank() && !isPlayerExpanded) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 6.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFFE53935).copy(alpha = 0.22f))
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "⚠️ $playbackError",
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                    color = Color(0xFFFF8A80),
                                    modifier = Modifier.weight(1f),
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Button(
                                    onClick = { viewModel.retryPlayback() },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Color(0xFFE53935),
                                        contentColor = Color.White
                                    ),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                    modifier = Modifier.height(28.dp)
                                ) {
                                    Text("Retry", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                                IconButton(
                                    onClick = { viewModel.clearPlaybackError() },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Dismiss",
                                        tint = Color(0xFFFF8A80),
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }

                    // Mini Player attached above Bottom Nav
                    if (currentTrack != null && !isPlayerExpanded) {
                        MiniPlayer(
                            track = currentTrack!!,
                            isPlaying = isPlaying,
                            isBuffering = isBuffering,
                            currentPositionMs = currentPosition,
                            durationMs = duration,
                            onPlayPauseClick = { viewModel.playerManager.togglePlayPause() },
                            onNextClick = { viewModel.playerManager.playNext() },
                            onExpandClick = { viewModel.setPlayerExpanded(true) }
                        )
                    }

                    AppBottomNav(
                        currentDestination = currentDestination,
                        onDestinationSelected = { currentDestination = it }
                    )
                }
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                when (currentDestination) {
                    AppDestination.HOME -> {
                        HomeScreen(
                            curatedTracks = curatedTracks,
                            recentlyPlayed = recentlyPlayed,
                            categories = categories,
                            selectedCategory = selectedCategory,
                            currentTrack = currentTrack,
                            isPlaying = isPlaying,
                            onCategorySelect = { viewModel.selectCategory(it) },
                            onTrackClick = { track, list -> viewModel.playTrack(track, list) },
                            onFavoriteClick = { viewModel.toggleFavorite(it) },
                            onMoreClick = { viewModel.showAddToPlaylistDialog(it) },
                            onAdShieldClick = { viewModel.setShowAdShieldDialog(true) }
                        )
                    }

                    AppDestination.EXPLORE -> {
                        ExploreScreen(
                            searchQuery = searchQuery,
                            searchResults = searchResults,
                            isSearching = isSearching,
                            searchHistory = searchHistory,
                            currentTrack = currentTrack,
                            isPlaying = isPlaying,
                            onQueryChange = { viewModel.onSearchQueryChange(it) },
                            onSearchSubmit = { viewModel.onSearchExecuted(it) },
                            onClearQuery = { viewModel.clearSearch() },
                            onDeleteHistoryItem = { viewModel.deleteSearchHistoryItem(it) },
                            onClearAllHistory = { viewModel.clearAllSearchHistory() },
                            onTrackClick = { track, list -> viewModel.playTrack(track, list) },
                            onFavoriteClick = { viewModel.toggleFavorite(it) },
                            onMoreClick = { viewModel.showAddToPlaylistDialog(it) }
                        )
                    }

                    AppDestination.LIBRARY -> {
                        LibraryScreen(
                            favoriteTracks = favoriteTracks,
                            playlists = allPlaylists,
                            recentlyPlayed = recentlyPlayed,
                            currentViewingPlaylist = currentViewingPlaylist,
                            selectedPlaylistTracks = selectedPlaylistTracks,
                            currentTrack = currentTrack,
                            isPlaying = isPlaying,
                            onTrackClick = { track, list -> viewModel.playTrack(track, list) },
                            onFavoriteClick = { viewModel.toggleFavorite(it) },
                            onMoreClick = { viewModel.showAddToPlaylistDialog(it) },
                            onCreatePlaylistClick = { showCreatePlaylistDialog = true },
                            onViewPlaylist = { viewModel.viewPlaylist(it) },
                            onClosePlaylistView = { viewModel.closePlaylistView() },
                            onDeletePlaylist = { viewModel.deletePlaylist(it) }
                        )
                    }
                }
            }
        }

        // Full Screen Immersive Player Overlay
        AnimatedVisibility(
            visible = isPlayerExpanded && currentTrack != null,
            enter = slideInVertically(initialOffsetY = { it }),
            exit = slideOutVertically(targetOffsetY = { it })
        ) {
            currentTrack?.let { track ->
                PlayerScreen(
                    track = track,
                    isPlaying = isPlaying,
                    isBuffering = isBuffering,
                    currentPositionMs = currentPosition,
                    durationMs = duration,
                    queue = queue,
                    playbackMode = playbackMode,
                    isShuffle = isShuffle,
                    audioQuality = audioQuality,
                    equalizerPreset = equalizerPreset,
                    sleepTimerSecondsLeft = sleepTimerSecondsLeft,
                    visualizerBands = visualizerBands,
                    adsBlockedCount = adsBlockedCount,
                    playbackError = playbackError,
                    onRetryClick = { viewModel.retryPlayback() },
                    onDismiss = { viewModel.setPlayerExpanded(false) },
                    onPlayPauseClick = { viewModel.playerManager.togglePlayPause() },
                    onNextClick = { viewModel.playerManager.playNext() },
                    onPrevClick = { viewModel.playerManager.playPrevious() },
                    onSeekTo = { viewModel.playerManager.seekTo(it) },
                    onToggleFavorite = { viewModel.toggleFavorite(track) },
                    onToggleShuffle = { viewModel.playerManager.toggleShuffle() },
                    onCyclePlaybackMode = { viewModel.playerManager.cyclePlaybackMode() },
                    onQualityChange = { viewModel.setAudioQuality(it) },
                    onPresetChange = { viewModel.setEqualizerPreset(it) },
                    onStartSleepTimer = { viewModel.startSleepTimer(it) },
                    onCancelSleepTimer = { viewModel.cancelSleepTimer() },
                    onSelectQueueTrack = { viewModel.playTrack(it) }
                )
            }
        }

        // Add to Playlist Dialog
        if (trackForPlaylist != null) {
            AddToPlaylistDialog(
                track = trackForPlaylist!!,
                playlists = allPlaylists,
                onAddToPlaylist = { playlistId ->
                    viewModel.addTrackToPlaylist(playlistId, trackForPlaylist!!)
                },
                onCreateNewPlaylist = { name ->
                    viewModel.createPlaylist(name)
                },
                onDismiss = { viewModel.showAddToPlaylistDialog(null) }
            )
        }

        // Create Playlist Dialog
        if (showCreatePlaylistDialog) {
            AlertDialog(
                onDismissRequest = { showCreatePlaylistDialog = false },
                containerColor = DarkSurface,
                title = {
                    Text(
                        text = "New Playlist",
                        style = MaterialTheme.typography.titleLarge,
                        color = TextPrimary
                    )
                },
                text = {
                    Column {
                        OutlinedTextField(
                            value = newPlaylistInputName,
                            onValueChange = { newPlaylistInputName = it },
                            label = { Text("Playlist Name") },
                            placeholder = { Text("My Rai Hits") },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = NeonCyan,
                                unfocusedBorderColor = DarkSurfaceElevated,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary
                            ),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().testTag("create_playlist_input")
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (newPlaylistInputName.isNotBlank()) {
                                viewModel.createPlaylist(newPlaylistInputName.trim())
                                newPlaylistInputName = ""
                                showCreatePlaylistDialog = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black)
                    ) {
                        Text("Create")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showCreatePlaylistDialog = false }) {
                        Text("Cancel", color = TextSecondary)
                    }
                }
            )
        }

        // Sleep Timer Dialog
        if (showSleepTimerDialog) {
            SleepTimerDialog(
                secondsLeft = sleepTimerSecondsLeft,
                onStartTimer = { viewModel.startSleepTimer(it) },
                onCancelTimer = { viewModel.cancelSleepTimer() },
                onDismiss = { viewModel.setShowSleepTimerDialog(false) }
            )
        }

        // Ad Shield Info Dialog
        if (showAdShieldDialog) {
            AdShieldInfoDialog(
                blockedCount = adsBlockedCount,
                onDismiss = { viewModel.setShowAdShieldDialog(false) }
            )
        }
    }
}
