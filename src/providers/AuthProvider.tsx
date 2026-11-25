import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  getFirebaseUserProfile,
  upsertFirebaseUserProfile,
  getEmailByUsername,
  claimFirebaseUsername,
} from '../services/firebaseMusicDb';
import { useAudioStore } from '../store/useAudioStore';
import { useNetworkStore } from '../services/networkService';

export type User = {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  phone_number?: string;
  notifications_enabled?: boolean;
  notify_likes?: boolean | number;
  notify_comments?: boolean | number;
  notify_follows?: boolean | number;
  push_token?: string;
  [key: string]: any;
};

type AuthContextType = {
  session: string | null;
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  login: (data: any) => Promise<{ data: any; error: any }>;
  register: (data: any) => Promise<{ data: any; error: any }>;
  logout: () => Promise<void>;
  updateUser: (newData: Partial<User>) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const updateUser = async (newData: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...newData };
    setUser(updatedUser);
    await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
    try {
      await upsertFirebaseUserProfile(user.id, newData);
    } catch (e) {
      console.warn('Failed to update profile in Firestore:', e);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Instant 0ms local cache restore
    AsyncStorage.multiGet(['userToken', 'userData'])
      .then((pairs) => {
        if (!isMounted) return;
        const storedToken = pairs[0]?.[1];
        const storedUser = pairs[1]?.[1];
        if (storedToken && storedUser) {
          setSession(storedToken);
          setUser(JSON.parse(storedUser));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // 2. Firebase Auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMounted) return;
      if (!fbUser) {
        setSession(null);
        setUser(null);
        await AsyncStorage.multiRemove(['userToken', 'userData']).catch(() => {});
        return;
      }

      try {
        const token = await fbUser.getIdToken();
        setSession(token);
        await AsyncStorage.setItem('userToken', token);

        const profile = await getFirebaseUserProfile(fbUser.uid).catch(() => null);
        if (!isMounted) return;

        const currentUser: User = {
          id: fbUser.uid,
          email: fbUser.email || profile?.email || '',
          username: profile?.username || fbUser.email?.split('@')[0] || 'user',
          full_name: profile?.full_name || fbUser.displayName || 'A7 Listener',
          avatar_url: profile?.avatar_url || fbUser.photoURL || undefined,
          bio: profile?.bio,
          phone_number: profile?.phone_number,
        };
        setUser(currentUser);
        await AsyncStorage.setItem('userData', JSON.stringify(currentUser));
        useNetworkStore.getState().recordSuccessfulLogin();
      } catch {
        // Offline fallback preserves cached session
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const mapAuthError = (err: any, fallback: string): Error => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
      case 'auth/invalid-email':
        return new Error('صيغة البريد الإلكتروني غير صحيحة.');
      case 'auth/email-already-in-use':
        return new Error('هذا البريد الإلكتروني مسجل بالفعل.');
      case 'auth/weak-password':
        return new Error('كلمة المرور ضعيفة جداً، استخدم 6 أحرف على الأقل.');
      case 'auth/too-many-requests':
        return new Error('محاولات كثيرة متتالية، يرجى الانتظار قليلاً ثم المحاولة.');
      case 'auth/network-request-failed':
        return new Error('تعذر الاتصال بالشبكة، يرجى التحقق من الإنترنت.');
      default:
        return new Error(err?.message || fallback);
    }
  };

  const login = async (loginData: { identifier: string; password: string }) => {
    try {
      let email = loginData.identifier.trim().toLowerCase().replace(/^@/, '');
      if (!email.includes('@')) {
        const resolvedEmail = await getEmailByUsername(email);
        if (!resolvedEmail) {
          return {
            data: null,
            error: new Error('اسم المستخدم غير مسجل لدينا.'),
          };
        }
        email = resolvedEmail;
      }

      const cred = await signInWithEmailAndPassword(auth, email, loginData.password);
      const fbUser = cred.user;
      const token = await fbUser.getIdToken();
      const userProfile = await getFirebaseUserProfile(fbUser.uid).catch(() => null);

      const loggedInUser: User = {
        id: fbUser.uid,
        email: fbUser.email || email,
        username: userProfile?.username || email.split('@')[0],
        full_name: userProfile?.full_name || fbUser.displayName || 'A7 Listener',
        avatar_url: userProfile?.avatar_url || fbUser.photoURL || undefined,
        bio: userProfile?.bio,
        phone_number: userProfile?.phone_number,
      };

      setSession(token);
      setUser(loggedInUser);
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(loggedInUser));
      await useNetworkStore.getState().recordSuccessfulLogin();

      return { data: { token, user: loggedInUser }, error: null };
    } catch (e: any) {
      return { data: null, error: mapAuthError(e, 'تعذر تسجيل الدخول، يرجى المحاولة ثانية.') };
    }
  };

  const register = async (registerData: {
    full_name: string;
    email: string;
    password: string;
    username: string;
    phone_number?: string;
  }) => {
    try {
      const cleanEmail = registerData.email.trim().toLowerCase();
      const cleanUsername = registerData.username.trim().toLowerCase().replace(/^@/, '');

      const cred = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        registerData.password
      );
      const fbUser = cred.user;

      if (registerData.full_name) {
        await updateProfile(fbUser, { displayName: registerData.full_name }).catch(() => {});
      }

      await upsertFirebaseUserProfile(fbUser.uid, {
        id: fbUser.uid,
        email: cleanEmail,
        username: cleanUsername,
        full_name: registerData.full_name,
        phone_number: registerData.phone_number || '',
      });
      await claimFirebaseUsername(cleanUsername, fbUser.uid, cleanEmail);

      const token = await fbUser.getIdToken();
      const registeredUser: User = {
        id: fbUser.uid,
        email: cleanEmail,
        username: cleanUsername,
        full_name: registerData.full_name,
        phone_number: registerData.phone_number,
      };

      setSession(token);
      setUser(registeredUser);
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(registeredUser));
      await useNetworkStore.getState().recordSuccessfulLogin();

      return { data: { token, user: registeredUser }, error: null };
    } catch (e: any) {
      return { data: null, error: mapAuthError(e, 'تعذر إنشاء الحساب، يرجى المحاولة ثانية.') };
    }
  };

  const logout = async () => {
    try {
      try {
        await useAudioStore.getState().stopTrack();
      } catch (audioErr) {
        console.warn('Error stopping audio on logout:', audioErr);
      }
      await signOut(auth);
      setSession(null);
      setUser(null);
      await AsyncStorage.multiRemove(['userToken', 'userData']);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const isGuest = !session;

  return (
    <AuthContext.Provider value={{ session, user, loading, isGuest, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
