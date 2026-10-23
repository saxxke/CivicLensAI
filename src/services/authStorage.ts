import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'civiclens_auth_token';
const USER_KEY = 'civiclens_user_profile';

// Fallback in-memory cache for web/unsupported runtimes
let memoryToken: string | null = null;
let memoryUser: string | null = null;

export const authStorage = {
  async saveAuth(token: string, user: any): Promise<void> {
    memoryToken = token;
    memoryUser = JSON.stringify(user);
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      }
    } catch (e) {
      console.warn('SecureStore write failed, using in-memory session', e);
    }
  },

  async getToken(): Promise<string | null> {
    if (memoryToken) return memoryToken;
    try {
      if (Platform.OS !== 'web') {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        memoryToken = stored;
        return stored;
      }
    } catch (e) {
      console.warn('SecureStore read token failed', e);
    }
    return memoryToken;
  },

  async getUser(): Promise<any | null> {
    if (memoryUser) {
      try {
        return JSON.parse(memoryUser);
      } catch {}
    }
    try {
      if (Platform.OS !== 'web') {
        const stored = await SecureStore.getItemAsync(USER_KEY);
        if (stored) {
          memoryUser = stored;
          return JSON.parse(stored);
        }
      }
    } catch (e) {
      console.warn('SecureStore read user failed', e);
    }
    return null;
  },

  async clearAuth(): Promise<void> {
    memoryToken = null;
    memoryUser = null;
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_KEY);
      }
    } catch (e) {
      console.warn('SecureStore delete failed', e);
    }
  },
};
