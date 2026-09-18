/**
 * MapSettingsModal.tsx
 * ─────────────────────────────────────────────────────────────────
 * نافذة إعدادات الخريطة بنمط Strava الداكن الاحترافي:
 *  - مدعومة بـ Modal أصيل مع خلفية معتمة (Backdrop) تحجب أزرار الشاشة بالكامل
 *  - zIndex: 9999 لمنع أي تداخل بصري
 *  - ستايل داكن فخم (#1C2026) متناسق مع معمارية Strava
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Switch,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

export type MapType = 'standard' | 'satellite' | 'hybrid' | 'winter';
export type HeatmapType = 'global_run' | null;

export interface MapSettings {
  mapType: MapType;
  activeHeatmap: HeatmapType;
  showWaymarks: boolean;
  showTerrain: boolean;
}

interface Props {
  visible: boolean;
  settings: MapSettings;
  onClose: () => void;
  onChange: (s: MapSettings) => void;
}

const STRAVA_ORANGE = '#FC5200';

const MAP_TYPES: {
  key: MapType;
  label: string;
  icon: string;
  iconLib: 'ion' | 'mci';
  bg: string;
}[] = [
  {
    key: 'standard',
    label: 'Standard',
    icon: 'map-outline',
    iconLib: 'ion',
    bg: '#181E24',
  },
  {
    key: 'satellite',
    label: 'Satellite',
    icon: 'planet-outline',
    iconLib: 'ion',
    bg: '#0E1724',
  },
  {
    key: 'hybrid',
    label: 'Hybrid',
    icon: 'layers-outline',
    iconLib: 'ion',
    bg: '#16222F',
  },
  {
    key: 'winter',
    label: 'Winter',
    icon: 'snow-outline',
    iconLib: 'ion',
    bg: '#1A242B',
  },
];

const OptionCard: React.FC<{
  label: string;
  icon: string;
  iconLib?: 'ion' | 'mci';
  bg: string;
  selected: boolean;
  onPress: () => void;
}> = ({ label, icon, iconLib = 'ion', bg, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.card, selected && styles.cardSelected]}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }}
    activeOpacity={0.8}
  >
    <View style={[styles.thumb, { backgroundColor: bg }]}>
      {iconLib === 'ion' ? (
        <Ionicons
          name={icon as any}
          size={24}
          color={selected ? STRAVA_ORANGE : '#A0A6B2'}
        />
      ) : (
        <MaterialCommunityIcons
          name={icon as any}
          size={24}
          color={selected ? STRAVA_ORANGE : '#A0A6B2'}
        />
      )}
    </View>
    <Text
      style={[styles.cardLabel, selected && styles.cardLabelSelected]}
      numberOfLines={1}
    >
      {label}
    </Text>
    {selected && (
      <View style={styles.checkBadge}>
        <Ionicons name="checkmark" size={11} color="#fff" />
      </View>
    )}
  </TouchableOpacity>
);

export const MapSettingsModal: React.FC<Props> = ({
  visible,
  settings,
  onClose,
  onChange,
}) => {
  const insets = useSafeAreaInsets();

  const set = useCallback(
    (patch: Partial<MapSettings>) => onChange({ ...settings, ...patch }),
    [settings, onChange]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* ── 1. Full-Screen Dim Backdrop (Blocks All Underlying Clicks & Buttons) ── */}
      <View style={styles.modalRoot} pointerEvents="auto">
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        </TouchableOpacity>

        {/* ── 2. Bottom Sheet Content (Strava Dark Theme) ── */}
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          {/* Sheet Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Map Settings</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* ── Section 1: Map Type ── */}
          <Text style={styles.sectionTitle}>MAP TYPE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {MAP_TYPES.map((opt) => (
              <OptionCard
                key={opt.key}
                label={opt.label}
                icon={opt.icon}
                iconLib={opt.iconLib}
                bg={opt.bg}
                selected={settings.mapType === opt.key}
                onPress={() => set({ mapType: opt.key })}
              />
            ))}
          </ScrollView>

          <View style={styles.divider} />

          {/* ── Section 2: Global Heatmap ── */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>HEATMAPS</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proText}>STRAVA</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            <OptionCard
              label="Run Heatmap"
              icon="flame-outline"
              bg="#2E1B15"
              selected={settings.activeHeatmap === 'global_run'}
              onPress={() =>
                set({
                  activeHeatmap:
                    settings.activeHeatmap === 'global_run' ? null : 'global_run',
                })
              }
            />
          </ScrollView>

          <View style={styles.divider} />

          {/* ── Section 3: 3D Terrain Switch ── */}
          <View style={styles.terrainRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.terrainTitle}>3D Terrain & Contours</Text>
              <Text style={styles.terrainDesc}>عرض الارتفاعات والتضاريس ثلاثية الأبعاد</Text>
            </View>
            <Switch
              value={settings.showTerrain}
              onValueChange={(val) => {
                Haptics.selectionAsync();
                set({ showTerrain: val });
              }}
              trackColor={{ false: '#2C323B', true: STRAVA_ORANGE }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default MapSettingsModal;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    zIndex: 99999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheetContainer: {
    backgroundColor: '#18191E',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 100000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#252930',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E929B',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },
  proBadge: {
    marginLeft: 8,
    marginBottom: 10,
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.8,
  },
  hScroll: {
    gap: 12,
    flexDirection: 'row',
    paddingBottom: 4,
  },
  card: {
    width: 84,
    alignItems: 'center',
    borderRadius: 14,
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  cardSelected: {
    borderColor: STRAVA_ORANGE,
    backgroundColor: 'rgba(252, 82, 0, 0.08)',
  },
  thumb: {
    width: 72,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E929B',
    textAlign: 'center',
  },
  cardLabelSelected: {
    color: '#FFFFFF',
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: STRAVA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#18191E',
  },
  terrainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  terrainTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  terrainDesc: {
    color: '#8E929B',
    fontSize: 12,
  },
});
