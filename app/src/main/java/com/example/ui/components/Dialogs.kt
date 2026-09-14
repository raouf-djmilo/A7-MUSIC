package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.NightlightRound
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.AudioQuality
import com.example.model.EqualizerPreset
import com.example.model.Playlist
import com.example.model.Track
import com.example.ui.theme.AdShieldGreen
import com.example.ui.theme.CyberPink
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceCard
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.ElectricViolet
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

@Composable
fun SleepTimerDialog(
    secondsLeft: Int,
    onStartTimer: (Int) -> Unit,
    onCancelTimer: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.NightlightRound,
                    contentDescription = null,
                    tint = ElectricViolet,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Sleep Timer",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )
            }
        },
        text = {
            Column {
                if (secondsLeft > 0) {
                    val mins = secondsLeft / 60
                    val secs = secondsLeft % 60
                    Card(
                        colors = CardDefaults.cardColors(containerColor = DarkSurfaceCard),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Active Timer",
                                style = MaterialTheme.typography.labelMedium,
                                color = TextSecondary
                            )
                            Text(
                                text = "%02d:%02d".format(mins, secs),
                                style = MaterialTheme.typography.headlineLarge.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 32.sp
                                ),
                                color = NeonCyan
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = onCancelTimer,
                                colors = ButtonDefaults.buttonColors(containerColor = CyberPink.copy(alpha = 0.2f), contentColor = CyberPink),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.testTag("sleep_timer_cancel_btn")
                            ) {
                                Text("Turn Off Timer")
                            }
                        }
                    }
                }

                Text(
                    text = "Select duration until playback pauses automatically:",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary,
                    modifier = Modifier.padding(bottom = 12.dp)
                )

                val presets = listOf(15, 30, 45, 60, 90)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    presets.take(3).forEach { min ->
                        Button(
                            onClick = { onStartTimer(min) },
                            modifier = Modifier.weight(1f).testTag("sleep_preset_${min}m"),
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceCard, contentColor = TextPrimary),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("${min}m", fontSize = 13.sp)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    presets.drop(3).forEach { min ->
                        Button(
                            onClick = { onStartTimer(min) },
                            modifier = Modifier.weight(1f).testTag("sleep_preset_${min}m"),
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceCard, contentColor = TextPrimary),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("${min}m", fontSize = 13.sp)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = NeonCyan)
            }
        }
    )
}

@Composable
fun AddToPlaylistDialog(
    track: Track,
    playlists: List<Playlist>,
    onAddToPlaylist: (Long) -> Unit,
    onCreateNewPlaylist: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var isCreatingNew by remember { mutableStateOf(false) }
    var newPlaylistName by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.QueueMusic,
                    contentDescription = null,
                    tint = NeonCyan,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Add to Playlist",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                    color = NeonCyan,
                    maxLines = 1
                )
                Text(
                    text = track.artist,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                    maxLines = 1,
                    modifier = Modifier.padding(bottom = 12.dp)
                )

                if (isCreatingNew) {
                    OutlinedTextField(
                        value = newPlaylistName,
                        onValueChange = { newPlaylistName = it },
                        label = { Text("Playlist Name") },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = NeonCyan,
                            unfocusedBorderColor = DarkSurfaceElevated,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth().testTag("new_playlist_input")
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = { isCreatingNew = false }) {
                            Text("Cancel", color = TextSecondary)
                        }
                        Button(
                            onClick = {
                                if (newPlaylistName.isNotBlank()) {
                                    onCreateNewPlaylist(newPlaylistName.trim())
                                    newPlaylistName = ""
                                    isCreatingNew = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black),
                            modifier = Modifier.testTag("create_playlist_confirm_btn")
                        ) {
                            Text("Create")
                        }
                    }
                } else {
                    Button(
                        onClick = { isCreatingNew = true },
                        colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated, contentColor = NeonCyan),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth().testTag("add_new_playlist_btn")
                    ) {
                        Icon(imageVector = Icons.Default.Add, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Create New Playlist")
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    if (playlists.isEmpty()) {
                        Text(
                            text = "No playlists created yet. Create one above!",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextMuted,
                            modifier = Modifier.padding(vertical = 12.dp)
                        )
                    } else {
                        LazyColumn(modifier = Modifier.height(180.dp)) {
                            items(playlists) { playlist ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable { onAddToPlaylist(playlist.id) }
                                        .padding(horizontal = 8.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(36.dp)
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(ElectricViolet.copy(alpha = 0.3f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.QueueMusic,
                                            contentDescription = null,
                                            tint = ElectricViolet,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = playlist.name,
                                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                            color = TextPrimary
                                        )
                                        Text(
                                            text = "${playlist.trackCount} tracks",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = TextSecondary
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = NeonCyan)
            }
        }
    )
}

@Composable
fun AdShieldInfoDialog(
    blockedCount: Int,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(AdShieldGreen.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Security,
                        contentDescription = null,
                        tint = AdShieldGreen,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Pure Stream Ad-Shield",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )
            }
        },
        text = {
            Column {
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurfaceCard),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "🛡️ Protection Status:",
                                style = MaterialTheme.typography.labelLarge,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "ACTIVE & SECURE",
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                color = AdShieldGreen
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "🚫 YouTube Ads Intercepted:",
                                style = MaterialTheme.typography.labelLarge,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "$blockedCount Ads Blocked",
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                color = NeonCyan
                            )
                        }
                    }
                }

                Text(
                    text = "How PurePlay Stream Works:",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = TextPrimary,
                    modifier = Modifier.padding(bottom = 6.dp)
                )
                Text(
                    text = "• Pure audio stream extraction bypassing video ads\n• Continuous background audio playback with zero interruptions\n• Ultra Studio 320 kbps high fidelity audio processing\n• No promotional audio overlays or mid-roll pauses",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                    lineHeight = 20.sp
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = AdShieldGreen, contentColor = Color.Black)
            ) {
                Text("Got It, Enjoy Music!")
            }
        }
    )
}

