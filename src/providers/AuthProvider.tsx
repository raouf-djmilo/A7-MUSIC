import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

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
  login: (data: any) => Promise<{ data: any; error: any }>;
  register: (data: any) => Promise<{ data: any; error: any }>;
  logout: () => Promise<void>;
  updateUser: (newData: Partial<User>) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUser = async (newData: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...newData };
    setUser(updatedUser);
    await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
    try {
      await supabase.from('profiles').update(newData).eq('id', user.id);
    } catch (e) {
      console.warn('Failed to update profile in Supabase:', e);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (initialSession?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', initialSession.user.id)
            .maybeSingle();

          const currentUser: User = {
            id: initialSession.user.id,
            email: initialSession.user.email || '',
            username: profile?.username || initialSession.user.user_metadata?.username,
            full_name: profile?.full_name || initialSession.user.user_metadata?.full_name,
            avatar_url: profile?.avatar_url,
            bio: profile?.bio,
            phone_number: profile?.phone_number || initialSession.user.user_metadata?.phone_number,
          };

          setSession(initialSession.access_token);
          setUser(currentUser);
          await AsyncStorage.setItem('userToken', initialSession.access_token);
          await AsyncStorage.setItem('userData', JSON.stringify(currentUser));
        } else {
          // Fallback to local storage
          const storedToken = await AsyncStorage.getItem('userToken');
          const storedUser = await AsyncStorage.getItem('userData');
          if (storedToken && storedUser) {
            setSession(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      } catch (e) {
        console.error('Failed to initialize Supabase session:', e);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_OUT' || !currentSession) {
        setSession(null);
        setUser(null);
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('userData');
      } else if (currentSession?.user) {
        setSession(currentSession.access_token);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (loginData: { identifier: string; password: string }) => {
    try {
      let email = loginData.identifier.trim();

      // If user provided a username instead of email, look up their email
      if (!email.includes('@')) {
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('email')
          .ilike('username', email)
          .maybeSingle();

        if (profileErr || !profile?.email) {
          return { data: null, error: new Error('اسم المستخدم غير مسجل لدينا') };
        }
        email = profile.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: loginData.password,
      });

      if (error) {
        return { data: null, error };
      }

      const authUser = data.user;
      const token = data.session.access_token;

      // Fetch profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      const loggedInUser: User = {
        id: authUser.id,
        email: authUser.email || email,
        username: userProfile?.username || authUser.user_metadata?.username,
        full_name: userProfile?.full_name || authUser.user_metadata?.full_name,
        avatar_url: userProfile?.avatar_url,
        bio: userProfile?.bio,
        phone_number: userProfile?.phone_number,
      };

      setSession(token);
      setUser(loggedInUser);

      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(loggedInUser));

      return { data: { token, user: loggedInUser }, error: null };
    } catch (e: any) {
      return { data: null, error: e };
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
      const cleanUsername = registerData.username.trim().toLowerCase();

      // Sign up with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: registerData.password,
        options: {
          data: {
            username: cleanUsername,
            full_name: registerData.full_name,
            phone_number: registerData.phone_number,
          },
        },
      });

      if (error) {
        return { data: null, error };
      }

      const authUser = data.user;
      if (!authUser) {
        return { data: null, error: new Error('فشل إنشاء الحساب، يرجى المحاولة لاحقاً.') };
      }

      // Ensure profile exists in profiles table
      const profileRecord = {
        id: authUser.id,
        email: cleanEmail,
        username: cleanUsername,
        full_name: registerData.full_name,
        phone_number: registerData.phone_number,
        created_at: new Date().toISOString(),
      };

      await supabase.from('profiles').upsert(profileRecord);

      const token = data.session?.access_token || '';
      const registeredUser: User = {
        id: authUser.id,
        email: cleanEmail,
        username: cleanUsername,
        full_name: registerData.full_name,
        phone_number: registerData.phone_number,
      };

      setSession(token);
      setUser(registeredUser);

      if (token) {
        await AsyncStorage.setItem('userToken', token);
      }
      await AsyncStorage.setItem('userData', JSON.stringify(registeredUser));

      return { data: { token, user: registeredUser }, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userData');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

