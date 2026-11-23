import React, { memo, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles } from '../styles/musicThemedStyles';
import { CachedArtwork } from '../components/CachedArtwork';
import { getUniversalArtistAvatar } from '../../../utils/artworkHelper';
import { deduplicateArtists, ArtistItem } from '../engines/artistDedupe.helper';

interface FavoriteArtistsRailSectionProps {
  artists: (ArtistItem & { name: string; avatar: string; isOfficial?: boolean; id?: string; channelId?: string })[];
  onNavigateArtist?: (artistName: string, artistId?: string) => void;
}

export const FavoriteArtistsRailSection: React.FC<FavoriteArtistsRailSectionProps> = memo(
  ({ artists, onNavigateArtist }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    // 🛡️ UI Safety Net: Guarantees zero duplicate artists even with legacy cache payloads
    const cleanArtists = useMemo(() => deduplicateArtists(artists), [artists]);

    if (!cleanArtists || cleanArtists.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your favourite artists</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardsScroll}
        >
          {cleanArtists.map((artist, index) => {
            const avatarUri = getUniversalArtistAvatar(artist.avatar, artist.name);

            return (
              <TouchableOpacity
                key={`artist-${artist.name}-${index}`}
                style={styles.artistCircleContainer}
                activeOpacity={0.85}
                onPress={() => onNavigateArtist?.(artist.name, artist.channelId || artist.id)}
              >
                <View style={styles.artistAvatarWrapper}>
                  <CachedArtwork
                    uri={avatarUri}
                    style={styles.artistAvatar}
                    borderRadius={38}
                    fallbackIcon="person"
                    fallbackIconSize={26}
                    recyclingKey={`artist-${artist.name}`}
                  />
                </View>

                <View style={styles.artistNameRow}>
                  <Text style={styles.artistCircleName} numberOfLines={1}>
                    {artist.name}
                  </Text>
                  {artist.isOfficial && (
                    <Ionicons
                      name="checkmark-circle"
                      size={11}
                      color="#458eff"
                      style={{ marginLeft: 2 }}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  },
  (prev, next) => prev.artists === next.artists
);

export default FavoriteArtistsRailSection;
