import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL, ApiError, authApi, type AuthSession, type AuthUser } from '@/lib/api';
import { clearSession, readSession, saveSession } from '@/lib/token-store';

type Mode = 'login' | 'register';

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await readSession();
      if (!stored) {
        if (active) setBusy(false);
        return;
      }
      try {
        let current = stored;
        let profile: AuthUser;
        try {
          profile = await authApi.me(current.accessToken);
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
          current = await authApi.refresh(current.refreshToken);
          await saveSession(current);
          profile = await authApi.me(current.accessToken);
        }
        if (active) {
          setSession(current);
          setUser(profile);
        }
      } catch {
        await clearSession();
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const tokens =
        mode === 'register'
          ? await authApi.register({ fullName: fullName.trim(), email: email.trim(), password })
          : await authApi.login({ email: email.trim(), password });
      const profile = await authApi.me(tokens.accessToken);
      await saveSession(tokens);
      setSession(tokens);
      setUser(profile);
      setPassword('');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setSubmitting(true);
    try {
      if (session) await authApi.logout(session.refreshToken);
    } catch {
      // The local session must still be cleared if the API is unreachable.
    } finally {
      await clearSession();
      setSession(null);
      setUser(null);
      setMode('login');
      setSubmitting(false);
    }
  }

  if (busy) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#a1e533" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={styles.topline}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>P</Text>
              </View>
              <Text style={styles.brand}>PULS</Text>
              <View style={styles.cityPill}>
                <Text style={styles.cityText}>ABIDJAN</Text>
              </View>
            </View>

            <View style={styles.hero}>
              <Text style={styles.eyebrow}>LA MODE, TOUT PRÈS DE VOUS</Text>
              <Text style={styles.headline}>
                Votre style.{ '\n' }
                <Text style={styles.headlineAccent}>Votre ville.</Text>
              </Text>
              <Text style={styles.intro}>
                Retrouvez les boutiques d’Abidjan et faites-vous livrer en toute simplicité.
              </Text>
            </View>

            {user ? (
              <View style={styles.card}>
                <View style={styles.successIcon}>
                  <Text style={styles.successIconText}>✓</Text>
                </View>
                <Text style={styles.cardTitle}>Bienvenue sur PULS</Text>
                <Text style={styles.cardCopy}>Vous êtes connecté avec {user.email}</Text>
                <View style={styles.roleTag}>
                  <Text style={styles.roleText}>{roleName(user.roles[0])}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={signOut}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryButtonText}>
                    {submitting ? 'Déconnexion…' : 'Se déconnecter'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.modeSwitch}>
                  <ModeButton active={mode === 'login'} onPress={() => changeMode('login', setMode, setError)}>
                    Connexion
                  </ModeButton>
                  <ModeButton active={mode === 'register'} onPress={() => changeMode('register', setMode, setError)}>
                    Créer un compte
                  </ModeButton>
                </View>

                <Text style={styles.cardTitle}>
                  {mode === 'login' ? 'Ravi de vous revoir' : 'Rejoignez PULS'}
                </Text>
                <Text style={styles.cardCopy}>
                  {mode === 'login'
                    ? 'Connectez-vous pour retrouver vos boutiques.'
                    : 'Créez votre compte client en quelques secondes.'}
                </Text>

                {mode === 'register' && (
                  <Field
                    autoComplete="name"
                    label="Nom complet"
                    onChangeText={setFullName}
                    placeholder="Ex. Awa Koné"
                    value={fullName}
                  />
                )}
                <Field
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  label="Adresse e-mail"
                  onChangeText={setEmail}
                  placeholder="vous@exemple.com"
                  value={email}
                />
                <Field
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  label="Mot de passe"
                  onChangeText={setPassword}
                  placeholder="8 caractères minimum"
                  secureTextEntry
                  value={password}
                />

                {!!error && (
                  <View accessibilityLiveRegion="polite" style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={submit}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  {submitting ? (
                    <ActivityIndicator color="#11130c" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {mode === 'login' ? 'Me connecter' : 'Créer mon compte'}
                    </Text>
                  )}
                </Pressable>

                <Text style={styles.terms}>
                  En continuant, vous acceptez nos conditions d’utilisation et notre politique de confidentialité.
                </Text>
              </View>
            )}

            <View style={styles.footer}>
              <View style={styles.footerLine} />
              <Text style={styles.footerText}>LE STYLE ABIDJANAIS, À PORTÉE DE MAIN</Text>
              <Text style={styles.apiHint}>API : {API_BASE_URL}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'name' | 'email' | 'current-password' | 'new-password';
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        autoComplete={props.autoComplete}
        autoCorrect={false}
        keyboardType={props.keyboardType ?? 'default'}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#74756e"
        secureTextEntry={props.secureTextEntry}
        style={styles.input}
        value={props.value}
      />
    </View>
  );
}

