import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../providers/AuthProvider';
import { getEmailByUsername } from '../services/firebaseMusicDb';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ToastManager } from '../components/InAppToast';

export const SignUpScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const topPadding = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomPadding = Math.max(insets.bottom, 16);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Live Username Availability Check
  const [isUsernameTaken, setIsUsernameTaken] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const checkUsername = async () => {
      const uname = username.trim().toLowerCase();
      if (!uname) {
        setIsUsernameTaken(null);
        setUsernameSuggestions([]);
        return;
      }

      if (uname.includes(' ') || uname.length > 15) {
        setIsUsernameTaken(true);
        setUsernameSuggestions([]);
        return;
      }

      setCheckingUsername(true);
      try {
        const existingEmail = await getEmailByUsername(uname);
        const isTaken = Boolean(existingEmail);
        setIsUsernameTaken(isTaken);
        if (isTaken) {
          setUsernameSuggestions([`${uname}_music`, `${uname}1`, `${uname}_a7`]);
        } else {
          setUsernameSuggestions([]);
        }
      } catch (e) {
        setIsUsernameTaken(null);
      } finally {
        setCheckingUsername(false);
      }
    };

    const delayTimer = setTimeout(() => {
      checkUsername();
    }, 450);

    return () => clearTimeout(delayTimer);
  }, [username]);

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

  const handleSignUp = async () => {
    const cleanFull = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUname = username.trim().toLowerCase();

    if (!cleanFull || !cleanEmail || !cleanUname || !password) {
      setErrorMsg('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }

    if (cleanUname.includes(' ') || cleanUname.length > 15) {
      setErrorMsg('اسم المستخدم يجب ألا يتجاوز 15 حرفاً وبدون مسافات.');
      return;
    }

    if (isUsernameTaken) {
      setErrorMsg('اسم المستخدم هذا محجوز بالفعل. جرب اسماً آخر.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    // Format phone number
    const formattedPhone = phoneNumber.trim()
      ? `+213${phoneNumber.trim().startsWith('0') ? phoneNumber.trim().slice(1) : phoneNumber.trim()}`
      : undefined;

    const { error } = await register({
      full_name: cleanFull,
      email: cleanEmail,
      username: cleanUname,
      password,
      phone_number: formattedPhone,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message || 'تعذر إنشاء الحساب، يرجى التأكد من البيانات والمحاولة ثانية.');
    } else {
      ToastManager.show({
        title: 'تم إنشاء الحساب بنجاح ✨',
        subtitle: 'مرحباً بك في A7 MUSIC',
        icon: 'checkmark-circle',
      });
      navigateToHome();
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Ambient Liquid Gradient Background ── */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.darkBase} />
        <LinearGradient
          colors={['rgba(0, 122, 255, 0.16)', 'rgba(56, 189, 248, 0.05)', 'transparent']}
          start={{ x: 0.9, y: 0 }}
          end={{ x: 0.1, y: 0.6 }}
          style={styles.ambientTop}
        />
        <LinearGradient
          colors={['transparent', 'rgba(139, 92, 246, 0.08)', 'rgba(0, 80, 200, 0.12)']}
          start={{ x: 0.1, y: 0.4 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.ambientBottom}
        />
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
      </View>

      <StatusBar style="light" />
      <View style={[styles.mainWrapper, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── Top Navigation Bar: Close & Skip ── */}
          <View style={styles.topGuestBar}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={handleContinueAsGuest}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                <Text style={styles.skipGuestPillText}>المتابعة كضيف</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.85)" />
              </LiquidGlassSurface>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 28) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Header ── */}
            <View style={styles.header}>
              <Text style={styles.title}>إنشاء حساب جديد</Text>
              <Text style={styles.subtitle}>استمع واكتشف الموسيقى بحرية</Text>
            </View>

            {/* Error Message Banner */}
            {!!errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#FF3B30" style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* ── Liquid Glass Form Card ── */}
            <LiquidGlassSurface
              glassStyle="regular"
              isDark
              isInteractive={false}
              borderRadius={28}
              style={styles.glassCard}
            >
              {/* Full Name */}
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'fullName' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={focusedField === 'fullName' ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="الاسم الكامل"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={fullName}
                  onChangeText={(t) => {
                    setFullName(t);
                    if (errorMsg) setErrorMsg('');
                  }}
                  autoCapitalize="words"
                  onFocus={() => setFocusedField('fullName')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Email Address */}
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'email' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={focusedField === 'email' ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="البريد الإلكتروني"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (errorMsg) setErrorMsg('');
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Username */}
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'username' && styles.inputWrapFocused,
                  username.length > 0 && isUsernameTaken === true && styles.inputWrapError,
                  username.length > 0 && isUsernameTaken === false && styles.inputWrapSuccess,
                ]}
              >
                <Ionicons
                  name="at-outline"
                  size={20}
                  color={focusedField === 'username' ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="اسم المستخدم"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={username}
                  onChangeText={(t) => {
                    setUsername(t.replace(/\s/g, '').toLowerCase().slice(0, 15));
                    if (errorMsg) setErrorMsg('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                />

                {/* Live validation indicator */}
                {checkingUsername && (
                  <ActivityIndicator size="small" color="#38BDF8" style={styles.trailingIcon} />
                )}
                {!checkingUsername && username.length > 0 && isUsernameTaken === false && (
                  <Ionicons name="checkmark-circle" size={20} color="#34C759" style={styles.trailingIcon} />
                )}
                {!checkingUsername && username.length > 0 && isUsernameTaken === true && (
                  <Ionicons name="close-circle" size={20} color="#FF3B30" style={styles.trailingIcon} />
                )}
              </View>

              {/* Username Suggestions if taken */}
              {!checkingUsername && isUsernameTaken === true && usernameSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  <Text style={styles.suggestionsTitle}>اقتراحات:</Text>
                  <View style={styles.chipsRow}>
                    {usernameSuggestions.map((sug) => (
                      <TouchableOpacity
                        key={sug}
                        style={styles.suggestionChip}
                        onPress={() => setUsername(sug)}
                      >
                        <Text style={styles.suggestionChipText}>@{sug}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Password */}
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
                  placeholder="كلمة المرور (6 أحرف على الأقل)"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (errorMsg) setErrorMsg('');
                  }}
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
                  isDark
                  isInteractive
                  tintColor="rgba(0, 122, 255, 0.38)"
                  borderRadius={27}
                  style={styles.signUpBtnGlass}
                >
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.26)', 'rgba(56, 189, 248, 0.18)', 'rgba(0, 122, 255, 0.34)']}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={styles.signUpBtnGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.signUpBtnText}>إنشاء حساب مجاني</Text>
                    )}
                  </LinearGradient>
                </LiquidGlassSurface>
              </TouchableOpacity>
            </LiquidGlassSurface>

            {/* ── Footer Switcher ── */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>لديك حساب بالفعل؟ </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>تسجيل الدخول</Text>
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
    top: -60,
    right: -40,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -100,
    left: -50,
    width: 420,
    height: 420,
    borderRadius: 210,
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  header: {
    marginBottom: 26,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.55)',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  glassCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    padding: 20,
    marginBottom: 20,
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
    marginBottom: 13,
  },
  inputWrapFocused: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  inputWrapError: {
    borderColor: '#FF3B30',
  },
  inputWrapSuccess: {
    borderColor: '#34C759',
  },
  inputIcon: {
    marginRight: 12,
  },
  trailingIcon: {
    marginLeft: 8,
  },
  phonePrefix: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 10,
  },
  phoneDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginRight: 10,
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
  suggestionsContainer: {
    marginBottom: 14,
    marginTop: -4,
    paddingHorizontal: 4,
  },
  suggestionsTitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 6,
    fontWeight: '500',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  suggestionChipText: {
    color: '#38BDF8',
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
        shadowOpacity: 0.42,
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
    borderColor: 'rgba(255, 255, 255, 0.34)',
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
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

export default SignUpScreen;
