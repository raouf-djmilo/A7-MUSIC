import React, { memo } from 'react';
import { ScrollView, TouchableOpacity, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles } from '../styles/musicThemedStyles';
import { FILTER_PILLS, FilterPill } from '../engines/filter.engine';

interface MoodFilterBarSectionProps {
  activeFilter: string;
  onSelectFilter: (filter: string) => void;
}

export const MoodFilterBarSection: React.FC<MoodFilterBarSectionProps> = memo(
  ({ activeFilter, onSelectFilter }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {FILTER_PILLS.map((pill) => {
          const isSelected = activeFilter === pill;
          return (
            <TouchableOpacity
              key={`pill-${pill}`}
              style={[styles.filterChip, isSelected && styles.filterChipActive]}
              activeOpacity={0.75}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelectFilter(pill);
              }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isSelected && styles.filterChipTextActive,
                ]}
              >
                {pill}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  },
  (prev, next) => prev.activeFilter === next.activeFilter
);

export default MoodFilterBarSection;
