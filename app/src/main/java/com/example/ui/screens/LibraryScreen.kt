package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Playlist
import com.example.model.Track
import com.example.ui.components.TrackItem
import com.example.ui.theme.CyberPink
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceCard
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.DeepCharcoal
import com.example.ui.theme.ElectricViolet
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

@Composable
fun LibraryScreen(
    favoriteTracks: List<Track>,
    playlists: List<Playlist>,
    recentlyPlayed: List<Track>,
    currentViewingPlaylist: Playlist?,
    selectedPlaylistTracks: List<Track>,
    currentTrack: Track?,
    isPlaying: Boolean,
    onTrackClick: (Track, List<Track>) -> Unit,
    onFavoriteClick: (Track) -> Unit,
    onMoreClick: (Track) -> Unit,
    onCreatePlaylistClick: () -> Unit,
    onViewPlaylist: (Playlist) -> Unit,
    onClosePlaylistView: () -> Unit,
    onDeletePlaylist: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    val tabTitles = listOf("Favorites", "Playlists", "History")

    if (currentViewingPlaylist != null) {
        // Detailed Playlist View
        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .background(DeepCharcoal),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp)
        ) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onClosePlaylistView) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back",
                            tint = TextPrimary
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = currentViewingPlaylist.name,
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = TextPrimary
                        )
                        Text(
                            text = "${selectedPlaylistTracks.size} tracks",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }
                    IconButton(onClick = { onDeletePlaylist(currentViewingPlaylist.id) }) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = "Delete playlist",
                            tint = CyberPink
                        )
                    }
                }
            }

            if (selectedPlaylistTracks.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = { onTrackClick(selectedPlaylistTracks.first(), selectedPlaylistTracks) },
                            colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(imageVector = Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Play All", fontWeight = FontWeight.Bold)
                        }
                    }
                }

                items(selectedPlaylistTracks) { track ->
                    val isCurrent = currentTrack?.id == track.id
                    TrackItem(
                        track = track,
                        isCurrentTrack = isCurrent,
                        isPlaying = isPlaying && isCurrent,
                        onClick = { onTrackClick(track, selectedPlaylistTracks) },
                        onFavoriteClick = { onFavoriteClick(track) },
                        onMoreClick = { onMoreClick(track) },
                        modifier = Modifier.padding(vertical = 2.dp)
                    )
                }
            } else {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 48.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "This playlist is empty. Add songs from Home or Search!",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextMuted
                        )
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(80.dp))
            }
        }
        return
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(DeepCharcoal),
        contentPadding = PaddingValues(bottom = 96.dp)
    ) {
        // Library Header
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 16.dp)
            ) {
                Text(
                    text = "Your Library",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 26.sp
                    ),
                    color = TextPrimary
                )
                Text(
                    text = "Saved music, offline playlists & history",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }
        }

        // Tab Row
        item {
            TabRow(
                selectedTabIndex = selectedTabIndex,
                containerColor = DarkSurface,
                contentColor = NeonCyan,
                indicator = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTabIndex]),
                        color = NeonCyan,
                        height = 3.dp
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                tabTitles.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTabIndex == index,
                        onClick = { selectedTabIndex = index },
                        text = {
                            Text(
                                text = title,
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = if (selectedTabIndex == index) FontWeight.Bold else FontWeight.Normal
                                ),
                                color = if (selectedTabIndex == index) NeonCyan else TextMuted
                            )
                        },
                        modifier = Modifier.testTag("library_tab_$title")
                    )
                }
            }
        }

        // Tab 0: Favorites
        if (selectedTabIndex == 0) {
            if (favoriteTracks.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = { onTrackClick(favoriteTracks.first(), favoriteTracks) },
                            colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f).testTag("fav_play_all_btn")
                        ) {
                            Icon(imageVector = Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Play All (${favoriteTracks.size})", fontWeight = FontWeight.Bold)
                        }
                    }
                }

                items(favoriteTracks) { track ->
                    val isCurrent = currentTrack?.id == track.id
                    TrackItem(
                        track = track,
                        isCurrentTrack = isCurrent,
                        isPlaying = isPlaying && isCurrent,
                        onClick = { onTrackClick(track, favoriteTracks) },
                        onFavoriteClick = { onFavoriteClick(track) },
                        onMoreClick = { onMoreClick(track) },
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            } else {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 60.dp, bottom = 40.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(CircleShape)
                                .background(CyberPink.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Favorite,
                                contentDescription = null,
                                tint = CyberPink,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(14.dp))
                        Text(
                            text = "No favorite tracks yet",
                            style = MaterialTheme.typography.titleMedium,
                            color = TextPrimary
                        )
                        Text(
                            text = "Tap the heart icon on any song to add it here",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }
                }
            }
        }

        // Tab 1: Playlists
        if (selectedTabIndex == 1) {
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .clickable { onCreatePlaylistClick() }
                        .testTag("create_new_playlist_card"),
                    colors = CardDefaults.cardColors(containerColor = DarkSurfaceCard)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(ElectricViolet.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = "Create",
                                tint = ElectricViolet,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(14.dp))
                        Column {
                            Text(
                                text = "Create New Playlist",
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                color = TextPrimary
                            )
                            Text(
                                text = "Organize your favorite YouTube music",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary
                            )
                        }
                    }
                }
            }

            if (playlists.isNotEmpty()) {
                items(playlists) { playlist ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { onViewPlaylist(playlist) },
                        colors = CardDefaults.cardColors(containerColor = DarkSurfaceCard)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(DarkSurfaceElevated),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.QueueMusic,
                                    contentDescription = null,
                                    tint = NeonCyan,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(14.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = playlist.name,
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                    color = TextPrimary
                                )
                                Text(
                                    text = "${playlist.trackCount} songs",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary
                                )
                            }
                        }
                    }
                }
            }
        }

        // Tab 2: History
        if (selectedTabIndex == 2) {
            if (recentlyPlayed.isNotEmpty()) {
                items(recentlyPlayed) { track ->
                    val isCurrent = currentTrack?.id == track.id
                    TrackItem(
                        track = track,
                        isCurrentTrack = isCurrent,
                        isPlaying = isPlaying && isCurrent,
                        onClick = { onTrackClick(track, recentlyPlayed) },
                        onFavoriteClick = { onFavoriteClick(track) },
                        onMoreClick = { onMoreClick(track) },
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            } else {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 60.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.History,
                            contentDescription = null,
                            tint = TextMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "No play history yet",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextPrimary
                        )
                    }
                }
            }
        }
    }
}
