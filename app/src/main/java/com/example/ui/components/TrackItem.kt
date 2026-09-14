package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.model.Track
import com.example.ui.theme.CyberPink
import com.example.ui.theme.DarkSurfaceCard
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary

@Composable
fun TrackItem(
    track: Track,
    isCurrentTrack: Boolean,
    isPlaying: Boolean,
    onClick: () -> Unit,
    onFavoriteClick: () -> Unit,
    onMoreClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (isCurrentTrack) DarkSurfaceElevated.copy(alpha = 0.85f) else Color.Transparent)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Thumbnail with indicator
        Box(
            modifier = Modifier.size(52.dp),
            contentAlignment = Alignment.Center
        ) {
            SongArtwork(
                thumbnailUrl = track.thumbnailUrl,
                title = track.title,
                artist = track.artist,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.size(52.dp)
            )

            if (isCurrentTrack) {
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black.copy(alpha = 0.5f)),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(NeonCyan),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Playing" else "Paused",
                            tint = Color.Black,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Title and Artist
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = track.title,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = if (isCurrentTrack) FontWeight.Bold else FontWeight.Medium,
                    fontSize = 15.sp
                ),
                color = if (isCurrentTrack) NeonCyan else TextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 2.dp)
            ) {
                // Quality tag
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(DarkSurfaceCard)
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                ) {
                    Text(
                        text = "HQ",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        color = NeonCyan
                    )
                }

                Spacer(modifier = Modifier.width(6.dp))

                Text(
                    text = "${track.artist}${if (track.album.isNotEmpty()) " • ${track.album}" else ""} • ${track.formattedDuration}",
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.sp),
                    color = TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // Favorite Button
        IconButton(
            onClick = onFavoriteClick,
            modifier = Modifier
                .size(48.dp)
                .testTag("track_favorite_btn_${track.id}")
        ) {
            Icon(
                imageVector = if (track.isFavorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                contentDescription = if (track.isFavorite) "Remove from favorites" else "Add to favorites",
                tint = if (track.isFavorite) CyberPink else TextMuted,
                modifier = Modifier.size(20.dp)
            )
        }

        // More options button
        IconButton(
            onClick = onMoreClick,
            modifier = Modifier
                .size(48.dp)
                .testTag("track_more_btn_${track.id}")
        ) {
            Icon(
                imageVector = Icons.Default.MoreVert,
                contentDescription = "Track options",
                tint = TextSecondary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
