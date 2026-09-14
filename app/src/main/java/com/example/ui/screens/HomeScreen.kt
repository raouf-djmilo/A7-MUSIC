package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Whatshot
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.model.Track
import com.example.ui.components.SongArtwork
import com.example.ui.components.TrackItem
import com.example.ui.theme.AdShieldGreen
import com.example.ui.theme.CyberPink
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceCard
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.DeepCharcoal
import com.example.ui.theme.ElectricViolet
import com.example.ui.theme.EmeraldGlow
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

@Composable
fun HomeScreen(
    curatedTracks: List<Track>,
    recentlyPlayed: List<Track>,
    categories: List<String>,
    selectedCategory: String,
    currentTrack: Track?,
    isPlaying: Boolean,
    onCategorySelect: (String) -> Unit,
    onTrackClick: (Track, List<Track>) -> Unit,
    onFavoriteClick: (Track) -> Unit,
    onMoreClick: (Track) -> Unit,
    onAdShieldClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(DeepCharcoal),
        contentPadding = PaddingValues(bottom = 96.dp)
    ) {
        // App Top Bar & Ad Shield Indicator
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "PurePlay Music",
                        style = MaterialTheme.typography.headlineMedium.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 24.sp,
                            letterSpacing = (-0.5).sp
                        ),
                        color = TextPrimary
                    )
                    Text(
                        text = "Zero Ads • High Fidelity Stream",
                        style = MaterialTheme.typography.bodySmall,
                        color = NeonCyan
                    )
                }

                // Ad-Shield Badge button
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(AdShieldGreen.copy(alpha = 0.15f))
                        .clickable { onAdShieldClick() }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Security,
                        contentDescription = "Ad Shield Status",
                        tint = AdShieldGreen,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "No Ads",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                        color = AdShieldGreen
                    )
                }
            }
        }

        // Featured Hero Banner
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .testTag("hero_banner_card"),
                colors = CardDefaults.cardColors(containerColor = Color.Transparent)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.horizontalGradient(
                                colors = listOf(
                                    ElectricViolet,
                                    Color(0xFF4C1D95),
                                    Color(0xFF0F172A)
                                )
                            )
                        )
                        .padding(20.dp)
                ) {
                    Column {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(NeonCyan)
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = "FEATURED MIX",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.ExtraBold,
                                    letterSpacing = 1.sp
                                ),
                                color = Color.Black
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        Text(
                            text = "Maghreb & Global Top 50",
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 22.sp
                            ),
                            color = TextPrimary
                        )

                        Text(
                            text = "All your favorite YouTube tracks streamed instantly in studio 320kbps without ads",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.85f),
                            modifier = Modifier.padding(top = 4.dp, bottom = 14.dp)
                        )

                        Button(
                            onClick = {
                                if (curatedTracks.isNotEmpty()) {
                                    onTrackClick(curatedTracks.first(), curatedTracks)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = NeonCyan,
                                contentColor = Color.Black
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.testTag("hero_play_btn")
                        ) {
                            Icon(imageVector = Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Play Trending Mix",
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        // Category Filter Chips
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                categories.forEach { category ->
                    val isSelected = category == selectedCategory
                    FilterChip(
                        selected = isSelected,
                        onClick = { onCategorySelect(category) },
                        label = {
                            Text(
                                text = category,
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                )
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = NeonCyan,
                            selectedLabelColor = Color.Black,
                            containerColor = DarkSurfaceCard,
                            labelColor = TextPrimary
                        ),
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier.testTag("category_chip_$category")
                    )
                }
            }
        }

        // Spotlight Top Rai & Arabic Hits
        if (selectedCategory == "All" || selectedCategory == "Rai & Maghreb") {
            val raiTracks = curatedTracks.filter { it.category == "Rai & Maghreb" || it.category == "Arabic Hits" }
            if (raiTracks.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.padding(top = 12.dp)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Whatshot,
                                contentDescription = null,
                                tint = EmeraldGlow,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "Top Algerian & Maghreb Hits",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 18.sp
                                ),
                                color = TextPrimary
                            )
                        }

                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            items(raiTracks) { track ->
                                Card(
                                    modifier = Modifier
                                        .width(140.dp)
                                        .clickable { onTrackClick(track, curatedTracks) },
                                    colors = CardDefaults.cardColors(containerColor = DarkSurfaceCard),
                                    shape = RoundedCornerShape(14.dp)
                                ) {
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .aspectRatio(1f),
                                            contentAlignment = Alignment.BottomEnd
                                        ) {
                                            SongArtwork(
                                                thumbnailUrl = track.thumbnailUrl,
                                                title = track.title,
                                                artist = track.artist,
                                                shape = RoundedCornerShape(10.dp),
                                                modifier = Modifier.fillMaxSize()
                                            )

                                            Box(
                                                modifier = Modifier
                                                    .padding(6.dp)
                                                    .size(32.dp)
                                                    .clip(CircleShape)
                                                    .background(NeonCyan)
                                                    .shadow(4.dp, CircleShape),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.PlayArrow,
                                                    contentDescription = "Play",
                                                    tint = Color.Black,
                                                    modifier = Modifier.size(20.dp)
                                                )
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(8.dp))

                                        Text(
                                            text = track.title,
                                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                            color = TextPrimary,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = track.artist,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = TextSecondary,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Section Title: Tracks List
        item {
            Text(
                text = if (selectedCategory == "All") "Popular & Recommended" else "$selectedCategory Tracks",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                ),
                color = TextPrimary,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
            )
        }

        // Track List items
        items(curatedTracks) { track ->
            val isCurrent = currentTrack?.id == track.id
            TrackItem(
                track = track,
                isCurrentTrack = isCurrent,
                isPlaying = isPlaying && isCurrent,
                onClick = { onTrackClick(track, curatedTracks) },
                onFavoriteClick = { onFavoriteClick(track) },
                onMoreClick = { onMoreClick(track) },
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
            )
        }

        // Recently Played horizontal row if available
        if (recentlyPlayed.isNotEmpty()) {
            item {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    Text(
                        text = "Recently Played",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        ),
                        color = TextPrimary,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )

                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(recentlyPlayed) { track ->
                            Card(
                                modifier = Modifier
                                    .width(130.dp)
                                    .clickable { onTrackClick(track, recentlyPlayed) },
                                colors = CardDefaults.cardColors(containerColor = DarkSurfaceCard),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Column(modifier = Modifier.padding(8.dp)) {
                                    SongArtwork(
                                        thumbnailUrl = track.thumbnailUrl,
                                        title = track.title,
                                        artist = track.artist,
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .aspectRatio(1f)
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = track.title,
                                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                                        color = TextPrimary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = track.artist,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TextSecondary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
