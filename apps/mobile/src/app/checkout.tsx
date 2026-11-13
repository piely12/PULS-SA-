import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ApiError,
  checkoutApi,
  formatXof,
  type DeliveryAddress,
  type DeliveryQuote,
  type DeliveryZone,
} from '@/lib/api';
import { readSession } from '@/lib/token-store';

const accent = '#a1e533';

export default function CheckoutScreen() {
  const [token, setToken] = useState('');
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [addresses, setAddresses] = useState<DeliveryAddress[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [commune, setCommune] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [landmark, setLandmark] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await readSession();
      if (!session) {
        if (active) { setMessage('Connectez-vous pour préparer votre livraison.'); setLoading(false); }
        return;
      }
      if (active) setToken(session.accessToken);
      try {
        const [zoneList, addressList] = await Promise.all([
          checkoutApi.zones(session.accessToken), checkoutApi.addresses(session.accessToken),
        ]);
        if (!active) return;
        setZones(zoneList);
        setAddresses(addressList);
        const preferred = addressList.find((address) => address.isDefault) ?? addressList[0];
        if (preferred) {
          setSelectedId(preferred.id);
          setShowForm(false);
          const nextQuote = await checkoutApi.quote(session.accessToken, preferred.id);
          if (active) setQuote(nextQuote);
        } else {
          setShowForm(true);
          if (zoneList[0]) { setZoneId(zoneList[0].id); setCommune(zoneList[0].name); }
        }
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : 'Impossible de préparer la livraison.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  async function selectAddress(addressId: string) {
    setSelectedId(addressId); setQuote(null); setMessage('');
    try { setQuote(await checkoutApi.quote(token, addressId)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Calcul du total impossible.'); }
  }

  async function saveAddress() {
    if (!token || !zoneId || !recipientName.trim() || !recipientPhone.trim() || !commune.trim()) {
      setMessage('Renseignez le nom, le téléphone et la zone de livraison.');
      return;
    }
    setSaving(true); setMessage('');
    try {
      const address = await checkoutApi.createAddress(token, {
        zoneId, recipientName, recipientPhone, commune, neighborhood: neighborhood || null,
        landmark: landmark || null, latitude: null, longitude: null, isDefault: addresses.length === 0,
      });
      const updated = [address, ...addresses];
      setAddresses(updated); setSelectedId(address.id); setShowForm(false);
      setQuote(await checkoutApi.quote(token, address.id));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) setMessage('Votre session a expiré. Reconnectez-vous.');
      else setMessage(cause instanceof Error ? cause.message : 'Enregistrement de l’adresse impossible.');
    } finally { setSaving(false); }
  }

  function selectZone(zone: DeliveryZone) {
    setZoneId(zone.id);
    setCommune(zone.name);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topline}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retour au panier" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>P</Text></View>
          <Text style={styles.brand}>PULS</Text><Text style={styles.city}>ABIDJAN</Text>
        </View>
        <Text style={styles.eyebrow}>ÉTAPE 1 · LIVRAISON</Text>
        <Text style={styles.title}>Où livrer ?</Text>
        <Text style={styles.subtitle}>Choisissez une adresse ou ajoutez-en une nouvelle pour estimer les frais.</Text>

        {!!message && <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View>}
        {loading ? <View style={styles.state}><ActivityIndicator color={accent} size="large" /></View> : !token ? (
          <View style={styles.state}><Text style={styles.stateTitle}>Connexion requise</Text><Pressable onPress={() => router.replace('/')} style={styles.primary}><Text style={styles.primaryText}>Connexion / inscription</Text></Pressable></View>
        ) : <>
          {!showForm && addresses.length > 0 && <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mes adresses</Text>
            {addresses.map((address) => <Pressable key={address.id} onPress={() => void selectAddress(address.id)} style={[styles.address, selectedId === address.id && styles.addressSelected]}>
              <View style={styles.addressRadio}>{selectedId === address.id && <View style={styles.addressRadioDot} />}</View>
              <View style={styles.addressCopy}><Text style={styles.addressName}>{address.recipientName} · {address.recipientPhone}</Text><Text style={styles.addressDetail}>{address.neighborhood ? `${address.neighborhood}, ` : ''}{address.commune} · {address.zoneName}</Text>{address.landmark ? <Text style={styles.addressDetail}>{address.landmark}</Text> : null}</View>
            </Pressable>)}
            <Pressable onPress={() => { setShowForm(true); setQuote(null); if (!zoneId && zones[0]) { setZoneId(zones[0].id); setCommune(zones[0].name); } }} style={styles.addAddress}><Text style={styles.addAddressText}>＋ Ajouter une adresse</Text></Pressable>
          </View>}

          {showForm && <View style={styles.section}>
            <Text style={styles.sectionTitle}>{addresses.length ? 'Nouvelle adresse' : 'Adresse de livraison'}</Text>
            <Field label="Nom du destinataire" value={recipientName} onChangeText={setRecipientName} placeholder="Ex. Aya Kouassi" />
            <Field label="Téléphone" value={recipientPhone} onChangeText={setRecipientPhone} placeholder="+225 07 00 00 00 00" keyboardType="phone-pad" />
            <Text style={styles.label}>Zone de livraison</Text>
            <View style={styles.zones}>{zones.map((zone) => <Pressable key={zone.id} onPress={() => selectZone(zone)} style={[styles.zone, zoneId === zone.id && styles.zoneSelected]}><Text style={[styles.zoneText, zoneId === zone.id && styles.zoneTextSelected]}>{zone.name}</Text></Pressable>)}</View>
            <Field label="Quartier" value={neighborhood} onChangeText={setNeighborhood} placeholder="Ex. Riviera 2" />
            <Field label="Repère (facultatif)" value={landmark} onChangeText={setLandmark} placeholder="Près de la pharmacie…" />
            <Pressable disabled={saving} onPress={() => void saveAddress()} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Enregistrement…' : 'Enregistrer et calculer'}</Text></Pressable>
            {addresses.length > 0 && <Pressable onPress={() => { setShowForm(false); setQuote(null); }} style={styles.cancel}><Text style={styles.cancelText}>Annuler</Text></Pressable>}
          </View>}

          {quote && <View style={styles.section}>
            <Text style={styles.sectionTitle}>Résumé de la livraison</Text>
            <Row label={`Sous-total · ${quote.itemCount} article(s)`} value={formatXof(quote.subtotalXof)} />
            <Row label={`Livraison · ${quote.deliveryZone}`} value={quote.freeDelivery ? 'Offerte' : formatXof(quote.deliveryFeeXof)} />
            <View style={styles.divider} /><Row label="Total estimé" value={formatXof(quote.totalXof)} total />
            <Text style={styles.hint}>Le montant et le stock seront revérifiés avant la création de la commande.</Text>
            <View style={styles.paymentNotice}><Text style={styles.paymentTitle}>Paiement</Text><Text style={styles.paymentCopy}>Le paiement sécurisé Wave, Orange Money et MTN MoMo sera activé après la connexion du compte marchand Kadev Pay.</Text></View>
          </View>}
        </>}
        <Text style={styles.footer}>PULS · ACHATS LOCAUX À ABIDJAN</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad' }) {
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} placeholderTextColor="#74756e" keyboardType={props.keyboardType} style={styles.input} /></View>;
}

function Row({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return <View style={styles.row}><Text style={total ? styles.totalLabel : styles.rowLabel}>{label}</Text><Text style={total ? styles.totalValue : styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#11130f' }, content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 38, maxWidth: 760, width: '100%', alignSelf: 'center' },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 34 }, back: { width: 35, height: 35, borderRadius: 12, backgroundColor: '#1a1c17', alignItems: 'center', justifyContent: 'center' }, backText: { color: '#f3f3ec', fontSize: 28 },
  brandMark: { width: 32, height: 32, borderRadius: 11, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: '#11130f', fontSize: 21, fontWeight: '900' }, brand: { color: '#f3f3ec', fontWeight: '900', letterSpacing: 3, fontSize: 15 }, city: { color: '#a3a59c', marginLeft: 'auto', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  eyebrow: { color: accent, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 9 }, title: { color: '#f3f3ec', fontSize: 36, fontWeight: '800' }, subtitle: { color: '#a3a59c', fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 20 },
  section: { backgroundColor: '#1a1c17', borderColor: '#30322b', borderWidth: 1, borderRadius: 17, padding: 17, marginBottom: 13 }, sectionTitle: { color: '#f3f3ec', fontSize: 16, fontWeight: '800', marginBottom: 14 }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1c17', borderRadius: 17 }, stateTitle: { color: '#f3f3ec', fontWeight: '700' },
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 12, borderWidth: 1, borderColor: '#383a33', borderRadius: 12, marginBottom: 9 }, addressSelected: { borderColor: accent, backgroundColor: '#23271b' }, addressRadio: { width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 }, addressRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: accent }, addressCopy: { flex: 1 }, addressName: { color: '#f0f1e9', fontSize: 12, fontWeight: '700' }, addressDetail: { color: '#a3a59c', fontSize: 11, marginTop: 4 }, addAddress: { paddingVertical: 10 }, addAddressText: { color: accent, fontSize: 12, fontWeight: '700' },
  field: { marginBottom: 12 }, label: { color: '#d8d9d1', fontSize: 11, fontWeight: '700', marginBottom: 6 }, input: { minHeight: 46, borderWidth: 1, borderColor: '#383a33', backgroundColor: '#131510', borderRadius: 11, paddingHorizontal: 12, color: '#f4f4ed', fontSize: 13 }, zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13, marginTop: 3 }, zone: { borderWidth: 1, borderColor: '#3b3e34', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7 }, zoneSelected: { backgroundColor: accent, borderColor: accent }, zoneText: { color: '#bdc0b4', fontSize: 10 }, zoneTextSelected: { color: '#11130f', fontWeight: '800' },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 12, marginTop: 5 }, primaryText: { color: '#11130f', fontSize: 13, fontWeight: '800' }, disabled: { opacity: 0.55 }, cancel: { alignItems: 'center', paddingTop: 13 }, cancelText: { color: '#a3a59c', fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 }, rowLabel: { color: '#a3a59c', fontSize: 12 }, rowValue: { color: '#e7e9df', fontSize: 12, fontWeight: '700' }, divider: { height: 1, backgroundColor: '#34372e', marginVertical: 8 }, totalLabel: { color: '#f2f3eb', fontSize: 13, fontWeight: '800' }, totalValue: { color: accent, fontSize: 15, fontWeight: '900' }, hint: { color: '#777970', fontSize: 10, lineHeight: 15, marginTop: 9 }, paymentNotice: { borderRadius: 12, backgroundColor: '#23271b', padding: 13, marginTop: 17 }, paymentTitle: { color: '#e9eddc', fontSize: 12, fontWeight: '800' }, paymentCopy: { color: '#aab09d', fontSize: 11, lineHeight: 16, marginTop: 5 },
  notice: { backgroundColor: '#321f1d', borderColor: '#70423b', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 13 }, noticeText: { color: '#ffb6a8', fontSize: 12, lineHeight: 18 }, footer: { color: '#55574f', textAlign: 'center', letterSpacing: 1.2, fontSize: 9, fontWeight: '700', marginTop: 28 },
});
