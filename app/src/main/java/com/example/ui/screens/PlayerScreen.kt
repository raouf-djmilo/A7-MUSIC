package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.NightlightRound
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.model.AudioQuality
import com.example.model.EqualizerPreset
import com.example.model.PlaybackMode
import com.example.model.Track
import com.example.ui.components.AdShieldInfoDialog
import com.example.ui.components.AudioSettingsDialog
import com.example.ui.components.MusicVisualizer
import com.example.ui.components.SleepTimerDialog
import com.example.ui.components.SongArtwork
import com.example.ui.components.TrackInfoDetailsDialog
import com.example.ui.theme.AdShieldGreen
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerScreen(
    track: Track,
    isPlaying: Boolean,
    isBuffering: Boolean,
    currentPositionMs: Int,
    durationMs: Int,
    queue: List<Track>,
    playbackMode: PlaybackMode,
    isShuffle: Boolean,
    audioQuality: AudioQuality,
    equalizerPreset: EqualizerPreset,
    sleepTimerSecondsLeft: Int,
    visualizerBands: List<Float>,
    adsBlockedCount: Int,
    playbackError: String? = null,
    onRetryClick: () -> Unit = {},
    onDismiss: () -> Unit,
    onPlayPauseClick: () -> Unit,
    onNextClick: () -> Unit,
    onPrevClick: () -> Unit,
    onSeekTo: (Int) -> Unit,
    onToggleFavorite: () -> Unit,
    onToggleShuffle: () -> Unit,
    onCyclePlaybackMode: () -> Unit,
    onQualityChange: (AudioQuality) -> Unit,
    onPresetChange: (EqualizerPreset) -> Unit,
    onStartSleepTimer: (Int) -> Unit,
    onCancelSleepTimer: () -> Unit,
    onSelectQueueTrack: (Track) -> Unit,
    modifier: Modifier = Modifier
) {
    var showLyrics by remember { mutableStateOf(false) }
    var showQueueSheet by remember { mutableStateOf(false) }
    var showAudioSettings by remember { mutableStateOf(false) }
    var showAdShieldInfo by remember { mutableStateOf(false) }
    var showSleepTimer by remember { mutableStateOf(false) }
    var showTrackDetails by remember { mutableStateOf(false) }
    var selectedSpeed by remember { mutableStateOf(1.0f) }

    val infiniteTransition = rememberInfiniteTransition(label = "vinyl_spin")
    val spinAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(12000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "spin"
    )

    Surface(
        modifier = modifier.fillMaxSize(),
        color = DeepCharcoal
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Subtle ambient gradient background glow
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                ElectricViolet.copy(alpha = 0.22f),
                                DarkSurface.copy(alpha = 0.8f),
                                DeepCharcoal
                            ),
                            radius = 1200f
                        )
                    )
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Top Header Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.size(48.dp).testTag("player_collapse_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.KeyboardArrowDown,
                            contentDescription = "Collapse player",
                            tint = TextPrimary,
                            modifier = Modifier.size(32.dp)
                        )
                    }

                    // Pure Stream Ad-Free Shield Badge
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(DarkSurfaceElevated)
                            .clickable { showAdShieldInfo = true }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Security,
                            contentDescription = null,
                            tint = AdShieldGreen,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "PURE STREAM",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            ),
                            color = AdShieldGreen
                        )
                    }

                    // Equalizer & Audio Settings button
                    IconButton(
                        onClick = { showAudioSettings = true },
                        modifier = Modifier.size(48.dp).testTag("audio_settings_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Equalizer,
                            contentDescription = "Audio settings",
                            tint = NeonCyan,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Middle: Album Artwork or Lyrics View
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    if (showLyrics) {
                        // Lyrics View
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(RoundedCornerShape(24.dp))
                                .background(DarkSurfaceCard)
                                .padding(20.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .verticalScroll(rememberScrollState()),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "LYRICS",
                                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                                    color = NeonCyan,
                                    modifier = Modifier.padding(bottom = 16.dp)
                                )

                                val lyricsText = track.lyrics.ifEmpty {
                                    "♪ Playing ${track.title}\nBy ${track.artist}\n\nPure YouTube Stream Active\nEnjoy seamless studio quality audio with zero ads ♪"
                                }

                                Text(
                                    text = lyricsText,
                                    style = MaterialTheme.typography.bodyLarge.copy(
                                        lineHeight = 32.sp,
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.Medium
                                    ),
                                    color = TextPrimary,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                    } else {
                        // Spotify & Apple Music style Ultra HD Album Cover Art Card
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.85f)
                                .aspectRatio(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            SongArtwork(
                                thumbnailUrl = track.thumbnailUrl,
                                title = track.title,
                                artist = track.artist,
                                shape = RoundedCornerShape(20.dp),
                                showGlow = true,
                                glowColor = ElectricViolet,
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Track Title & Favorite Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = track.title,
                            style = MaterialTheme.typography.headlineSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 22.sp
                            ),
                            color = TextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(top = 4.dp)
                        ) {
                            Text(
                                text = track.artist,
                                style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp),
                                color = TextSecondary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(NeonCyan.copy(alpha = 0.15f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = audioQuality.badge,
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                    color = NeonCyan
                                )
                            }
                        }

                        if (track.album.isNotEmpty() || track.channelName.isNotEmpty()) {
                            Text(
                                text = if (track.album.isNotEmpty()) "Album: ${track.album}" else track.channelName,
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp),
                                color = TextMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }

                    IconButton(
                        onClick = { showTrackDetails = true },
                        modifier = Modifier.size(44.dp).testTag("player_info_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = "Track details",
                            tint = NeonCyan,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    IconButton(
                        onClick = onToggleFavorite,
                        modifier = Modifier.size(44.dp).testTag("player_favorite_toggle")
                    ) {
                        Icon(
                            imageVector = if (track.isFavorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                            contentDescription = "Toggle favorite",
                            tint = if (track.isFavorite) CyberPink else TextMuted,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Playback Error Banner (Circuit Breaker Notification)
                if (!playbackError.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFFE53935).copy(alpha = 0.18f))
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
                            Spacer(modifier = Modifier.width(8.dp))
                            Button(
                                onClick = onRetryClick,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFFE53935),
                                    contentColor = Color.White
                                ),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier.height(30.dp)
                            ) {
                                Text("Retry", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // Animated Visualizer
                MusicVisualizer(
                    isPlaying = isPlaying,
                    bands = visualizerBands,
                    height = 36.dp,
                    barCount = 18,
                    modifier = Modifier.padding(vertical = 4.dp)
                )

                // Seek Bar Slider
                val currentSec = currentPositionMs / 1000
                val totalSec = if (durationMs > 0) durationMs / 1000 else track.durationSeconds
                val sliderValue = if (durationMs > 0) (currentPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f) else 0f

                Slider(
                    value = sliderValue,
                    onValueChange = { factor ->
                        val targetMs = (factor * (if (durationMs > 0) durationMs else track.durationSeconds * 1000)).toInt()
                        onSeekTo(targetMs)
                    },
                    modifier = Modifier.fillMaxWidth().testTag("player_seek_slider"),
                    colors = SliderDefaults.colors(
                        thumbColor = NeonCyan,
                        activeTrackColor = NeonCyan,
                        inactiveTrackColor = DarkSurfaceElevated
                    )
                )

                // Time labels
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "%d:%02d".format(currentSec / 60, currentSec % 60),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary
                    )
                    Text(
                        text = "%d:%02d".format(totalSec / 60, totalSec % 60),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Playback Control Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Shuffle
                    IconButton(
                        onClick = onToggleShuffle,
                        modifier = Modifier.size(48.dp).testTag("player_shuffle_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shuffle,
                            contentDescription = "Shuffle",
                            tint = if (isShuffle) NeonCyan else TextMuted,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    // Previous
                    IconButton(
                        onClick = onPrevClick,
                        modifier = Modifier.size(52.dp).testTag("player_prev_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.SkipPrevious,
                            contentDescription = "Previous track",
                            tint = TextPrimary,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    // Play/Pause Big Button
                    IconButton(
                        onClick = onPlayPauseClick,
                        modifier = Modifier.size(68.dp).testTag("player_main_play_pause_btn")
                    ) {
                        if (isBuffering) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(44.dp),
                                color = NeonCyan,
                                strokeWidth = 3.dp
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(64.dp)
                                    .clip(CircleShape)
                                    .background(NeonCyan)
                                    .shadow(12.dp, shape = CircleShape, spotColor = NeonCyan),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                    contentDescription = if (isPlaying) "Pause" else "Play",
                                    tint = Color.Black,
                                    modifier = Modifier.size(36.dp)
                                )
                            }
                        }
                    }

                    // Next
                    IconButton(
                        onClick = onNextClick,
                        modifier = Modifier.size(52.dp).testTag("player_next_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.SkipNext,
                            contentDescription = "Next track",
                            tint = TextPrimary,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    // Repeat Mode
                    IconButton(
                        onClick = onCyclePlaybackMode,
                        modifier = Modifier.size(48.dp).testTag("player_repeat_btn")
                    ) {
                        Icon(
                            imageVector = if (playbackMode == PlaybackMode.REPEAT_ONE) Icons.Default.RepeatOne else Icons.Default.Repeat,
                            contentDescription = "Repeat mode",
                            tint = if (playbackMode != PlaybackMode.REPEAT_OFF) NeonCyan else TextMuted,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Bottom Action Tools Row: Lyrics, Sleep Timer, Queue
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Lyrics button
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (showLyrics) NeonCyan.copy(alpha = 0.2f) else DarkSurfaceElevated)
                            .clickable { showLyrics = !showLyrics }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.TextFields,
                            contentDescription = "Lyrics",
                            tint = if (showLyrics) NeonCyan else TextSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Lyrics",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (showLyrics) NeonCyan else TextSecondary
                        )
                    }

                    // Sleep Timer button
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (sleepTimerSecondsLeft > 0) ElectricViolet.copy(alpha = 0.2f) else DarkSurfaceElevated)
                            .clickable { showSleepTimer = true }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.NightlightRound,
                            contentDescription = "Sleep timer",
                            tint = if (sleepTimerSecondsLeft > 0) ElectricViolet else TextSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (sleepTimerSecondsLeft > 0) "%02d:%02d".format(sleepTimerSecondsLeft / 60, sleepTimerSecondsLeft % 60) else "Timer",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (sleepTimerSecondsLeft > 0) ElectricViolet else TextSecondary
                        )
                    }

                    // Queue button
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(DarkSurfaceElevated)
                            .clickable { showQueueSheet = true }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.QueueMusic,
                            contentDescription = "Queue",
                            tint = TextSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Queue (${queue.size})",
                            style = MaterialTheme.typography.labelSmall,
                            color = TextSecondary
                        )
                    }
                }
            }
        }
    }

    // Queue Bottom Sheet
    if (showQueueSheet) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(
            onDismissRequest = { showQueueSheet = false },
            sheetState = sheetState,
            containerColor = DarkSurface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Up Next (${queue.size})",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = TextPrimary
                    )
                    IconButton(onClick = { showQueueSheet = false }) {
                        Icon(imageVector = Icons.Default.Close, contentDescription = "Close", tint = TextSecondary)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                LazyColumn(modifier = Modifier.height(350.dp)) {
                    itemsIndexed(queue) { index, item ->
                        val isItemCurrent = item.id == track.id
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isItemCurrent) DarkSurfaceElevated else Color.Transparent)
                                .clickable {
                                    onSelectQueueTrack(item)
                                    showQueueSheet = false
                                }
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "${index + 1}",
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                color = if (isItemCurrent) NeonCyan else TextMuted,
                                modifier = Modifier.width(28.dp)
                            )
                            AsyncImage(
                                model = item.thumbnailUrl,
                                contentDescription = null,
                                modifier = Modifier.size(40.dp).clip(RoundedCornerShape(6.dp)),
                                contentScale = ContentScale.Crop
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.title,
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = if (isItemCurrent) FontWeight.Bold else FontWeight.Normal),
                                    color = if (isItemCurrent) NeonCyan else TextPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = item.artist,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary,
                                    maxLines = 1
                                )
                            }
                            Text(
                                text = item.formattedDuration,
                                style = MaterialTheme.typography.bodySmall,
                                color = TextMuted
                            )
                        }
                    }
                }
            }
        }
    }

    // Dialogs
    if (showSleepTimer) {
        SleepTimerDialog(
            secondsLeft = sleepTimerSecondsLeft,
            onStartTimer = onStartSleepTimer,
            onCancelTimer = onCancelSleepTimer,
            onDismiss = { showSleepTimer = false }
        )
    }

    if (showAdShieldInfo) {
        AdShieldInfoDialog(
            blockedCount = adsBlockedCount,
            onDismiss = { showAdShieldInfo = false }
        )
    }

    if (showAudioSettings) {
        AudioSettingsDialog(
            currentQuality = audioQuality,
            currentPreset = equalizerPreset,
            onQualityChange = onQualityChange,
            onPresetChange = onPresetChange,
            onDismiss = { showAudioSettings = false }
        )
    }

    if (showTrackDetails) {
        TrackInfoDetailsDialog(
            track = track,
            onDismiss = { showTrackDetails = false }
        )
    }
}
