package com.example.model

data class Track(
    val id: String,
    val videoId: String,
    val title: String,
    val artist: String,
    val durationSeconds: Int,
    val thumbnailUrl: String,
    val streamUrl: String? = null,
    val category: String = "Trending",
    val isFavorite: Boolean = false,
    val lyrics: String = "",
    val playsCount: Int = 0,
    val highQualityAvailable: Boolean = true,
    val album: String = "",
    val channelName: String = "",
    val artistBio: String = "",
    val releaseYear: String = "",
    val viewsCountFormatted: String = ""
) {
    val formattedDuration: String
        get() {
            val minutes = durationSeconds / 60
            val seconds = durationSeconds % 60
            return "%d:%02d".format(minutes, seconds)
        }
}

data class Playlist(
    val id: Long = 0,
    val name: String,
    val description: String = "",
    val coverUrl: String = "",
    val trackCount: Int = 0
)

enum class PlaybackMode {
    REPEAT_OFF,
    REPEAT_ALL,
    REPEAT_ONE
}

enum class AudioQuality(val title: String, val bitrate: String, val badge: String) {
    DATA_SAVER("Data Saver", "96 kbps", "SD"),
    STANDARD("High Quality", "160 kbps", "HQ"),
    ULTRA("Ultra Studio", "320 kbps", "HD 320K")
}

enum class EqualizerPreset(val title: String) {
    FLAT("Flat"),
    BASS_BOOST("Bass Boost 3D"),
    VOCAL("Vocal Clarity"),
    ELECTRONIC("Electronic EDM"),
    ACOUSTIC("Acoustic & Rai"),
    CINEMATIC("Cinematic Hall")
}
