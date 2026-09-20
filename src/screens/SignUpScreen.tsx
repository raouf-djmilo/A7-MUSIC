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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../providers/AuthProvider';
import { supabase } from '../lib/supabase';

export const SignUpScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

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
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', uname)
          .maybeSingle();

        const isTaken = !!data;
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

  const handleSignUp = async () => {
    const cleanFull = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUname = username.trim().toLowerCase();

    if (!cleanFull || !cleanEmail || !cleanUname || !password) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    if (cleanUname.includes(' ') || cleanUname.length > 15) {
      setErrorMsg('Username must be 15 characters max and have no spaces.');
      return;
    }

    if (isUsernameTaken) {
      setErrorMsg('This username is already taken. Try another.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
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
      setErrorMsg(error.message || 'Registration failed. Please check your data.');
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Degradation / Ambient Liquid Gradient Background ── */}
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

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── Top Navigation Bar ── */}
          <View style={styles.topBar}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
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
            {/* ── Header (Spotify Style Image 3 Reference) ── */}
            <View style={styles.header}>
              <Text style={styles.title}>SIGN UP</Text>
              <Text style={styles.subtitle}>Never Lost. Discover New Music.</Text>
            </View>

            {/* Error Message Banner */}
            {!!errorMsg && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#FF3B30" style={{ marginRight: 8 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* ── Liquid Glass Form Card ── */}
            <View style={styles.glassCard}>
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
                  placeholder="Full Name"
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
                  placeholder="Email address"
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
                  placeholder="Username"
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
                  <Text style={styles.suggestionsTitle}>Suggestions:</Text>
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
                  placeholder="Password (min. 6 characters)"
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

              {/* Optional Phone Number */}
              <View
                style={[
                  styles.inputWrap,
                  focusedField === 'phone' && styles.inputWrapFocused,
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={focusedField === 'phone' ? '#38BDF8' : 'rgba(255, 255, 255, 0.4)'}
                  style={styles.inputIcon}
                />
                <Text style={styles.phonePrefix}>+213</Text>
                <View style={styles.phoneDivider} />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number (optional)"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Create Account Button (Pill CTA) */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSignUp}
                disabled={loading || checkingUsername || isUsernameTaken === true}
                style={[
                  styles.signUpBtnOuter,
                  (loading || isUsernameTaken === true) && { opacity: 0.7 },
                ]}
              >
                <LinearGradient
                  colors={['#007AFF', '#0052CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.signUpBtnGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.signUpBtnText}>CREATE ACCOUNT</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* ── Footer Switcher ── */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>Log In</Text>
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
  safeArea: {
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
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
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    marginBottom: 20,
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
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
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
