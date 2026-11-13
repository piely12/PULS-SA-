import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  API_BASE_URL,
  catalogApi,
  type CatalogCategory,
  type CatalogProduct,
} from '@/lib/api';

const accent = '#a1e533';

export default function CatalogScreen() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [detail, setDetail] = useState<CatalogProduct | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void catalogApi.categories().then((items) => {
      if (active) setCategories(items);
    }).catch(() => {
      // Product browsing remains available when categories fail to load.
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setError('');
      if (page === 1) setLoading(true);
      else setMoreLoading(true);
      void catalogApi.products({ q: query.trim(), category, page }).then((result) => {
        if (!active) return;
        setProducts((current) => page === 1 ? result.items : [...current, ...result.items]);
        setPages(result.pagination.pages);
      }).catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Le catalogue est indisponible.');
        if (page === 1) setProducts([]);
      }).finally(() => {
        if (active) {
          setLoading(false);
          setMoreLoading(false);
        }
      });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, category, page]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    let active = true;
    void catalogApi.product(selected.id).then((product) => {
      if (active) setDetail(product);
    }).catch(() => {
      if (active) setDetail(selected);
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [selected]);

  function changeFilter(nextCategory: string) {
    setCategory(nextCategory);
    setPage(1);
    setProducts([]);
  }

  function closeDetail() {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
  }

  function openDetail(product: CatalogProduct) {
    setDetail(null);
    setDetailLoading(true);
    setSelected(product);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topline}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>P</Text></View>
          <Text style={styles.brand}>PULS</Text>
          <Text style={styles.city}>ABIDJAN</Text>
        </View>

        <Text style={styles.eyebrow}>LE STYLE ABIDJANAIS</Text>
        <Text style={styles.title}>Le catalogue</Text>
        <Text style={styles.subtitle}>Les pièces des boutiques de votre ville.</Text>

        <TextInput
          accessibilityLabel="Rechercher un produit"
          autoCapitalize="none"
          onChangeText={(value) => { setQuery(value); setPage(1); }}
          placeholder="Robe, sneakers, accessoires…"
          placeholderTextColor="#74756e"
          returnKeyType="search"
          style={styles.search}
          value={query}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <CategoryChip active={!category} label="Tout" onPress={() => changeFilter('')} />
          {categories.map((item) => (
            <CategoryChip key={item.id} active={category === item.slug} label={item.name} onPress={() => changeFilter(item.slug)} />
          ))}
        </ScrollView>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{loading ? 'Chargement…' : `${products.length} article${products.length === 1 ? '' : 's'}`}</Text>
          <Text style={styles.sectionMeta}>PRIX EN FCFA</Text>
        </View>

        {loading && products.length === 0 ? (
          <View style={styles.state}><ActivityIndicator color={accent} size="large" /></View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>Connexion impossible</Text>
            <Text style={styles.stateCopy}>{error}</Text>
            <Pressable onPress={() => { setPage(1); setLoading(true); }} style={styles.retry}><Text style={styles.retryText}>Réessayer</Text></Pressable>
          </View>
        ) : products.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>Aucun produit trouvé</Text>
            <Text style={styles.stateCopy}>Essayez un autre mot ou une autre catégorie.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {products.map((product) => <ProductCard key={product.id} product={product} onPress={() => openDetail(product)} />)}
          </View>
        )}

        {!loading && !error && page < pages && (
          <Pressable disabled={moreLoading} onPress={() => setPage((value) => value + 1)} style={styles.more}>
            {moreLoading ? <ActivityIndicator color="#11130f" /> : <Text style={styles.moreText}>Voir plus</Text>}
          </Pressable>
        )}
        <Text style={styles.footer}>PULS · LA MODE, TOUT PRÈS DE VOUS</Text>
      </ScrollView>

      <Modal animationType="slide" onRequestClose={closeDetail} transparent visible={!!selected}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={closeDetail} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            {detailLoading ? <ActivityIndicator color={accent} style={styles.modalLoading} /> : detail && (
              <ScrollView>
                <Text style={styles.modalCategory}>{detail.category.name} · {detail.shop.name}</Text>
                <Text style={styles.modalTitle}>{detail.name}</Text>
                <Text style={styles.modalPrice}>{priceRange(detail)}</Text>
                <Text style={styles.modalStock}>{detail.available > 0 ? `${detail.available} en stock` : 'Indisponible pour le moment'}</Text>
                {!!detail.description && <Text style={styles.description}>{detail.description}</Text>}
                {detail.variants && detail.variants.length > 0 && (
                  <>
                    <Text style={styles.variantHeading}>Tailles et couleurs</Text>
                    {detail.variants.map((variant) => (
                      <View key={variant.id} style={styles.variantRow}>
                        <Text style={styles.variantName}>{[variant.size, variant.color].filter(Boolean).join(' · ') || 'Standard'}</Text>
                        <Text style={styles.variantPrice}>{formatXof(variant.priceXof)} · {variant.available} dispo.</Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CategoryChip(props: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.chip, props.active && styles.chipActive]}>
      <Text style={[styles.chipText, props.active && styles.chipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

function ProductCard(props: { product: CatalogProduct; onPress: () => void }) {
  const { product } = props;
  return (
    <Pressable accessibilityRole="button" onPress={props.onPress} style={({ pressed }) => [styles.productCard, pressed && styles.cardPressed]}>
      <View style={styles.productArt}>
        {product.image ? (
          <Image source={{ uri: `${API_BASE_URL}/media/${product.image}` }} style={styles.productImage} />
        ) : (
          <Text style={styles.productInitial}>{product.name.trim().charAt(0).toUpperCase()}</Text>
        )}
        <Text style={styles.artLabel}>{product.category.name.toUpperCase()}</Text>
      </View>
      <View style={styles.productInfo}>
        <Text numberOfLines={1} style={styles.shopName}>{product.shop.name}</Text>
        <Text numberOfLines={2} style={styles.productName}>{product.name}</Text>
        <Text style={styles.productPrice}>{priceRange(product)}</Text>
        <Text style={styles.productStock}>{product.available > 0 ? 'DISPONIBLE' : 'ÉPUISÉ'}</Text>
      </View>
    </Pressable>
  );
}

function formatXof(value: string) {
  return `${Number(value).toLocaleString('fr-FR')} FCFA`;
}

function priceRange(product: CatalogProduct) {
  if (product.priceMinXof === product.priceMaxXof) return formatXof(product.priceMinXof);
  return `${Number(product.priceMinXof).toLocaleString('fr-FR')}–${Number(product.priceMaxXof).toLocaleString('fr-FR')} FCFA`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#11130f' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 38, maxWidth: 900, width: '100%', alignSelf: 'center' },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 34 },
  back: { width: 35, height: 35, borderRadius: 12, backgroundColor: '#1a1c17', alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  backText: { color: '#f3f3ec', fontSize: 28, lineHeight: 31 },
  brandMark: { width: 32, height: 32, borderRadius: 11, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#11130f', fontSize: 21, fontWeight: '900' },
  brand: { color: '#f3f3ec', fontWeight: '900', letterSpacing: 3, fontSize: 15 },
  city: { color: '#a3a59c', marginLeft: 'auto', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  eyebrow: { color: accent, fontSize: 10, fontWeight: '800', letterSpacing: 2.1, marginBottom: 9 },
  title: { color: '#f3f3ec', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: '#a3a59c', fontSize: 14, marginTop: 8, marginBottom: 22 },
  search: { color: '#f3f3ec', height: 50, borderWidth: 1, borderColor: '#34362f', borderRadius: 14, backgroundColor: '#1a1c17', paddingHorizontal: 15, fontSize: 14 },
  chips: { gap: 8, paddingVertical: 17 },
  chip: { borderWidth: 1, borderColor: '#34362f', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: accent, borderColor: accent },
  chipText: { color: '#b7b9b0', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#11130f', fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#f3f3ec', fontSize: 17, fontWeight: '700' },
  sectionMeta: { color: '#74766d', fontSize: 9, letterSpacing: 1.2, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  productCard: { width: '48%', flexGrow: 1, flexBasis: 155, overflow: 'hidden', backgroundColor: '#1a1c17', borderColor: '#2e3029', borderWidth: 1, borderRadius: 18, marginBottom: 2 },
  cardPressed: { opacity: 0.82 },
  productArt: { height: 142, backgroundColor: '#25291f', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  productInitial: { color: '#697b4f', fontSize: 70, fontWeight: '900' },
  productImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  artLabel: { color: '#a9c87c', position: 'absolute', bottom: 12, left: 12, fontSize: 8, letterSpacing: 1.2, fontWeight: '800' },
  productInfo: { paddingHorizontal: 13, paddingVertical: 13 },
  shopName: { color: '#999b92', fontSize: 10, marginBottom: 5 },
  productName: { color: '#f2f3eb', fontSize: 13, lineHeight: 18, fontWeight: '700', minHeight: 36 },
  productPrice: { color: accent, fontSize: 13, fontWeight: '800', marginTop: 9 },
  productStock: { color: '#76786f', fontSize: 8, letterSpacing: 1.1, fontWeight: '800', marginTop: 7 },
  state: { minHeight: 210, alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 18, backgroundColor: '#1a1c17' },
  stateTitle: { color: '#f3f3ec', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  stateCopy: { color: '#a3a59c', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  retry: { backgroundColor: accent, borderRadius: 12, paddingHorizontal: 17, paddingVertical: 11, marginTop: 15 },
  retryText: { color: '#11130f', fontWeight: '800', fontSize: 12 },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 13, marginTop: 18 },
  moreText: { color: '#11130f', fontSize: 13, fontWeight: '800' },
  footer: { color: '#55574f', textAlign: 'center', letterSpacing: 1.2, fontSize: 9, fontWeight: '700', marginTop: 30 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' },
  modalCard: { maxHeight: '82%', minHeight: '42%', backgroundColor: '#1a1c17', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 13, paddingBottom: 28 },
  modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 4, backgroundColor: '#52544c', marginBottom: 16 },
  close: { position: 'absolute', zIndex: 1, right: 18, top: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: '#292c25', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#f3f3ec', fontSize: 24, lineHeight: 27 },
  modalLoading: { marginTop: 70 },
  modalCategory: { color: accent, fontSize: 10, letterSpacing: 1.2, fontWeight: '800', marginTop: 8, marginBottom: 12 },
  modalTitle: { color: '#f3f3ec', fontSize: 25, lineHeight: 31, fontWeight: '800', paddingRight: 35 },
  modalPrice: { color: accent, fontSize: 19, fontWeight: '800', marginTop: 13 },
  modalStock: { color: '#aaa', fontSize: 12, marginTop: 5 },
  description: { color: '#c1c2ba', fontSize: 14, lineHeight: 21, marginTop: 18 },
  variantHeading: { color: '#f3f3ec', fontSize: 14, fontWeight: '700', marginTop: 22, marginBottom: 5 },
  variantRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#34362f', gap: 12 },
  variantName: { color: '#f3f3ec', fontSize: 13, fontWeight: '600', flex: 1 },
  variantPrice: { color: '#a3a59c', fontSize: 11, textAlign: 'right' },
});
