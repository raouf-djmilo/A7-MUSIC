package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Track
import com.example.ui.components.TrackItem
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CyberPink
import com.example.ui.theme.DarkSurfaceCard
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.DeepCharcoal
import com.example.ui.theme.ElectricViolet
import com.example.ui.theme.EmeraldGlow
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

data class GenreCard(
    val title: String,
    val searchKeyword: String,
    val gradientColors: List<Color>
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExploreScreen(
    searchQuery: String,
    searchResults: List<Track>,
    isSearching: Boolean,
    searchHistory: List<String>,
    currentTrack: Track?,
    isPlaying: Boolean,
    onQueryChange: (String) -> Unit,
    onSearchSubmit: (String) -> Unit = {},
    onClearQuery: () -> Unit,
    onDeleteHistoryItem: (String) -> Unit,
    onClearAllHistory: () -> Unit,
    onTrackClick: (Track, List<Track>) -> Unit,
    onFavoriteClick: (Track) -> Unit,
    onMoreClick: (Track) -> Unit,
    modifier: Modifier = Modifier
) {
    val genreCards = listOf(
        GenreCard("Rai & Maghreb", "Rai Soolking Khaled", listOf(EmeraldGlow, Color(0xFF065F46))),
        GenreCard("Rap & Hip-Hop", "Rap Travis Scott Drake", listOf(ElectricViolet, Color(0xFF4C1D95))),
        GenreCard("Trending Pop", "Top Hits Pop Songs", listOf(CyberPink, Color(0xFF831843))),
        GenreCard("Chill & Lo-Fi", "Lofi Beats Relax Study", listOf(NeonCyan, Color(0xFF0369A1))),
        GenreCard("Arabic & Oriental", "Arabic Music ElGrandeToto Wegz", listOf(AccentOrange, Color(0xFF9A3412))),
        GenreCard("Electronic & EDM", "EDM Dance House Remix", listOf(Color(0xFF06B6D4), Color(0xFF1E3A8A)))
    )

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(DeepCharcoal),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp)
    ) {
        // Search Header Title
        item {
            Text(
                text = "Search & Discover",
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 24.sp
                ),
                color = TextPrimary,
                modifier = Modifier.padding(bottom = 12.dp)
            )
        }

        // Search Input Bar
        item {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("search_input_field"),
                placeholder = {
                    Text(
                        text = "Search any song, artist, or YouTube music...",
                        color = TextMuted,
                        fontSize = 14.sp
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        tint = NeonCyan
                    )
                },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(
                            onClick = onClearQuery,
                            modifier = Modifier.testTag("search_clear_btn")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = "Clear search",
                                tint = TextSecondary
                            )
                        }
                    }
                },
                shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = DarkSurfaceCard,
                    unfocusedContainerColor = DarkSurfaceCard,
                    focusedBorderColor = NeonCyan,
                    unfocusedBorderColor = DarkSurfaceElevated,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary
                ),
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    imeAction = ImeAction.Search
                ),
                keyboardActions = KeyboardActions(
                    onSearch = {
                        if (searchQuery.isNotBlank()) {
                            onSearchSubmit(searchQuery)
                        }
                    }
                )
            )
        }

        // Search Loading state
        if (isSearching) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        color = NeonCyan,
                        strokeWidth = 3.dp,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Searching ad-free audio streams...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                }
            }
        }

        // Search Results Section
        if (searchQuery.isNotEmpty() && !isSearching) {
            if (searchResults.isNotEmpty()) {
                item {
                    Text(
                        text = "Search Results (${searchResults.size})",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = NeonCyan,
                        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                    )
                }

                items(searchResults) { track ->
                    val isCurrent = currentTrack?.id == track.id
                    TrackItem(
                        track = track,
                        isCurrentTrack = isCurrent,
                        isPlaying = isPlaying && isCurrent,
                        onClick = {
                            if (searchQuery.isNotBlank()) {
                                onSearchSubmit(searchQuery)
                            }
                            onTrackClick(track, searchResults)
                        },
                        onFavoriteClick = { onFavoriteClick(track) },
                        onMoreClick = { onMoreClick(track) },
                        modifier = Modifier.padding(vertical = 2.dp)
                    )
                }
            } else {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.MusicNote,
                            contentDescription = null,
                            tint = TextMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "No songs found for \"$searchQuery\"",
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextPrimary
                        )
                        Text(
                            text = "Try searching with artist name or song title",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }
                }
            }
        }

        // When search query is empty: Show Search History + Browse Genres Grid
        if (searchQuery.isEmpty()) {
            // Recent Search History
            if (searchHistory.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.padding(top = 16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.History,
                                    contentDescription = null,
                                    tint = TextSecondary,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Recent Searches",
                                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                    color = TextSecondary
                                )
                            }
                            TextButton(onClick = onClearAllHistory) {
                                Text("Clear all", color = TextMuted, fontSize = 12.sp)
                            }
                        }

                        FlowRow(
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            searchHistory.forEach { historyQuery ->
                                Row(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(DarkSurfaceElevated)
                                        .clickable {
                                            onQueryChange(historyQuery)
                                            onSearchSubmit(historyQuery)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = historyQuery,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = TextPrimary
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    IconButton(
                                        onClick = { onDeleteHistoryItem(historyQuery) },
                                        modifier = Modifier.size(18.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Delete",
                                            tint = TextMuted,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Browse Genres Section
            item {
                Text(
                    text = "Explore Genres & Vibes",
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp
                    ),
                    color = TextPrimary,
                    modifier = Modifier.padding(top = 24.dp, bottom = 12.dp)
                )
            }

            // Genre Cards 2-column Grid
            items(genreCards.chunked(2)) { pair ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    pair.forEach { genre ->
                        Card(
                            modifier = Modifier
                                .weight(1f)
                                .height(95.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .clickable {
                                    onQueryChange(genre.searchKeyword)
                                    onSearchSubmit(genre.searchKeyword)
                                }
                                .testTag("genre_card_${genre.title}"),
                            colors = CardDefaults.cardColors(containerColor = Color.Transparent)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Brush.linearGradient(genre.gradientColors))
                                    .padding(14.dp),
                                contentAlignment = Alignment.BottomStart
                            ) {
                                Text(
                                    text = genre.title,
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp
                                    ),
                                    color = Color.White
                                )
                            }
                        }
                    }
                    if (pair.size == 1) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }

        // Bottom spacer for miniplayer
        item {
            Spacer(modifier = Modifier.height(80.dp))
        }
    }
}
