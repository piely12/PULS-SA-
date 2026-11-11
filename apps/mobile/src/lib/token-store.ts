import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { AuthSession } from './api';

const SESSION_KEY = 'puls.auth.session';
let webSession: AuthSession | null = null;

export async function readSession(): Promise<AuthSession | null> {
  if (Platform.OS === 'web') return webSession;
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AuthSession;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
}

export async function saveSession(nextSession: AuthSession): Promise<void> {
  if (Platform.OS === 'web') {
    webSession = nextSession;
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(nextSession));
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    webSession = null;
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
