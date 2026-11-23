import { StyleSheet, Dimensions } from 'react-native';
import { ThemeTokens } from '../../../theme/types';

const { width } = Dimensions.get('window');
export const CARD_SIZE = 144;
export const QUICK_TILE_WIDTH = (width - 40) / 2;

export const createMusicThemedStyles = (theme: ThemeTokens, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
    },
    headerTitleCol: {
      flex: 1,
    },
    greetingText: {
      color: theme.textPrimary,
      fontSize: 23,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    greetingSub: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    avatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: '#1DB954',
    },
    avatarImg: {
      width: '100%',
      height: '100%',
    },

    // ── Filter Chips: Soft Apple Tinted Liquid Glass ──
    filterScroll: {
      paddingHorizontal: 16,
      gap: 8,
      paddingBottom: 14,
    },
    filterChip: {
      paddingHorizontal: 15,
      paddingVertical: 7,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
    },
    filterChipActive: {
      backgroundColor: isDark ? 'rgba(48, 209, 88, 0.18)' : 'rgba(52, 199, 89, 0.15)',
      borderColor: isDark ? 'rgba(48, 209, 88, 0.45)' : 'rgba(52, 199, 89, 0.40)',
    },
    filterChipText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    filterChipTextActive: {
      color: isDark ? '#30D158' : '#248A3D',
      fontWeight: '700',
    },

    // ── Quick Jump 2x3 Grid ──
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 26,
    },
    quickTile: {
      width: QUICK_TILE_WIDTH,
      height: 54,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surface,
      borderRadius: 6,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    likedSongsTile: {
      backgroundColor: isDark ? 'rgba(69, 10, 245, 0.22)' : 'rgba(69, 10, 245, 0.12)',
      borderColor: 'rgba(142, 142, 229, 0.4)',
    },
    likedSongsArtwork: {
      width: 54,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickTileImg: {
      width: 54,
      height: 54,
      backgroundColor: theme.surfaceSubtle,
    },
    quickTileInfo: {
      flex: 1,
      paddingHorizontal: 8,
      justifyContent: 'center',
    },
    quickTileTitle: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 15,
    },
    quickTileSubtitle: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
    activeAccentText: {
      color: '#1DB954',
    },

    // ── Sections ──
    section: {
      marginBottom: 26,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sectionSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    cardsScroll: {
      paddingLeft: 16,
      paddingRight: 8,
      gap: 14,
    },

    // ── "Your Top Mixes" 144x144 Cards ──
    mixCardContainer: {
      width: CARD_SIZE,
    },
    mixArtworkWrap: {
      width: CARD_SIZE,
      height: CARD_SIZE,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.surfaceSubtle,
      position: 'relative',
      marginBottom: 8,
    },
    mixArtwork: {
      width: '100%',
      height: '100%',
    },
    mixSpotifyBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    mixBottomPill: {
      position: 'absolute',
      bottom: 8,
      left: 6,
      right: 6,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0, 0, 0, 0.82)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      overflow: 'hidden',
    },
    mixPillStripe: {
      width: 4,
      height: 14,
      borderRadius: 2,
      marginRight: 6,
    },
    mixPillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      flex: 1,
    },
    mixFloatingPlayBtn: {
      position: 'absolute',
      bottom: 38,
      right: 8,
    },
    mixTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    mixSubtitle: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '500',
      lineHeight: 14,
    },

    // ── "Picked for you" Featured Hero Glass Card ──
    pickedBannerCard: {
      marginHorizontal: 16,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
      flexDirection: 'row',
      padding: 12,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.06,
      shadowRadius: 6,
      elevation: 3,
    },
    pickedArtwork: {
      width: 86,
      height: 86,
      borderRadius: 10,
      backgroundColor: theme.surfaceSubtle,
    },
    pickedContent: {
      flex: 1,
      marginLeft: 14,
      justifyContent: 'center',
    },
    pickedTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 3,
      letterSpacing: -0.2,
    },
    pickedArtist: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 10,
    },
    pickedActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    // ── Standard 140x140 Track Card ──
    trackCardContainer: {
      width: CARD_SIZE,
    },
    trackCoverWrapper: {
      width: CARD_SIZE,
      height: CARD_SIZE,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.surfaceSubtle,
      position: 'relative',
      marginBottom: 8,
    },
    trackCoverImg: {
      width: '100%',
      height: '100%',
    },
    trackFloatingPlayBtn: {
      position: 'absolute',
      bottom: 8,
      right: 8,
    },
    trackCardTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    trackArtistRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    trackArtist: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '500',
      flexShrink: 1,
    },

    // ── Cadence 160 BPM Header ──
    cadenceTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cadenceBadge: {
      backgroundColor: 'rgba(255, 215, 0, 0.15)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(255, 215, 0, 0.4)',
    },
    cadenceBadgeText: {
      color: '#FFD700',
      fontSize: 11,
      fontWeight: '800',
    },

    // ── Favourite Artists Circular Row ──
    artistCircleContainer: {
      alignItems: 'center',
      width: 88,
    },
    artistAvatarWrapper: {
      width: 76,
      height: 76,
      borderRadius: 38,
      overflow: 'hidden',
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1.5,
      borderColor: theme.border,
      marginBottom: 6,
    },
    artistAvatar: {
      width: '100%',
      height: '100%',
    },
    artistNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: '100%',
    },
    artistCircleName: {
      color: theme.textPrimary,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
    },
    artistCircleBadge: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '500',
      marginTop: 1,
    },
  });

export const cleanTitleText = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
};
