import type { SharedValue } from 'react-native-reanimated';
import type { Track } from '../../../store/useAudioStore';

export interface HomeTrack extends Track {
  id: string;
}

export interface CoverFlowMusicCarouselProps {
  tracks: Track[];
  onTrackSelect?: (track: Track) => void;
  onActiveCardChange?: (track: Track) => void;
  onLoadMore?: () => void;
}

export interface LiquidGlassDiscCardProps {
  track: Track;
  cardVirtualPos: number;
  virtualIndex: SharedValue<number>;
  onPress: (cardVirtualPos: number) => void;
  isCenter: boolean;
  isPlayingThisTrack: boolean;
}
