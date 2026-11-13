import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { API_BASE_URL, ApiError, cartApi, type CartSnapshot, formatXof } from '@/lib/api';
import { readSession } from '@/lib/token-store';

const accent = '#a1e533';

export default function CartScreen() {
  const [cart, setCart] = useState<CartSnapshot>({ items: [], subtotalXof: '0', hasUnavailableItems: false });
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  async function reload(accessToken: string) {
    setCart(await cartApi.get(accessToken));
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await readSession();
      if (!session) {
        if (active) { setNeedsLogin(true); setLoading(false); }
        return;
      }
      if (active) setToken(session.accessToken);
      try {
        const result = await cartApi.get(session.accessToken);
        if (active) setCart(result);
      } catch (cause) {
        if (active) {
          setNeedsLogin(cause instanceof ApiError && cause.status === 401);
          setMessage(cause instanceof Error ? cause.message : 'Impossible de charger le panier.');
        }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  async function changeQuantity(itemId: string, quantity: number) {
    if (!token) return;
    setBusyId(itemId); setMessage('');
    try { await cartApi.update(token, itemId, quantity); await reload(token); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Mise à jour impossible.'); }
    finally { setBusyId(''); }
  }

  async function removeItem(itemId: string) {
    if (!token) return;
    setBusyId(itemId); setMessage('');
    try { await cartApi.remove(token, itemId); await reload(token); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Suppression impossible.'); }
    finally { setBusyId(''); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topline}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>P</Text></View>
          <Text style={styles.brand}>PULS</Text>
          <Text style={styles.city}>ABIDJAN</Text>
        </View>

        <Text style={styles.eyebrow}>VOTRE SÉLECTION</Text>
        <Text style={styles.title}>Mon panier</Text>
        <Text style={styles.subtitle}>{cart.items.length} article{cart.items.length === 1 ? '' : 's'} · les articles sont regroupés par boutique au paiement.</Text>

        {message ? <View accessibilityLiveRegion="polite" style={styles.error}><Text style={styles.errorText}>{message}</Text></View> : null}

        {loading ? <View style={styles.state}><ActivityIndicator color={accent} size="large" /></View> : needsLogin ? (
          <View style={styles.state}>
            <Text style={styles.stateIcon}>♙</Text>
            <Text style={styles.stateTitle}>Connectez-vous pour voir votre panier</Text>
            <Text style={styles.stateCopy}>Votre panier est associé à votre compte client.</Text>
            <Link href="/" asChild><Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>Connexion / inscription</Text></Pressable></Link>
          </View>
        ) : cart.items.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.stateIcon}>▱</Text>
            <Text style={styles.stateTitle}>Votre panier est vide</Text>
            <Text style={styles.stateCopy}>Explorez les boutiques et ajoutez les articles qui vous plaisent.</Text>
            <Link href="/catalog" asChild><Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>Découvrir le catalogue</Text></Pressable></Link>
          </View>
        ) : (
          <>
            {cart.hasUnavailableItems && <View style={styles.stockNotice}><Text style={styles.stockNoticeText}>Un article n’est plus disponible ou le stock a changé. Retirez-le ou ajustez la quantité avant de continuer.</Text></View>}
            <View style={styles.items}>
              {cart.items.map((item) => (
                <View key={item.id} style={[styles.item, !item.canBuy && styles.itemUnavailable]}>
                  <View style={styles.itemImage}>
                    {item.image ? <Image source={{ uri: `${API_BASE_URL}/media/${item.image}` }} style={styles.image} /> : <Text style={styles.imageInitial}>{item.name.charAt(0).toUpperCase()}</Text>}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.shop}>{item.shop.name}</Text>
                    <Text numberOfLines={2} style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.variant}>{[item.size, item.color].filter(Boolean).join(' · ') || 'Standard'}</Text>
                    <Text style={styles.price}>{formatXof(item.unitPriceXof)}</Text>
                    {!item.canBuy && <Text style={styles.unavailable}>{item.available === 0 ? 'Indisponible' : `${item.available} disponible${item.available === 1 ? '' : 's'}`}</Text>}
                    <View style={styles.controls}>
                      <View style={styles.quantityControl}>
                        <Pressable accessibilityRole="button" accessibilityLabel="Réduire la quantité" disabled={busyId === item.id || !item.canBuy || item.quantity <= 1} onPress={() => changeQuantity(item.id, item.quantity - 1)} style={styles.quantityButton}>
                          <Text style={styles.quantityButtonText}>−</Text>
                        </Pressable>
                        <Text style={styles.quantity}>{busyId === item.id ? '…' : item.quantity}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel="Augmenter la quantité" disabled={busyId === item.id || !item.canBuy || item.quantity >= item.available} onPress={() => changeQuantity(item.id, item.quantity + 1)} style={styles.quantityButton}>
                          <Text style={styles.quantityButtonText}>＋</Text>
                        </Pressable>
                      </View>
                      <Pressable disabled={busyId === item.id} onPress={() => removeItem(item.id)} style={styles.removeButton}>
                        <Text style={styles.removeText}>Retirer</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.lineTotal}>{formatXof(item.lineTotalXof)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Résumé</Text>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Sous-total disponible</Text><Text style={styles.summaryValue}>{formatXof(cart.subtotalXof)}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Livraison</Text><Text style={styles.summaryHint}>Calculée à l’étape suivante</Text></View>
              <View style={styles.divider} />
              <View style={styles.summaryRow}><Text style={styles.totalLabel}>Total provisoire</Text><Text style={styles.totalValue}>{formatXof(cart.subtotalXof)}</Text></View>
              <Pressable accessibilityRole="button" disabled style={styles.checkoutButton}><Text style={styles.checkoutText}>Continuer vers le paiement</Text></Pressable>
              <Text style={styles.checkoutHint}>Le choix de l’adresse et le paiement sont la prochaine étape du projet.</Text>
            </View>
          </>
        )}
        <Text style={styles.footer}>PULS · ACHATS LOCAUX À ABIDJAN</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#11130f' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 38, maxWidth: 760, width: '100%', alignSelf: 'center' },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 34 },
  back: { width: 35, height: 35, borderRadius: 12, backgroundColor: '#1a1c17', alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  backText: { color: '#f3f3ec', fontSize: 28, lineHeight: 31 },
  brandMark: { width: 32, height: 32, borderRadius: 11, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#11130f', fontSize: 21, fontWeight: '900' },
  brand: { color: '#f3f3ec', fontWeight: '900', letterSpacing: 3, fontSize: 15 },
  city: { color: '#a3a59c', marginLeft: 'auto', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  eyebrow: { color: accent, fontSize: 10, fontWeight: '800', letterSpacing: 2.1, marginBottom: 9 },
  title: { color: '#f3f3ec', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: '#a3a59c', fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 22 },
  state: { minHeight: 300, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 18, backgroundColor: '#1a1c17' },
  stateIcon: { color: '#829665', fontSize: 39, marginBottom: 12 },
  stateTitle: { color: '#f3f3ec', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  stateCopy: { color: '#a3a59c', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7, maxWidth: 300 },
  primaryButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 13, minHeight: 48, paddingHorizontal: 18, marginTop: 18 },
  primaryButtonText: { color: '#11130f', fontSize: 13, fontWeight: '800' },
  error: { backgroundColor: '#321f1d', borderColor: '#70423b', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 13 },
  errorText: { color: '#ffb6a8', fontSize: 12, lineHeight: 18 },
  stockNotice: { padding: 12, borderRadius: 11, backgroundColor: '#392f1d', borderWidth: 1, borderColor: '#6a5731', marginBottom: 12 },
  stockNoticeText: { color: '#f1d795', fontSize: 11, lineHeight: 17 },
  items: { gap: 10 },
  item: { flexDirection: 'row', gap: 12, position: 'relative', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#30322b', backgroundColor: '#1a1c17' },
  itemUnavailable: { borderColor: '#65423b' },
  itemImage: { width: 78, height: 94, borderRadius: 10, overflow: 'hidden', backgroundColor: '#292d22', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  imageInitial: { color: '#bada88', fontSize: 34, fontWeight: '900' },
  itemInfo: { flex: 1, minWidth: 0, paddingRight: 2 },
  shop: { color: '#a1e533', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  itemName: { color: '#f2f3eb', fontSize: 13, lineHeight: 17, fontWeight: '700', marginTop: 4 },
  variant: { color: '#a3a59c', fontSize: 10, marginTop: 4 },
  price: { color: '#dce0d2', fontSize: 11, fontWeight: '700', marginTop: 7 },
  unavailable: { color: '#ffae9c', fontSize: 9, fontWeight: '700', marginTop: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 9 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3c3f35', borderRadius: 8, overflow: 'hidden' },
  quantityButton: { width: 29, height: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#24271f' },
  quantityButtonText: { color: '#e8eade', fontSize: 14, fontWeight: '700' },
  quantity: { minWidth: 26, textAlign: 'center', color: '#f2f3eb', fontSize: 11, fontWeight: '700' },
  removeButton: { paddingVertical: 5 },
  removeText: { color: '#d49381', fontSize: 10, fontWeight: '600' },
  lineTotal: { color: accent, fontSize: 10, fontWeight: '800', position: 'absolute', right: 12, top: 12 },
  summary: { marginTop: 14, padding: 18, borderRadius: 17, borderWidth: 1, borderColor: '#30322b', backgroundColor: '#191b16' },
  summaryTitle: { color: '#f2f3eb', fontSize: 16, fontWeight: '800', marginBottom: 15 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7 },
  summaryLabel: { color: '#a3a59c', fontSize: 11 },
  summaryValue: { color: '#e7e9df', fontSize: 11, fontWeight: '700' },
  summaryHint: { color: '#a3a59c', fontSize: 10, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#34372e', marginVertical: 7 },
  totalLabel: { color: '#f2f3eb', fontSize: 13, fontWeight: '800' },
  totalValue: { color: accent, fontSize: 15, fontWeight: '900' },
  checkoutButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center', backgroundColor: '#34372e', borderRadius: 12, marginTop: 15, opacity: 0.8 },
  checkoutText: { color: '#9a9d91', fontSize: 12, fontWeight: '800' },
  checkoutHint: { color: '#74776d', fontSize: 9, textAlign: 'center', marginTop: 9 },
  footer: { color: '#55574f', textAlign: 'center', letterSpacing: 1.2, fontSize: 9, fontWeight: '700', marginTop: 28 },
});
