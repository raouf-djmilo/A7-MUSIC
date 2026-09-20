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
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../providers/AuthProvider';

export const LoginScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'identifier' | 'password' | null>(null);

  const onLogin = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert('Required', 'Please enter your username or email and password.');
      return;
    }

    setLoading(true);
    const { error } = await login({
      identifier: identifier.trim().toLowerCase(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Degradation / Ambient Liquid Gradient Background ── */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.darkBase} />
        {/* Deep ambient light degradation orbs */}
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
        {/* Subtle Frosted Matte Overlay */}
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Brand Header (Spotify / Apple Music Style) ── */}
            <View style={styles.header}>
              <View style={styles.logoBadgeContainer}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.logoImage}
                  contentFit="contain"
                  priority="high"
                />
              </View>

              <Text style={styles.brandTitle}>A7 MUSIC</Text>
              <Text style={styles.tagline}>Never Lost. Discover New Music.</Text>
            </View>

            {/* ── Liquid Glass Form Card ── */}
            <View style={styles.glassCard}>
              {/* Identifier Input (Username or Email) */}
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'identifier' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={focusedField === 'identifier' ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email or Username"
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
                  placeholder="Password"
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
                onPress={() => Alert.alert('Reset Password', 'Please contact support or check your registered email to reset your password.')}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Log In Button (Spotify Style Pill CTA) */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={onLogin}
                disabled={loading}
                style={styles.loginBtnOuter}
              >
                <LinearGradient
                  colors={['#007AFF', '#0052CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.loginBtnGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.loginBtnText}>LOG IN</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* ── Footer Switcher ── */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('SignUp')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070D',
  },
  darkBase: {
    ...StyleSheet.absoluteFillObject,
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
  safeArea: {
    flex: 1,
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
    width: 104,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  logoImage: {
    width: '100%',
    height: '100%',
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
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    marginBottom: 24,
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
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
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
