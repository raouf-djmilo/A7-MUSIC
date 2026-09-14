package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
  primary = NeonCyan,
  onPrimary = Color.Black,
  primaryContainer = ElectricViolet.copy(alpha = 0.3f),
  onPrimaryContainer = NeonCyan,
  secondary = ElectricViolet,
  onSecondary = Color.White,
  secondaryContainer = DarkSurfaceElevated,
  onSecondaryContainer = TextPrimary,
  tertiary = CyberPink,
  onTertiary = Color.White,
  background = DeepCharcoal,
  onBackground = TextPrimary,
  surface = DarkSurface,
  onSurface = TextPrimary,
  surfaceVariant = DarkSurfaceCard,
  onSurfaceVariant = TextSecondary,
  outline = DarkSurfaceElevated,
  outlineVariant = TextMuted
)

@Composable
fun MyApplicationTheme(
  darkTheme: Boolean = true,
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  MaterialTheme(
    colorScheme = DarkColorScheme,
    typography = Typography,
    content = content
  )
}