@Composable
fun AudioSettingsDialog(
    currentQuality: AudioQuality,
    currentPreset: EqualizerPreset,
    onQualityChange: (AudioQuality) -> Unit,
    onPresetChange: (EqualizerPreset) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.GraphicEq,
                    contentDescription = null,
                    tint = NeonCyan,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Sound & Quality Engine",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )
            }
        },
        text = {
            Column {
                Text(
                    text = "AUDIO BITRATE QUALITY",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = NeonCyan,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                AudioQuality.values().forEach { quality ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (quality == currentQuality) DarkSurfaceElevated else Color.Transparent)
                            .clickable { onQualityChange(quality) }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = quality.title,
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                color = if (quality == currentQuality) NeonCyan else TextPrimary
                            )
                            Text(
                                text = quality.bitrate,
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary
                            )
                        }
                        if (quality == currentQuality) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = NeonCyan,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "EQUALIZER PRESETS",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = ElectricViolet,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                EqualizerPreset.values().forEach { preset ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (preset == currentPreset) DarkSurfaceElevated else Color.Transparent)
                            .clickable { onPresetChange(preset) }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = preset.title,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                            color = if (preset == currentPreset) ElectricViolet else TextPrimary,
                            modifier = Modifier.weight(1f)
                        )
                        if (preset == currentPreset) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = ElectricViolet,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Done", color = NeonCyan)
            }
        }
    )
}

@Composable
fun TrackInfoDetailsDialog(
    track: Track,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.HighQuality,
                    contentDescription = null,
                    tint = NeonCyan,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Track & Studio Details",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
            ) {
                // Spotify-grade High Resolution Cover Preview
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(DarkSurfaceCard),
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(
                        model = track.thumbnailUrl,
                        contentDescription = track.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                DetailItemRow(label = "Song Title", value = track.title, isBold = true)
                DetailItemRow(label = "Artist / Performer", value = track.artist, isBold = true)
                DetailItemRow(label = "Album", value = track.album.ifEmpty { "Studio Master Recording" })
                DetailItemRow(label = "Channel / Record Studio", value = track.channelName.ifEmpty { "${track.artist} Official" })
                DetailItemRow(label = "Release Era", value = track.releaseYear.ifEmpty { "2024 (Lossless)" })
                DetailItemRow(label = "Streams / Fidelity", value = track.viewsCountFormatted.ifEmpty { "Ultra 320 kbps Studio Audio" })

                if (track.artistBio.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "ARTIST & STUDIO BIOGRAPHY",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                        color = ElectricViolet,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                    Text(
                        text = track.artistBio,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        lineHeight = 18.sp
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = NeonCyan, contentColor = Color.Black)
            ) {
                Text("Got It")
            }
        }
    )
}

@Composable
private fun DetailItemRow(label: String, value: String, isBold: Boolean = false) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, fontWeight = FontWeight.SemiBold),
            color = TextMuted
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = if (isBold) FontWeight.Bold else FontWeight.Normal,
                fontSize = 14.sp
            ),
            color = TextPrimary
        )
    }
}
