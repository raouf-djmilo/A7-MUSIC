import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import {
  getFirebaseUserProfile,
  upsertFirebaseUserProfile,
  getFirebaseLikedSongs,
} from '../services/firebaseMusicDb';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme/ThemeContext';
import { useAudioStore } from '../store/useAudioStore';
import {
  fetchTotalListeningSeconds,
  subscribeListeningTime,
} from '../services/listeningTimeService';
import { DynamicBottomSheet, DynamicBottomSheetRef } from '../components/DynamicBottomSheet';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';

const APPLE_AVATAR_PRESETS: Array<{ emoji: string; colors: readonly [string, string] }> = [
  { emoji: '🎧', colors: ['#38BDF8', '#007AFF'] },
  { emoji: '🎵', colors: ['#A855F7', '#6366F1'] },
  { emoji: '✨', colors: ['#F59E0B', '#EC4899'] },
  { emoji: '🎹', colors: ['#10B981', '#0EA5E9'] },
  { emoji: '🔥', colors: ['#FB7185', '#F97316'] },
  { emoji: '💿', colors: ['#60A5FA', '#8B5CF6'] },
  { emoji: '🎙️', colors: ['#34D399', '#059669'] },
  { emoji: '🌊', colors: ['#22D3EE', '#2563EB'] },
];

