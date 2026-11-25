import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
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
import { getEmailByUsername } from '../services/firebaseMusicDb';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ToastManager } from '../components/InAppToast';

export const SignUpScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const { isDark } = useTheme();

  const topPadding = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomPadding = Math.max(insets.bottom, 16);

  const fullNameRef = useRef<any>(null);
  const emailRef = useRef<any>(null);
  const usernameRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI & Validation States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [isUsernameTaken, setIsUsernameTaken] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

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

  // Debounced live username uniqueness check
  useEffect(() => {
    const clean = username.trim().toLowerCase().replace(/\s+/g, '');
    if (clean.length < 3) {
      setIsUsernameTaken(null);
      setSuggestions([]);
      setCheckingUsername(false);
      return;
    }

    setCheckingUsername(true);
    const delayTimer = setTimeout(async () => {
      try {
        const existingEmail = await getEmailByUsername(clean);
        if (existingEmail) {
          setIsUsernameTaken(true);
          const randomNum = Math.floor(10 + Math.random() * 89);
          setSuggestions([`${clean}${randomNum}`, `${clean}_a7`]);
        } else {
          setIsUsernameTaken(false);
          setSuggestions([]);
        }
      } catch {
        setIsUsernameTaken(false);
      } finally {
        setCheckingUsername(false);
      }
    }, 450);

    return () => clearTimeout(delayTimer);
  }, [username]);

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

  const handleSignUp = async () => {
    const cleanFull = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUname = username.trim().toLowerCase().replace(/^@/, '');

    if (!cleanFull || !cleanEmail || !cleanUname || !password) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }

    if (cleanUname.includes(' ') || cleanUname.length < 3 || cleanUname.length > 15) {
      setErrorMsg('اسم المستخدم يجب أن يكون بين 3 و 15 حرفاً وبدون مسافات.');
      return;
    }

    if (isUsernameTaken) {
      setErrorMsg('اسم المستخدم هذا محجوز بالفعل، يرجى اختيار اسم آخر.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const { error } = await register({
      full_name: cleanFull,
      email: cleanEmail,
      username: cleanUname,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message || 'تعذر إنشاء الحساب، يرجى التأكد من البيانات والمحاولة ثانية.');
    } else {
      ToastManager.show({
        title: 'تم إنشاء الحساب بنجاح ✨',
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
          start={{ x: 0.9, y: 0 }}
          end={{ x: 0.1, y: 0.6 }}
          style={styles.ambientTop}
        />
        <LinearGradient
          colors={palette.orbBottom}
          start={{ x: 0.1, y: 0.4 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.ambientBottom}
        />
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      </View>

      <View style={[styles.mainWrapper, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
        {/* ── Top Navigation Bar: Close & Skip ── */}
        <View style={styles.topGuestBar}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleContinueAsGuest}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
              { paddingBottom: Math.max(insets.bottom, 28) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {/* ── Centered Header ── */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: palette.textPrimary }]}>إنشاء حساب جديد</Text>
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
              {/* Full Name */}
              <Pressable
                onPress={() => fullNameRef.current?.focus()}
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
                  ref={fullNameRef}
                  style={[styles.input, { color: palette.textPrimary }]}
                  placeholder="الاسم الكامل"
                  placeholderTextColor={palette.placeholder}
                  value={fullName}
                  onChangeText={(txt) => {
                    setFullName(txt);
                    if (errorMsg) setErrorMsg('');
                  }}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  textAlign="right"
                />
              </Pressable>

              {/* Email Address */}
              <Pressable
                onPress={() => emailRef.current?.focus()}
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
                  name="mail-outline"
                  size={20}
                  color={palette.iconColor}
                  style={styles.inputIconRight}
                />
                <TextInput
                  ref={emailRef}
                  style={[styles.input, { color: palette.textPrimary }]}
                  placeholder="البريد الإلكتروني"
                  placeholderTextColor={palette.placeholder}
                  value={email}
                  onChangeText={(txt) => {
                    setEmail(txt);
                    if (errorMsg) setErrorMsg('');
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  textAlign="right"
                />
              </Pressable>

              {/* Username Input */}
              <Pressable
                onPress={() => usernameRef.current?.focus()}
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: palette.inputBg,
                    borderColor:
                      isUsernameTaken === false
                        ? '#34C759'
                        : isUsernameTaken === true
                        ? '#FF3B30'
                        : palette.inputBorder,
                    borderTopColor:
                      isUsernameTaken === false
                        ? '#34C759'
                        : isUsernameTaken === true
                        ? '#FF3B30'
                        : palette.inputTopBorder,
                  },
                ]}
              >
                <Text style={[styles.atSymbol, { color: palette.iconColor }]}>@</Text>
                <TextInput
                  ref={usernameRef}
                  style={[styles.input, { color: palette.textPrimary }]}
                  placeholder="اسم المستخدم (مثال: ahmed99)"
                  placeholderTextColor={palette.placeholder}
                  value={username}
                  onChangeText={(txt) => {
                    setUsername(txt.replace(/\s+/g, ''));
                    if (errorMsg) setErrorMsg('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={15}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  textAlign="right"
                />
                {checkingUsername && <ActivityIndicator size="small" color={palette.linkColor} />}
                {!checkingUsername && isUsernameTaken === false && (
                  <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                )}
                {!checkingUsername && isUsernameTaken === true && (
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                )}
              </Pressable>

              {/* Username Suggestions if Taken */}
              {isUsernameTaken === true && suggestions.length > 0 && (
                <View style={styles.suggestionsWrap}>
                  <Text style={styles.suggestionsTitle}>محجوز! جرّب أحد هذه الأسماء:</Text>
                  <View style={styles.suggestionsList}>
                    {suggestions.map((sug) => (
                      <TouchableOpacity
                        key={sug}
                        style={styles.suggestionChip}
                        onPress={() => setUsername(sug)}
                      >
                        <Text style={[styles.suggestionChipText, { color: palette.linkColor }]}>
                          @{sug}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

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
                  placeholder="كلمة المرور (6 أحرف على الأقل)"
                  placeholderTextColor={palette.placeholder}
                  value={password}
                  onChangeText={(txt) => {
                    setPassword(txt);
                    if (errorMsg) setErrorMsg('');
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleSignUp}
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

              {/* Create Account Button (Liquid Glass Glossy Pill CTA) */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSignUp}
                disabled={loading || checkingUsername || isUsernameTaken === true}
                style={[
                  styles.signUpBtnOuter,
                  (loading || isUsernameTaken === true) && { opacity: 0.7 },
                ]}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  tintColor="rgba(0, 122, 255, 0.45)"
                  borderRadius={27}
                  style={styles.signUpBtnGlass}
                >
                  <LinearGradient
                    colors={[
                      'rgba(255, 255, 255, 0.28)',
                      'rgba(56, 189, 248, 0.26)',
                      'rgba(0, 122, 255, 0.48)',
                    ]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={styles.signUpBtnGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.signUpBtnText}>إنشاء حساب جديد</Text>
                    )}
                  </LinearGradient>
                </LiquidGlassSurface>
              </TouchableOpacity>
            </LiquidGlassSurface>

            {/* ── Footer Switcher (Proper Arabic RTL) ── */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: palette.textSecondary }]}>
                لديك حساب بالفعل؟
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={[styles.footerLink, { color: palette.linkColor }]}>
                  تسجيل الدخول
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
    right: -40,
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -90,
    left: -50,
    width: 450,
    height: 450,
    borderRadius: 225,
  },
  mainWrapper: {
    flex: 1,
  },
  keyboardWrap: {
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  header: {
    alignItems: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    writingDirection: 'rtl',
    textAlign: 'center',
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
    marginBottom: 20,
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
    marginBottom: 13,
  },
  inputIconRight: {
    marginLeft: 10,
  },
  atSymbol: {
    fontSize: 17,
    fontWeight: '700',
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
  suggestionsWrap: {
    marginBottom: 14,
    marginTop: -4,
    paddingHorizontal: 4,
  },
  suggestionsTitle: {
    color: '#FF9500',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  suggestionsList: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.28)',
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  signUpBtnOuter: {
    borderRadius: 27,
    overflow: 'hidden',
    marginTop: 8,
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
  signUpBtnGlass: {
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    overflow: 'hidden',
  },
  signUpBtnGradient: {
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpBtnText: {
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

export default SignUpScreen;