function ModeButton(props: { active: boolean; onPress: () => void; children: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={[styles.modeButton, props.active && styles.modeButtonActive]}>
      <Text style={[styles.modeText, props.active && styles.modeTextActive]}>{props.children}</Text>
    </Pressable>
  );
}

function changeMode(mode: Mode, setMode: (mode: Mode) => void, setError: (error: string) => void) {
  setMode(mode);
  setError('');
}

function roleName(role?: string) {
  const names: Record<string, string> = {
    CUSTOMER: 'CLIENT',
    SHOP_OWNER: 'BOUTIQUE',
    LOGISTICS_AGENT: 'LOGISTIQUE',
    COURIER: 'LIVREUR',
    ADMIN: 'ADMINISTRATEUR',
  };
  return names[role ?? ''] ?? 'CLIENT';
}

function messageFor(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return 'E-mail ou mot de passe incorrect.';
  if (error instanceof ApiError && error.status === 409) return 'Cette adresse e-mail est déjà utilisée.';
  if (error instanceof ApiError && error.status === 400) return 'Vérifiez les informations saisies.';
  return error instanceof Error ? error.message : 'Une erreur est survenue. Réessayez.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#11130f' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#11130f' },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 },
  content: { width: '100%', maxWidth: 480 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 40 },
  brandMark: { width: 35, height: 35, borderRadius: 12, backgroundColor: '#a1e533', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#11130f', fontSize: 23, fontWeight: '900' },
  brand: { color: '#f3f3ec', fontWeight: '900', letterSpacing: 3, fontSize: 16 },
  cityPill: { marginLeft: 'auto', borderColor: '#34362f', borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  cityText: { color: '#c8cac0', letterSpacing: 1.5, fontSize: 10, fontWeight: '700' },
  hero: { marginBottom: 28 },
  eyebrow: { color: '#a1e533', fontSize: 11, fontWeight: '800', letterSpacing: 2.3, marginBottom: 12 },
  headline: { color: '#f3f3ec', fontSize: 43, lineHeight: 47, fontWeight: '800', letterSpacing: -1.4 },
  headlineAccent: { color: '#a1e533' },
  intro: { color: '#a3a59c', fontSize: 15, lineHeight: 22, maxWidth: 330, marginTop: 13 },
  card: { backgroundColor: '#1a1c17', borderColor: '#2e3029', borderWidth: 1, borderRadius: 24, padding: 21 },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#11130f', borderRadius: 14, padding: 4, marginBottom: 22 },
  modeButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 11 },
  modeButtonActive: { backgroundColor: '#292c22' },
  modeText: { color: '#999b92', fontSize: 13, fontWeight: '600' },
  modeTextActive: { color: '#f2f3eb' },
  cardTitle: { color: '#f3f3ec', fontSize: 21, fontWeight: '700', marginBottom: 5 },
  cardCopy: { color: '#a3a59c', fontSize: 13, lineHeight: 19, marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { color: '#d8d9d1', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { height: 50, borderWidth: 1, borderColor: '#383a33', backgroundColor: '#131510', borderRadius: 12, paddingHorizontal: 14, color: '#f4f4ed', fontSize: 15 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#a1e533', borderRadius: 14, marginTop: 5 },
  primaryButtonText: { color: '#11130f', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.82 },
  terms: { color: '#777970', textAlign: 'center', fontSize: 10, lineHeight: 15, marginTop: 15, paddingHorizontal: 9 },
  errorBox: { backgroundColor: '#321f1d', borderColor: '#70423b', borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 12 },
  errorText: { color: '#ffb6a8', fontSize: 12, lineHeight: 17 },
  successIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#a1e533', alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  successIconText: { color: '#11130f', fontSize: 26, fontWeight: '800' },
  roleTag: { alignSelf: 'flex-start', backgroundColor: '#292c22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 18 },
  roleText: { color: '#a1e533', fontWeight: '800', letterSpacing: 1.2, fontSize: 10 },
  secondaryButton: { borderColor: '#494b43', borderWidth: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#f1f2ea', fontWeight: '700', fontSize: 14 },
  footer: { alignItems: 'center', paddingVertical: 28 },
  footerLine: { width: 38, height: 2, backgroundColor: '#a1e533', marginBottom: 12 },
  footerText: { color: '#686a62', letterSpacing: 1.6, fontWeight: '700', fontSize: 9 },
  apiHint: { color: '#4f514a', fontSize: 9, marginTop: 10 },
});
