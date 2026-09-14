package com.example

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.example.model.Track
import com.example.ui.components.TrackItem
import com.example.ui.theme.MyApplicationTheme
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = RobolectricDeviceQualifiers.Pixel8, sdk = [36])
class GreetingScreenshotTest {

  @get:Rule val composeTestRule = createComposeRule()

  @Test
  fun track_item_screenshot() {
    val sampleTrack = Track(
      id = "test_1",
      videoId = "vid_1",
      title = "Suavemente",
      artist = "Soolking",
      durationSeconds = 180,
      thumbnailUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300",
      category = "Rai & Maghreb"
    )
    composeTestRule.setContent {
      MyApplicationTheme {
        TrackItem(
          track = sampleTrack,
          isCurrentTrack = true,
          isPlaying = true,
          onClick = {},
          onFavoriteClick = {},
          onMoreClick = {}
        )
      }
    }

    composeTestRule.onRoot().captureRoboImage(filePath = "src/test/screenshots/greeting.png")
  }
}
