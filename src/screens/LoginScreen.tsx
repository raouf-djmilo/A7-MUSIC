import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../providers/AuthProvider';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ToastManager } from '../components/InAppToast';

export const LoginScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const topPadding = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomPadding = Math.max(insets.bottom, 16);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'identifier' | 'password' | null>(null);

  const isAr = true;

  const t = isAr
    ? {
        guest: 'المتابعة كضيف',
        tagline: 'استمع واكتشف الموسيقى بحرية',
        identifierPlaceholder: 'اسم المستخدم أو البريد الإلكتروني',
        passwordPlaceholder: 'كلمة المرور',
        forgot: 'نسيت كلمة المرور؟',
        forgotTitle: 'استعادة كلمة المرور',
        forgotBody: 'يرجى مراجعة بريدك الإلكتروني المسجل لتعيين كلمة مرور جديدة.',
        signIn: 'تسجيل الدخول',
        missingAlertTitle: 'تنبيه',
        missingAlertBody: 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.',
        errorTitle: 'تعذر تسجيل الدخول',
        errorBody: 'بيانات الدخول غير صحيحة، يرجى المحاولة مرة أخرى.',
        noAccount: 'ليس لديك حساب؟ ',
        createAccount: 'إنشاء حساب جديد',
      }
    : {
        guest: 'Continue as Guest',
        tagline: 'Listen & discover music freely',
        identifierPlaceholder: 'Username or Email',
        passwordPlaceholder: 'Password',
        forgot: 'Forgot Password?',
        forgotTitle: 'Reset Password',
        forgotBody: 'Check your registered email inbox to reset your password.',
        signIn: 'Sign In',
        missingAlertTitle: 'Notice',
        missingAlertBody: 'Please enter your username or email and password.',
        errorTitle: 'Sign In Failed',
        errorBody: 'Invalid credentials, please try again.',
        noAccount: "Don't have an account? ",
        createAccount: 'Create Account',
      };

  const navigateToHome = () => {
    const rootNav = navigation.getParent?.() || navigation;
    rootNav.navigate('MainTabs', {
      screen: 'Tabs',
      params: { screen: 'DashboardTab' },
    });
  };

  const handleContinueAsGuest = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigateToHome();
    }
  };

  const onLogin = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert(t.missingAlertTitle, t.missingAlertBody);
      return;
    }

    setLoading(true);
    const { error } = await login({
      identifier: identifier.trim().toLowerCase(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert(t.errorTitle, error.message || t.errorBody);
    } else {
      ToastManager.show({
        title: 'تم تسجيل الدخول بنجاح ✨',
        subtitle: 'مرحباً بك في A7 MUSIC',
        icon: 'checkmark-circle',
      });
      navigateToHome();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* ── Ambient Liquid Gradient Background ── */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.darkBase} />
        <LinearGradient
          colors={['rgba(0, 122, 255, 0.18)', 'rgba(56, 189, 248, 0.05)', 'transparent']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.8, y: 0.7 }}
          style={styles.ambientTop}
        />
        <LinearGradient
          colors={['transparent', 'rgba(139, 92, 246, 0.08)', 'rgba(0, 80, 200, 0.12)']}
          start={{ x: 0.2, y: 0.3 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.ambientBottom}
        />
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
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
              isDark
              isInteractive
              borderRadius={19}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </LiquidGlassSurface>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleContinueAsGuest}
            activeOpacity={0.75}
          >
            <LiquidGlassSurface
              glassStyle="regular"
              isDark
              isInteractive
              borderRadius={20}
              style={styles.skipGuestPill}
            >
              <Text style={styles.skipGuestPillText}>{t.guest}</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.85)" />
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
              { paddingTop: 10, paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Brand Header (A7 Liquid Glass) ── */}
            <View style={styles.header}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark
                isInteractive={false}
                borderRadius={28}
                style={styles.logoBadgeContainer}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.04)', 'transparent']}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 0.85 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.logoImage}
                  contentFit="cover"
                  priority="high"
                />
              </LiquidGlassSurface>

              <Text style={styles.brandTitle}>A7 MUSIC</Text>
              <Text style={styles.tagline}>{t.tagline}</Text>
            </View>

            {/* ── Liquid Glass Form Card ── */}
            <LiquidGlassSurface
              glassStyle="regular"
              isDark
              isInteractive={false}
              borderRadius={28}
              style={styles.glassCard}
            >
              {/* Identifier Input */}
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'identifier' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={focusedField === 'identifier' ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t.identifierPlaceholder}
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField('identifier')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Password Input */}
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'password' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={focusedField === 'password' ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t.passwordPlaceholder}
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="rgba(255, 255, 255, 0.45)"
                  />
                </TouchableOpacity>
              </View>

              {/* Forgot Password */}
              <TouchableOpacity
                style={styles.forgotBtn}
                activeOpacity={0.7}
                onPress={() => Alert.alert(t.forgotTitle, t.forgotBody)}
              >
                <Text style={styles.forgotText}>{t.forgot}</Text>
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
                  isDark
                  isInteractive
                  tintColor="rgba(0, 122, 255, 0.38)"
                  borderRadius={27}
                  style={styles.loginBtnGlass}
                >
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.26)', 'rgba(56, 189, 248, 0.18)', 'rgba(0, 122, 255, 0.34)']}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={styles.loginBtnGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.loginBtnText}>{t.signIn}</Text>
                    )}
                  </LinearGradient>
                </LiquidGlassSurface>
              </TouchableOpacity>
            </LiquidGlassSurface>

            {/* ── Footer Switcher ── */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>{t.noAccount}</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('SignUp')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>{t.createAccount}</Text>
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
    backgroundColor: '#05070D',
  },
  darkBase: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#05070D',
  },
  ambientTop: {
    position: 'absolute',
    top: -80,
    left: -40,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -100,
    right: -60,
    width: 420,
    height: 420,
    borderRadius: 210,
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
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    borderColor: 'rgba(255, 255, 255, 0.22)',
    gap: 4,
    overflow: 'hidden',
  },
  skipGuestPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoBadgeContainer: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 22,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  logoImage: {
    width: 82,
    height: 82,
    borderRadius: 22,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.55)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  glassCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    padding: 20,
    marginBottom: 24,
    overflow: 'hidden',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    height: 54,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  inputWrapFocused: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginBottom: 20,
    paddingVertical: 4,
  },
  forgotText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  loginBtnOuter: {
    borderRadius: 27,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.42,
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
    borderColor: 'rgba(255, 255, 255, 0.34)',
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: '400',
  },
  footerLink: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default LoginScreen;
