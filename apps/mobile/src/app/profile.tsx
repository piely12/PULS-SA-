import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ClientTabBar } from '@/components/client-tab-bar';
import { pulsDesign } from '@/constants/puls-design';
import { authApi, type AuthUser } from '@/lib/api';
import { clearSession, readSession } from '@/lib/token-store';

export default function ProfileScreen() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void readSession().then(async (session) => {
      if (!session) return;
      const currentUser = await authApi.me(session.accessToken);
      if (active) setUser(currentUser);
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function signOut() {
    await clearSession();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topline}><Image accessibilityLabel="PULS SA" source={require('../../assets/images/puls-sa-logo.png')} style={styles.logo} /><Text style={styles.city}>ABIDJAN</Text></View>
        <Text style={styles.eyebrow}>VOTRE ESPACE</Text>
        <Text style={styles.title}>Mon profil</Text>
        {loading ? <View style={styles.state}><ActivityIndicator color={pulsDesign.accent} /></View> : user ? (
          <>
            <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarText}>{user.email.charAt(0).toUpperCase()}</Text></View><View style={styles.identityCopy}><Text style={styles.name}>{user.email}</Text><Text style={styles.role}>{roleLabel(user.roles[0])}</Text></View></View>
            <View style={styles.menu}>
              <MenuRow title="Mes adresses" detail="Gérer mes adresses de livraison" onPress={() => router.push('/checkout')} />
              <MenuRow title="Mes commandes" detail="Suivre mes achats et mes retours" onPress={() => {}} />
              <MenuRow title="Notifications" detail="Préférences et alertes" onPress={() => {}} />
              <MenuRow title="Centre d’aide" detail="Questions fréquentes et assistance" onPress={() => {}} />
            </View>
            <Pressable onPress={() => void signOut()} style={styles.logout}><Text style={styles.logoutText}>Se déconnecter</Text></Pressable>
          </>
        ) : <View style={styles.state}><Text style={styles.stateTitle}>Connectez-vous pour ouvrir votre profil</Text><Pressable onPress={() => router.replace('/')} style={styles.button}><Text style={styles.buttonText}>Connexion</Text></Pressable></View>}
      </ScrollView>
      <ClientTabBar active="profile" />
    </SafeAreaView>
  );
}

function MenuRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.menuRow}><View style={styles.menuCopy}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuDetail}>{detail}</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
}

function roleLabel(role?: string) {
  const labels: Record<string, string> = { CUSTOMER: 'CLIENT PULS', SHOP_OWNER: 'BOUTIQUE' };
  return labels[role ?? ''] ?? 'CLIENT PULS';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: pulsDesign.background }, content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 112, maxWidth: 430, width: '100%', alignSelf: 'center' },
  topline: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 }, logo: { width: 66, height: 44, resizeMode: 'contain' }, city: { color: pulsDesign.muted, marginLeft: 'auto', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, eyebrow: { color: pulsDesign.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 9 }, title: { color: pulsDesign.text, fontSize: 26, fontWeight: '800', marginBottom: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pulsDesign.surface, borderWidth: 1, borderColor: pulsDesign.border, borderRadius: 22, padding: 18, marginBottom: 14 }, avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: pulsDesign.accentSoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: pulsDesign.accent, fontSize: 23, fontWeight: '900' }, identityCopy: { flex: 1 }, name: { color: pulsDesign.text, fontSize: 13, fontWeight: '800' }, role: { color: pulsDesign.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 5 },
  menu: { backgroundColor: pulsDesign.surface, borderWidth: 1, borderColor: pulsDesign.border, borderRadius: 22, paddingHorizontal: 16 }, menuRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: pulsDesign.border }, menuCopy: { flex: 1 }, menuTitle: { color: pulsDesign.text, fontSize: 13, fontWeight: '700' }, menuDetail: { color: pulsDesign.muted, fontSize: 11, marginTop: 4 }, chevron: { color: pulsDesign.muted, fontSize: 23 },
  state: { minHeight: 280, alignItems: 'center', justifyContent: 'center', backgroundColor: pulsDesign.surface, borderRadius: 22, borderWidth: 1, borderColor: pulsDesign.border, padding: 24 }, stateTitle: { color: pulsDesign.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }, button: { minHeight: 50, backgroundColor: pulsDesign.accent, borderRadius: 26, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, logout: { minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 18 }, logoutText: { color: pulsDesign.accent, fontSize: 13, fontWeight: '800' },
});
