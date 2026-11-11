import type { AuthSession } from './api';

// In-memory for this first mobile slice; the next auth increment can replace
// this with Expo SecureStore without changing the screen or API client.
let session: AuthSession | null = null;

export async function readSession(): Promise<AuthSession | null> {
  return session;
}

export async function saveSession(nextSession: AuthSession): Promise<void> {
  session = nextSession;
}

export async function clearSession(): Promise<void> {
  session = null;
}
