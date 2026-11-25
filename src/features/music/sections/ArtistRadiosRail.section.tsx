import React, { memo, useCallback } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles } from '../styles/musicThemedStyles';
import type { ArtistRadioItem } from '../../../services/musicDnaService';
import { SpotifyRadioCoverCard } from '../components/SpotifyRadioCoverCard';

interface ArtistRadiosRailSectionProps {
  radios: ArtistRadioItem[];
  onOpenRadio: (radio: ArtistRadioItem) => void;
}

export const ArtistRadiosRailSection: React.FC<ArtistRadiosRailSectionProps> = memo(
  ({ radios, onOpenRadio }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    const renderItem = useCallback(
      ({ item }: { item: ArtistRadioItem }) => (
        <SpotifyRadioCoverCard radio={item} onPress={onOpenRadio} />
      ),
      [onOpenRadio]
    );

    if (!radios || radios.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Artist Radio</Text>
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={radios}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.cardsScroll}
          renderItem={renderItem}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={3}
          removeClippedSubviews={true}
        />
      </View>
    );
  },
  (prev, next) => prev.radios === next.radios
);

export default ArtistRadiosRailSection;
