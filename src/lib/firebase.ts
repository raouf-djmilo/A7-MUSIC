import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  Auth,
  // @ts-ignore: getReactNativePersistence is exported in RN bundle of firebase/auth
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyAEU3BZteq_OvKEWmK7GKJZAZH5zV4WTNs',
  authDomain: 'a7-music-app-dz.firebaseapp.com',
  projectId: 'a7-music-app-dz',
  storageBucket: 'a7-music-app-dz.firebasestorage.app',
  messagingSenderId: '311336299532',
  appId: '1:311336299532:web:87de6d86f7bb0c755a1229',
};

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let authInstance: Auth;
try {
  authInstance =
    typeof getReactNativePersistence === 'function'
      ? initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        })
      : getAuth(app);
} catch {
  authInstance = getAuth(app);
}

export const firebaseApp = app;
export const auth = authInstance;
export const db: Firestore = getFirestore(app);
