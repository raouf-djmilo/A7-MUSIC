package com.example.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.ui.theme.CyberPink
import com.example.ui.theme.ElectricViolet
import com.example.ui.theme.NeonCyan

@Composable
fun MusicVisualizer(
    isPlaying: Boolean,
    bands: List<Float> = emptyList(),
    modifier: Modifier = Modifier,
    height: Dp = 48.dp,
    barCount: Int = 16,
    barColorStart: Color = NeonCyan,
    barColorEnd: Color = CyberPink
) {
    // Check if running in Live Preview or design inspector
    val isPreview = LocalInspectionMode.current

    if (isPreview || !isPlaying) {
        // Fast static representation to eliminate GPU/Choreographer overhead in preview/idle
        val staticRatios = remember {
            listOf(0.25f, 0.55f, 0.40f, 0.75f, 0.50f, 0.85f, 0.45f, 0.65f, 0.35f, 0.70f, 0.50f, 0.80f, 0.40f, 0.60f, 0.30f, 0.20f)
        }
        Canvas(
            modifier = modifier
                .fillMaxWidth()
                .height(height)
        ) {
            val totalWidth = size.width
            val canvasHeight = size.height
            val spacing = 3.dp.toPx()
            val usableWidth = totalWidth - (spacing * (barCount - 1))
            val barWidth = (usableWidth / barCount).coerceAtLeast(2.dp.toPx())

            for (i in 0 until barCount) {
                val ratio = staticRatios[i % staticRatios.size]
                val barHeight = canvasHeight * ratio
                val x = i * (barWidth + spacing)
                val y = canvasHeight - barHeight

                val brush = Brush.verticalGradient(
                    colors = listOf(barColorStart, ElectricViolet, barColorEnd),
                    startY = y,
                    endY = canvasHeight
                )

                drawRoundRect(
                    brush = brush,
                    topLeft = Offset(x, y),
                    size = Size(barWidth, barHeight),
                    cornerRadius = CornerRadius(barWidth / 2, barWidth / 2)
                )
            }
        }
    } else {
        // Active playback mode: smooth and throttled animation
        val infiniteTransition = rememberInfiniteTransition(label = "visualizer_anim")
        val pulseAnim by infiniteTransition.animateFloat(
            initialValue = 0.8f,
            targetValue = 1.2f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 400, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse
            ),
            label = "pulse"
        )

        Canvas(
            modifier = modifier
                .fillMaxWidth()
                .height(height)
        ) {
            val totalWidth = size.width
            val canvasHeight = size.height
            val spacing = 3.dp.toPx()
            val usableWidth = totalWidth - (spacing * (barCount - 1))
            val barWidth = (usableWidth / barCount).coerceAtLeast(2.dp.toPx())

            for (i in 0 until barCount) {
                val bandValue = bands.getOrElse(i) { 0.35f }
                val rawFactor = (bandValue * pulseAnim).coerceIn(0.12f, 0.98f)
                val barHeight = canvasHeight * rawFactor
                val x = i * (barWidth + spacing)
                val y = canvasHeight - barHeight

                val brush = Brush.verticalGradient(
                    colors = listOf(barColorStart, ElectricViolet, barColorEnd),
                    startY = y,
                    endY = canvasHeight
                )

                drawRoundRect(
                    brush = brush,
                    topLeft = Offset(x, y),
                    size = Size(barWidth, barHeight),
                    cornerRadius = CornerRadius(barWidth / 2, barWidth / 2)
                )
            }
        }
    }
}
