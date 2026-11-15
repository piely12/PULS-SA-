import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { pulsDesign } from '@/constants/puls-design';

type Tab = 'home' | 'explore' | 'favorites' | 'cart' | 'profile';

const tabs: { id: Tab; label: string; icon: string; path: '/' | '/catalog' | '/favorites' | '/cart' | '/profile' }[] = [
  { id: 'home', label: 'Accueil', icon: '⌂', path: '/' },
  { id: 'explore', label: 'Explorer', icon: '⌕', path: '/catalog' },
  { id: 'favorites', label: 'Favoris', icon: '♡', path: '/favorites' },
  { id: 'cart', label: 'Panier', icon: '▱', path: '/cart' },
  { id: 'profile', label: 'Profil', icon: '♙', path: '/profile' },
];

export function ClientTabBar({ active }: { active: Tab }) {
  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {tabs.map((tab) => (
          <Pressable key={tab.id} accessibilityRole="button" accessibilityLabel={tab.label} onPress={() => router.replace(tab.path)} style={styles.tab}>
            <Text style={[styles.icon, tab.id === active && styles.active]}>{tab.icon}</Text>
            <Text style={[styles.label, tab.id === active && styles.active]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  bar: { width: '100%', maxWidth: 430, height: 84, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: pulsDesign.border, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 8 },
  tab: { minWidth: 56, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { color: pulsDesign.muted, fontSize: 23, lineHeight: 26 },
  label: { color: pulsDesign.muted, fontSize: 10, fontWeight: '700' },
  active: { color: pulsDesign.accent },
});