const formatMinutesAndSeconds = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins} د ${secs} ث`;
};

const hashSeed = (seed: string): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const ProfileScreen = () => {
  const { user, updateUser } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const { isDark, toggleTheme } = useTheme();

  const [profile, setProfile] = useState<any>(null);
  const [firestoreLikesCount, setFirestoreLikesCount] = useState<number>(0);
  const [listeningSeconds, setListeningSeconds] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarSeedOffset, setAvatarSeedOffset] = useState(0);

  // Edit Profile States (Full Name only — username stays fixed)
  const [showEdit, setShowEdit] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [saving, setSaving] = useState(false);

  const editSheetRef = useRef<DynamicBottomSheetRef>(null);

  const palette = isDark
    ? {
        baseBg: '#070A12',
        orbTop: ['rgba(0, 122, 255, 0.2)', 'rgba(56, 189, 248, 0.06)', 'transparent'] as const,
        orbBottom: ['transparent', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 80, 200, 0.14)'] as const,
        textPrimary: '#FFFFFF',
        textSecondary: 'rgba(255, 255, 255, 0.62)',
        textMuted: 'rgba(255, 255, 255, 0.42)',
        cardBg: 'rgba(18, 22, 30, 0.48)',
        cardBorder: 'rgba(255, 255, 255, 0.14)',
        cardTopBorder: 'rgba(255, 255, 255, 0.34)',
        pillBorder: 'rgba(255, 255, 255, 0.22)',
        inputBg: 'rgba(255, 255, 255, 0.06)',
        inputBorder: 'rgba(255, 255, 255, 0.12)',
        accentBlue: '#38BDF8',
        accentPink: '#EC4899',
        accentGreen: '#34C759',
      }
    : {
        baseBg: '#F2F5FA',
        orbTop: ['rgba(0, 122, 255, 0.16)', 'rgba(56, 189, 248, 0.07)', 'transparent'] as const,
        orbBottom: ['transparent', 'rgba(99, 102, 241, 0.09)', 'rgba(0, 122, 255, 0.12)'] as const,
        textPrimary: '#0F172A',
        textSecondary: 'rgba(15, 23, 42, 0.65)',
        textMuted: 'rgba(15, 23, 42, 0.44)',
        cardBg: 'rgba(255, 255, 255, 0.68)',
        cardBorder: 'rgba(15, 23, 42, 0.08)',
        cardTopBorder: 'rgba(255, 255, 255, 0.95)',
        pillBorder: 'rgba(15, 23, 42, 0.12)',
        inputBg: 'rgba(15, 23, 42, 0.045)',
        inputBorder: 'rgba(15, 23, 42, 0.1)',
        accentBlue: '#007AFF',
        accentPink: '#DB2777',
        accentGreen: '#16A34A',
      };

  const fetchProfileData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [prof, likes, seconds] = await Promise.all([
        getFirebaseUserProfile(user.id),
        getFirebaseLikedSongs(user.id),
        fetchTotalListeningSeconds(user.id),
      ]);

      if (prof) {
        setProfile(prof);
        setEditFullName(prof.full_name || user.full_name || '');
      } else {
        setEditFullName(user.full_name || '');
      }

      setFirestoreLikesCount(likes.length);
      setListeningSeconds(seconds);
    } catch {
      // Preserve existing state silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, user?.full_name]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  useEffect(() => {
    const unsubscribe = subscribeListeningTime((total) => {
      setListeningSeconds(total);
    });
    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const displayUser = profile || user;

  const avatarPreset = useMemo(() => {
    const seed = `${displayUser?.id || 'guest'}_${displayUser?.username || 'a7'}`;
    const idx = (hashSeed(seed) + avatarSeedOffset) % APPLE_AVATAR_PRESETS.length;
    return APPLE_AVATAR_PRESETS[idx];
  }, [displayUser?.id, displayUser?.username, avatarSeedOffset]);

  const handleRandomizeAvatar = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAvatarSeedOffset((prev) => prev + 1 + Math.floor(Math.random() * 5));
  };

  const handleSaveProfile = async () => {
    const cleanName = editFullName.trim();
    if (!user?.id || !cleanName) {
      Alert.alert('تنبيه', 'يرجى إدخال الاسم الكامل.');
      return;
    }
    setSaving(true);
    try {
      await upsertFirebaseUserProfile(user.id, {
        full_name: cleanName,
      });
      await updateUser({
        full_name: cleanName,
      });
      await fetchProfileData();
      setShowEdit(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('تعذر الحفظ', 'حدث خطأ أثناء تحديث الاسم، يرجى المحاولة مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const totalLikesCount = user ? Math.max(firestoreLikesCount, likedTrackIds.length) : likedTrackIds.length;

  return (
    <View style={[styles.container, { backgroundColor: palette.baseBg, paddingTop: insets.top + 6 }]}>
      {/* ── Ambient Liquid Gradient Background ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.baseBg }]} />
        <LinearGradient
          colors={palette.orbTop}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.85, y: 0.75 }}
          style={styles.ambientTop}
        />
        <LinearGradient
          colors={palette.orbBottom}
          start={{ x: 0.2, y: 0.3 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.ambientBottom}
        />
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      </View>

      {/* ── Top Liquid Glass Bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('Settings');
          }}
        >
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive
            borderRadius={20}
            style={[styles.topGlassBtn, { borderColor: palette.pillBorder }]}
          >
            <Ionicons name="settings-outline" size={20} color={palette.textPrimary} />
          </LiquidGlassSurface>
        </TouchableOpacity>

        <Text style={[styles.topBarTitle, { color: palette.textPrimary }]}>حسابي</Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleTheme();
          }}
        >
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive
            borderRadius={20}
            style={[styles.topGlassBtn, { borderColor: palette.pillBorder }]}
          >
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={20}
              color={isDark ? '#F59E0B' : '#6366F1'}
            />
          </LiquidGlassSurface>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: miniPlayerBottomGap + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.textPrimary}
          />
        }
      >
        {/* ── 1. Identity / Guest Hero Card (Apple Liquid Glass) ── */}
        {!user ? (
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive={false}
            borderRadius={28}
            style={[
              styles.heroCard,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.cardBorder,
                borderTopColor: palette.cardTopBorder,
              },
            ]}
          >
            <View style={styles.guestHeaderRow}>
              <LinearGradient
                colors={avatarPreset.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.appleAvatarOrb}
              >
                <Text style={styles.appleAvatarEmoji}>{avatarPreset.emoji}</Text>
              </LinearGradient>

              <View style={styles.identityDetails}>
                <Text style={[styles.profileName, { color: palette.textPrimary }]}>حساب ضيف</Text>
                <View style={styles.guestBadgePill}>
                  <View style={styles.guestBadgeDot} />
                  <Text style={[styles.guestBadgeTxt, { color: palette.accentBlue }]}>
                    وضع الضيف
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.guestActionsRow}>
              <TouchableOpacity
                style={styles.actionHalf}
                onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
                activeOpacity={0.85}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  tintColor="rgba(0, 122, 255, 0.45)"
                  borderRadius={20}
                  style={styles.primaryPillGlass}
                >
                  <LinearGradient
                    colors={[
                      'rgba(255, 255, 255, 0.26)',
                      'rgba(56, 189, 248, 0.24)',
                      'rgba(0, 122, 255, 0.45)',
                    ]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={styles.pillGradient}
                  >
                    <Ionicons name="log-in-outline" size={17} color="#FFFFFF" />
                    <Text style={styles.primaryPillTxt}>تسجيل الدخول</Text>
                  </LinearGradient>
                </LiquidGlassSurface>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionHalf}
                onPress={() => navigation.navigate('Auth', { screen: 'SignUp' })}
                activeOpacity={0.82}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={20}
                  style={[
                    styles.secondaryPillGlass,
                    {
                      backgroundColor: palette.inputBg,
                      borderColor: palette.pillBorder,
                    },
                  ]}
                >
                  <Ionicons name="person-add-outline" size={16} color={palette.textPrimary} />
                  <Text style={[styles.secondaryPillTxt, { color: palette.textPrimary }]}>
                    إنشاء حساب جديد
                  </Text>
                </LiquidGlassSurface>
              </TouchableOpacity>
            </View>
          </LiquidGlassSurface>
        ) : (
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive={false}
            borderRadius={28}
            style={[
              styles.heroCard,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.cardBorder,
                borderTopColor: palette.cardTopBorder,
              },
            ]}
          >
            <View style={styles.identityRow}>
              <TouchableOpacity activeOpacity={0.8} onPress={handleRandomizeAvatar}>
                {displayUser?.avatar_url ? (
                  <Image
                    source={{ uri: displayUser.avatar_url }}
                    style={styles.avatarPhoto}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <LinearGradient
                    colors={avatarPreset.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.appleAvatarOrbLarge}
                  >
                    <Text style={styles.appleAvatarEmojiLarge}>{avatarPreset.emoji}</Text>
                  </LinearGradient>
                )}
                <View style={styles.shufflePill}>
                  <Ionicons name="sparkles" size={11} color="#FFFFFF" />
                </View>
              </TouchableOpacity>

              <View style={styles.identityDetails}>
                <Text style={[styles.profileName, { color: palette.textPrimary }]} numberOfLines={1}>
                  {displayUser?.full_name || 'مستخدم A7 Music'}
                </Text>
                <Text style={[styles.profileHandle, { color: palette.textSecondary }]} numberOfLines={1}>
                  @{displayUser?.username || 'user'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                setEditFullName(displayUser?.full_name || '');
                setShowEdit(true);
              }}
              activeOpacity={0.8}
              style={{ marginTop: 16 }}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive
                borderRadius={18}
                style={[
                  styles.editProfilePill,
                  {
                    backgroundColor: palette.inputBg,
                    borderColor: palette.pillBorder,
                  },
                ]}
              >
                <Ionicons name="create-outline" size={16} color={palette.textPrimary} />
                <Text style={[styles.editProfileTxt, { color: palette.textPrimary }]}>
                  تعديل الاسم المعروض
                </Text>
              </LiquidGlassSurface>
            </TouchableOpacity>
          </LiquidGlassSurface>
        )}

        {/* ── 2. Three Clean Liquid Glass Info Cards ── */}
        <View style={styles.infoCardsGrid}>
          {/* Card 1: Listening Time */}
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive={false}
            borderRadius={22}
            style={[
              styles.infoCard,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.cardBorder,
                borderTopColor: palette.cardTopBorder,
              },
            ]}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: 'rgba(0, 122, 255, 0.14)' }]}>
              <Ionicons name="time-outline" size={20} color={palette.accentBlue} />
            </View>
            <Text style={[styles.infoLabel, { color: palette.textSecondary }]}>وقت الاستماع</Text>
            <Text style={[styles.infoValue, { color: palette.accentBlue }]} numberOfLines={1}>
              {formatMinutesAndSeconds(listeningSeconds)}
            </Text>
          </LiquidGlassSurface>

          {/* Card 2: Liked Music Count */}
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive={false}
            borderRadius={22}
            style={[
              styles.infoCard,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.cardBorder,
                borderTopColor: palette.cardTopBorder,
              },
            ]}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: 'rgba(236, 72, 153, 0.14)' }]}>
              <Ionicons name="heart" size={20} color={palette.accentPink} />
            </View>
            <Text style={[styles.infoLabel, { color: palette.textSecondary }]}>الإعجابات</Text>
            <Text style={[styles.infoValue, { color: palette.accentPink }]} numberOfLines={1}>
              {totalLikesCount} أغنية
            </Text>
          </LiquidGlassSurface>
        </View>

        {/* Card 3: Account Status */}
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive={false}
          borderRadius={22}
          style={[
            styles.wideInfoCard,
            {
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              borderTopColor: palette.cardTopBorder,
            },
          ]}
        >
          <View style={styles.wideCardRight}>
            <View style={[styles.infoIconWrap, { backgroundColor: 'rgba(52, 199, 89, 0.14)' }]}>
              <Ionicons
                name={user ? 'shield-checkmark-outline' : 'person-outline'}
                size={20}
                color={palette.accentGreen}
              />
            </View>
            <View>
              <Text style={[styles.infoLabel, { color: palette.textSecondary }]}>حالة الحساب</Text>
              <Text style={[styles.wideInfoValue, { color: palette.textPrimary }]}>
                {user ? `مسجل (@${displayUser?.username || 'user'})` : 'حساب ضيف'}
              </Text>
            </View>
          </View>
          <Ionicons
            name={user ? 'checkmark-circle' : 'chevron-back'}
            size={20}
            color={user ? palette.accentGreen : palette.textMuted}
          />
        </LiquidGlassSurface>
      </ScrollView>

      {/* ── Edit Profile Bottom Sheet (Full Name Only, Username Fixed) ── */}
      <DynamicBottomSheet
        ref={editSheetRef}
        isVisible={showEdit}
        onClose={() => setShowEdit(false)}
        title="تعديل الملف الشخصي"
        initialSnap={0.5}
      >
        <View style={[styles.editSheetContent, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: palette.textSecondary }]}>الاسم الكامل</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  color: palette.textPrimary,
                  backgroundColor: palette.inputBg,
                  borderColor: palette.inputBorder,
                },
              ]}
              value={editFullName}
              onChangeText={setEditFullName}
              placeholder="الاسم المعروض"
              placeholderTextColor={palette.textMuted}
              textAlign="right"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: palette.textSecondary }]}>
              اسم المستخدم (ثابت)
            </Text>
            <View
              style={[
                styles.fixedUsernameBox,
                {
                  backgroundColor: palette.inputBg,
                  borderColor: palette.inputBorder,
                },
              ]}
            >
              <Ionicons name="lock-closed-outline" size={16} color={palette.textMuted} />
              <Text style={[styles.fixedUsernameTxt, { color: palette.textSecondary }]}>
                @{displayUser?.username || 'user'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtnOuter, saving && { opacity: 0.65 }]}
            onPress={handleSaveProfile}
            disabled={saving}
            activeOpacity={0.86}
          >
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive
              tintColor="rgba(0, 122, 255, 0.45)"
              borderRadius={24}
              style={styles.saveBtnGlass}
            >
              <LinearGradient
                colors={[
                  'rgba(255, 255, 255, 0.26)',
                  'rgba(56, 189, 248, 0.24)',
                  'rgba(0, 122, 255, 0.45)',
                ]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.saveBtnGradient}
              >
                <Text style={styles.saveBtnTxt}>
                  {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </Text>
              </LinearGradient>
            </LiquidGlassSurface>
          </TouchableOpacity>
        </View>
      </DynamicBottomSheet>

      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator color="#007AFF" size="large" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ambientTop: {
    position: 'absolute',
    top: -60,
    left: -50,
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -80,
    right: -50,
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  topBarTitle: {
    fontSize: 19,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  topGlassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  guestHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  identityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  appleAvatarOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleAvatarEmoji: {
    fontSize: 26,
  },
  appleAvatarOrbLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleAvatarEmojiLarge: {
    fontSize: 32,
  },
  avatarPhoto: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  shufflePill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  identityDetails: {
    flex: 1,
    alignItems: 'flex-end',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profileHandle: {
    fontSize: 14,
    fontWeight: '600',
  },
  guestBadgePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  guestBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#007AFF',
  },
  guestBadgeTxt: {
    fontSize: 12,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  guestActionsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  actionHalf: {
    flex: 1,
  },
  primaryPillGlass: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.36)',
    overflow: 'hidden',
  },
  pillGradient: {
    height: 46,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryPillTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  secondaryPillGlass: {
    height: 46,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  secondaryPillTxt: {
    fontSize: 13,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  editProfilePill: {
    height: 44,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  editProfileTxt: {
    fontSize: 14,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  infoCardsGrid: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginBottom: 12,
  },
  infoCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
  infoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    writingDirection: 'rtl',
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  wideInfoCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  wideCardRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  wideInfoValue: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  editSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  textInput: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  fixedUsernameBox: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fixedUsernameTxt: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtnOuter: {
    marginTop: 8,
    borderRadius: 24,
    overflow: 'hidden',
  },
  saveBtnGlass: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.36)',
    overflow: 'hidden',
  },
  saveBtnGradient: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
});

export default ProfileScreen;
