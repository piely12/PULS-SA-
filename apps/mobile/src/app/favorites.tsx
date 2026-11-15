import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ClientTabBar } from '@/components/client-tab-bar';
import { pulsDesign } from '@/constants/puls-design';
import { API_BASE_URL, catalogApi, type CatalogProduct, formatXof } from '@/lib/api';
import { readFavoriteIds, saveFavoriteIds } from '@/lib/favorites-store';

export default function FavoritesScreen() {
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void readFavoriteIds().then(async (ids) => {
      const products = await Promise.all(ids.map((id) => catalogApi.product(id).catch(() => null)));
      if (active) setItems(products.filter((product): product is CatalogProduct => product !== null));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function remove(id: string) {
    const ids = await readFavoriteIds();
    const next = ids.filter((savedId) => savedId !== id);
    await saveFavoriteIds(next);
    setItems((current) => current.filter((product) => product.id !== id));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topline}><Image accessibilityLabel="PULS SA" source={require('../../assets/images/puls-sa-logo.png')} style={styles.logo} /><Text style={styles.city}>ABIDJAN</Text></View>
        <Text style={styles.eyebrow}>VOS COUPS DE CŒUR</Text>
        <Text style={styles.title}>Ma wishlist</Text>
        <Text style={styles.subtitle}>Retrouvez ici les pièces que vous avez sauvegardées.</Text>
        {loading ? <View style={styles.state}><ActivityIndicator color={pulsDesign.accent} size="large" /></View> : items.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.heart}>♡</Text>
            <Text style={styles.stateTitle}>Votre wishlist est vide</Text>
            <Text style={styles.stateCopy}>Touchez le cœur d’un article pour le garder sous la main.</Text>
            <Pressable onPress={() => router.push('/catalog')} style={styles.button}><Text style={styles.buttonText}>Explorer les articles</Text></Pressable>
          </View>
        ) : <View style={styles.list}>{items.map((product) => (
          <View key={product.id} style={styles.item}>
            <Pressable onPress={() => router.push('/catalog')} style={styles.product}>
              <View style={styles.productImage}>{product.image ? <Image source={{ uri: `${API_BASE_URL}/media/${product.image}` }} style={styles.image} /> : <Text style={styles.initial}>{product.name.charAt(0)}</Text>}</View>
              <View style={styles.productInfo}><Text style={styles.shop}>{product.shop.name}</Text><Text numberOfLines={2} style={styles.name}>{product.name}</Text><Text style={styles.price}>{formatXof(product.priceMinXof)}</Text></View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Retirer des favoris" onPress={() => void remove(product.id)} style={styles.remove}><Text style={styles.removeText}>×</Text></Pressable>
          </View>
        ))}</View>}
      </ScrollView>
      <ClientTabBar active="favorites" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: pulsDesign.background }, content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 112, maxWidth: 430, width: '100%', alignSelf: 'center' },
  topline: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 }, logo: { width: 66, height: 44, resizeMode: 'contain' }, city: { color: pulsDesign.muted, marginLeft: 'auto', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, eyebrow: { color: pulsDesign.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 9 }, title: { color: pulsDesign.text, fontSize: 26, fontWeight: '800' }, subtitle: { color: pulsDesign.muted, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 20 },
  state: { minHeight: 350, alignItems: 'center', justifyContent: 'center', backgroundColor: pulsDesign.surface, borderWidth: 1, borderColor: pulsDesign.border, borderRadius: 22, padding: 24 }, heart: { color: pulsDesign.accent, fontSize: 48, marginBottom: 10 }, stateTitle: { color: pulsDesign.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }, stateCopy: { color: pulsDesign.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 }, button: { minHeight: 52, backgroundColor: pulsDesign.accent, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 18 }, buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  list: { gap: 10 }, item: { position: 'relative', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: pulsDesign.border, borderRadius: 20, padding: 10 }, product: { flexDirection: 'row', gap: 12, alignItems: 'center' }, productImage: { width: 74, height: 86, borderRadius: 16, backgroundColor: pulsDesign.surfaceMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, image: { width: '100%', height: '100%', resizeMode: 'cover' }, initial: { color: pulsDesign.accent, fontSize: 30, fontWeight: '900' }, productInfo: { flex: 1, paddingRight: 35 }, shop: { color: pulsDesign.muted, fontSize: 10 }, name: { color: pulsDesign.text, fontSize: 13, fontWeight: '700', marginTop: 4 }, price: { color: pulsDesign.accent, fontSize: 12, fontWeight: '800', marginTop: 7 }, remove: { position: 'absolute', right: 10, top: 9, width: 32, height: 32, borderRadius: 16, backgroundColor: pulsDesign.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, removeText: { color: pulsDesign.text, fontSize: 22, lineHeight: 26 },
});
