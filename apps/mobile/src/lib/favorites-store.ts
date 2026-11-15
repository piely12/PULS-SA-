import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'puls.customer.favorites';

export async function readFavoriteIds(): Promise<string[]> {
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveFavoriteIds(ids: string[]): Promise<void> {
  const value = JSON.stringify([...new Set(ids)]);
  if (Platform.OS === 'web') localStorage.setItem(KEY, value);
  else await SecureStore.setItemAsync(KEY, value);
}
