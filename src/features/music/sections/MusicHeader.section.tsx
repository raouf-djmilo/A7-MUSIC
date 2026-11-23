import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CachedArtwork } from '../components/CachedArtwork';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles } from '../styles/musicThemedStyles';
import { TimeContextInfo } from '../engines/musicData.engine';

interface MusicHeaderSectionProps {
  timeContext: TimeContextInfo;
  userAvatarUrl?: string | null;
  onPressProfile: () => void;
}

export const MusicHeaderSection: React.FC<MusicHeaderSectionProps> = memo(
  ({ timeContext, userAvatarUrl, onPressProfile }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    return (
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <Text style={styles.greetingText}>{timeContext.greeting}</Text>
          <Text style={styles.greetingSub}>{timeContext.subtitle}</Text>
        </View>

        <TouchableOpacity
          style={styles.avatarBtn}
          activeOpacity={0.8}
          onPress={onPressProfile}
        >
          <CachedArtwork
            uri={userAvatarUrl}
            style={styles.avatarImg}
            borderRadius={18}
            fallbackIcon="person"
            fallbackIconSize={18}
          />
        </TouchableOpacity>
      </View>
    );
  },
  (prev, next) =>
    prev.timeContext.greeting === next.timeContext.greeting &&
    prev.timeContext.subtitle === next.timeContext.subtitle &&
    prev.userAvatarUrl === next.userAvatarUrl
);

export default MusicHeaderSection;
