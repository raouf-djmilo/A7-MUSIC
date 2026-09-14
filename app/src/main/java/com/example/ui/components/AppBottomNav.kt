package com.example.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.NeonCyan
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary

enum class AppDestination(
    val title: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val tag: String
) {
    HOME("Home", Icons.Filled.Home, Icons.Outlined.Home, "nav_home"),
    EXPLORE("Explore", Icons.Filled.Search, Icons.Outlined.Search, "nav_explore"),
    LIBRARY("Library", Icons.Filled.LibraryMusic, Icons.Outlined.LibraryMusic, "nav_library")
}

@Composable
fun AppBottomNav(
    currentDestination: AppDestination,
    onDestinationSelected: (AppDestination) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(
        modifier = modifier,
        containerColor = DarkSurface,
        tonalElevation = 8.dp
    ) {
        AppDestination.values().forEach { destination ->
            val isSelected = destination == currentDestination
            NavigationBarItem(
                selected = isSelected,
                onClick = { onDestinationSelected(destination) },
                icon = {
                    Icon(
                        imageVector = if (isSelected) destination.selectedIcon else destination.unselectedIcon,
                        contentDescription = destination.title,
                        modifier = Modifier.size(24.dp)
                    )
                },
                label = {
                    Text(
                        text = destination.title,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp)
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = NeonCyan,
                    selectedTextColor = NeonCyan,
                    unselectedIconColor = TextMuted,
                    unselectedTextColor = TextMuted,
                    indicatorColor = DarkSurfaceElevated
                ),
                modifier = Modifier.testTag(destination.tag)
            )
        }
    }
}
