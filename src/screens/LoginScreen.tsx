import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { CommonActions } from '@react-navigation/native';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme/ThemeContext';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ToastManager } from '../components/InAppToast';

export const LoginScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { isDark } = useTheme();

  const topPadding = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomPadding = Math.max(insets.bottom, 16);

  const identifierRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const palette = isDark
    ? {
      baseBg: '#070A12',
      orbTop: ['rgba(0, 122, 255, 0.22)', 'rgba(56, 189, 248, 0.06)', 'transparent'] as const,
      orbBottom: ['transparent', 'rgba(139, 92, 246, 0.12)', 'rgba(0, 80, 200, 0.16)'] as const,
      textPrimary: '#FFFFFF',
      textSecondary: 'rgba(255, 255, 255, 0.6)',
      placeholder: 'rgba(255, 255, 255, 0.42)',
      iconColor: 'rgba(255, 255, 255, 0.52)',
      cardBg: 'rgba(18, 22, 30, 0.5)',
      cardBorder: 'rgba(255, 255, 255, 0.14)',
      cardTopBorder: 'rgba(255, 255, 255, 0.34)',
      inputBg: 'rgba(255, 255, 255, 0.06)',
      inputBorder: 'rgba(255, 255, 255, 0.12)',
      inputTopBorder: 'rgba(255, 255, 255, 0.22)',
      topPillBorder: 'rgba(255, 255, 255, 0.22)',
      linkColor: '#38BDF8',
      errorBg: 'rgba(255, 59, 48, 0.14)',
      errorBorder: 'rgba(255, 59, 48, 0.32)',
      errorText: '#FF6961',
    }
    : {
      baseBg: '#F2F5FA',
      orbTop: ['rgba(0, 122, 255, 0.18)', 'rgba(56, 189, 248, 0.08)', 'transparent'] as const,
      orbBottom: ['transparent', 'rgba(99, 102, 241, 0.1)', 'rgba(0, 122, 255, 0.14)'] as const,
      textPrimary: '#0F172A',
      textSecondary: 'rgba(15, 23, 42, 0.62)',
      placeholder: 'rgba(15, 23, 42, 0.44)',
      iconColor: 'rgba(15, 23, 42, 0.52)',
      cardBg: 'rgba(255, 255, 255, 0.68)',
      cardBorder: 'rgba(15, 23, 42, 0.08)',
      cardTopBorder: 'rgba(255, 255, 255, 0.95)',
      inputBg: 'rgba(15, 23, 42, 0.045)',
      inputBorder: 'rgba(15, 23, 42, 0.09)',
      inputTopBorder: 'rgba(255, 255, 255, 0.85)',
      topPillBorder: 'rgba(15, 23, 42, 0.12)',
      linkColor: '#007AFF',
      errorBg: 'rgba(255, 59, 48, 0.1)',
      errorBorder: 'rgba(255, 59, 48, 0.25)',
      errorText: '#D70015',
    };

  const navigateToHome = () => {
    const rootNav = navigation.getParent?.() || navigation;
    rootNav.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            params: {
              screen: 'Tabs',
              params: { screen: 'DashboardTab' },
            },
          },
        ],
      })
    );
  };

  const handleContinueAsGuest = () => {
    const rootNav = navigation.getParent?.() || navigation;
    if (rootNav.canGoBack()) {
      rootNav.goBack();
    } else {
      navigateToHome();
    }
  };

  const onLogin = async () => {
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId || !password) {
      setErrorMsg('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    const { error } = await login({
      identifier: cleanId,
      password,
    });
    setLoading(false);

    if (error) {
      setErrorMsg(error.message || 'تعذر تسجيل الدخول، يرجى التحقق من البيانات والمحاولة ثانية.');
    } else {
      ToastManager.show({
        title: 'تم تسجيل الدخول بنجاح ✨',
        subtitle: 'مرحباً بك في A7 Music',
        icon: 'checkmark-circle',
      });
      navigateToHome();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.baseBg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

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

      <View style={[styles.mainWrapper, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
        {/* ── Top Bar: Close / Skip as Guest ── */}
        <View style={styles.topGuestBar}>
          <TouchableOpacity
            onPress={handleContinueAsGuest}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.75}
          >
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive
              borderRadius={19}
              style={[styles.closeBtn, { borderColor: palette.topPillBorder }]}
            >
              <Ionicons name="close" size={21} color={palette.textPrimary} />
            </LiquidGlassSurface>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleContinueAsGuest} activeOpacity={0.75}>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive
              borderRadius={20}
              style={[styles.skipGuestPill, { borderColor: palette.topPillBorder }]}
            >
              <Ionicons name="chevron-back" size={16} color={palette.textSecondary} />
              <Text style={[styles.skipGuestPillText, { color: palette.textPrimary }]}>
                المتابعة كضيف
              </Text>
            </LiquidGlassSurface>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {/* ── Clean Centered Title ── */}
            <View style={styles.header}>
              <Text style={[styles.brandTitle, { color: palette.textPrimary }]}>A7 Music</Text>
            </View>

            {/* ── Error Banner ── */}
            {!!errorMsg && (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: palette.errorBg, borderColor: palette.errorBorder },
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={palette.errorText} />
                <Text style={[styles.errorText, { color: palette.errorText }]}>{errorMsg}</Text>
              </View>
            )}

            {/* ── Centered Liquid Glass Form Card ── */}
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={28}
              style={[
                styles.glassCard,
                {
                  backgroundColor: palette.cardBg,
                  borderColor: palette.cardBorder,
                  borderTopColor: palette.cardTopBorder,
                },
              ]}
            >
              {/* Identifier Input */}
              <Pressable
                onPress={() => identifierRef.current?.focus()}
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: palette.inputBg,
                    borderColor: palette.inputBorder,
                    borderTopColor: palette.inputTopBorder,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={palette.iconColor}
                  style={styles.inputIconRight}
                />
                <TextInput
                  ref={identifierRef}
                  style={[styles.input, { color: palette.textPrimary }]}
                  placeholder="اسم المستخدم أو البريد الإلكتروني"
                  placeholderTextColor={palette.placeholder}
                  value={identifier}
                  onChangeText={(txt) => {
                    setIdentifier(txt);
                    if (errorMsg) setErrorMsg('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  textAlign="right"
                />
              </Pressable>

              {/* Password Input */}
              <Pressable
                onPress={() => passwordRef.current?.focus()}
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: palette.inputBg,
                    borderColor: palette.inputBorder,
                    borderTopColor: palette.inputTopBorder,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={palette.iconColor}
                  style={styles.inputIconRight}
                />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { color: palette.textPrimary }]}
                  placeholder="كلمة المرور"
                  placeholderTextColor={palette.placeholder}
                  value={password}
                  onChangeText={(txt) => {
                    setPassword(txt);
                    if (errorMsg) setErrorMsg('');
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={onLogin}
                  textAlign="right"
                />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={palette.iconColor}
                  />
                </TouchableOpacity>
              </Pressable>

              {/* Forgot Password */}
              <TouchableOpacity
                style={styles.forgotBtn}
                activeOpacity={0.7}
                onPress={() =>
                  Alert.alert(
                    'استعادة كلمة المرور',
                    'يرجى مراجعة بريدك الإلكتروني المسجل لتعيين كلمة مرور جديدة.'
                  )
                }
              >
                <Text style={[styles.forgotText, { color: palette.textSecondary }]}>
                  نسيت كلمة المرور؟
                </Text>
              </TouchableOpacity>

              {/* Liquid Glass Glossy Sign In Button */}
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={onLogin}
                disabled={loading}
                style={styles.loginBtnOuter}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  tintColor="rgba(0, 122, 255, 0.45)"
                  borderRadius={27}
                  style={styles.loginBtnGlass}
                >
                  <LinearGradient
                    colors={[
                      'rgba(255, 255, 255, 0.28)',
                      'rgba(56, 189, 248, 0.26)',
                      'rgba(0, 122, 255, 0.48)',
                    ]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={styles.loginBtnGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
                    )}
                  </LinearGradient>
                </LiquidGlassSurface>
              </TouchableOpacity>
            </LiquidGlassSurface>

            {/* ── Footer Switcher (Proper Arabic RTL) ── */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: palette.textSecondary }]}>
                ليس لديك حساب؟
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('SignUp')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={[styles.footerLink, { color: palette.linkColor }]}>
                  إنشاء حساب جديد
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
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
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -90,
    right: -60,
    width: 450,
    height: 450,
    borderRadius: 225,
  },
  mainWrapper: {
    flex: 1,
  },
  topGuestBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
    zIndex: 10,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  skipGuestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
    overflow: 'hidden',
  },
  skipGuestPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  glassCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    marginBottom: 22,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.25,
        shadowRadius: 28,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  inputWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 54,
    paddingHorizontal: 15,
    marginBottom: 14,
  },
  inputIconRight: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 6,
    marginRight: 4,
  },
  forgotBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 18,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  loginBtnOuter: {
    borderRadius: 27,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  loginBtnGlass: {
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    overflow: 'hidden',
  },
  loginBtnGradient: {
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
    writingDirection: 'rtl',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
});

export default LoginScreen;
