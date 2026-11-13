import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { formatXof, webApi, type AuthSession, type Category, type CurrentUser, type PendingProduct, type ProductVariant, type SellerProduct, type Shop } from './api'
import './App.css'

type DraftVariant = { id?: string; sku: string; size: string; color: string; priceXof: string; quantityAvailable: string; weightG: string }
const blankVariant = (): DraftVariant => ({ sku: '', size: '', color: '', priceXof: '', quantityAvailable: '0', weightG: '' })

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [shopId, setShopId] = useState('')
  const [shop, setShop] = useState<Shop | null>(null)
  const [products, setProducts] = useState<SellerProduct[]>([])
  const [pending, setPending] = useState<PendingProduct[]>([])
  const [editor, setEditor] = useState<SellerProduct | null | false>(false)
  const [search, setSearch] = useState('')

  const isOwner = !!user?.roles.includes('SHOP_OWNER')
  const isAdmin = !!user?.roles.includes('ADMIN')
  const visibleProducts = useMemo(() => products.filter((product) =>
    `${product.name} ${product.categoryName} ${product.status}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [products, search])

  async function loadSellerData(token: string, admin = isAdmin) {
    setBusy(true)
    setError('')
    try {
      if (admin) setPending(await webApi.pendingProducts(token))
      else {
        const [nextShops, nextCategories] = await Promise.all([webApi.shops(token), webApi.categories()])
        setShops(nextShops)
        setCategories(nextCategories)
        setShopId((current) => current || nextShops[0]?.id || '')
      }
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!session || !user || !isOwner || !shopId) return
    let active = true
    void webApi.products(session.accessToken, shopId).then((data) => {
      if (!active) return
      setShop(data.shop)
      setProducts(data.products)
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [session, user, isOwner, shopId])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthBusy(true); setError('')
    try {
      const next = await webApi.login(email.trim(), password)
      const profile = await webApi.me(next.accessToken)
      if (!profile.roles.includes('SHOP_OWNER') && !profile.roles.includes('ADMIN')) throw new Error('Ce compte n’a pas accès à l’espace boutique. Utilisez un compte propriétaire ou administrateur.')
      setSession(next); setUser(profile); setPassword('')
      await loadSellerData(next.accessToken, profile.roles.includes('ADMIN'))
    } catch (cause) { setError(errorText(cause)) }
    finally { setAuthBusy(false) }
  }

  function logout() {
    if (session) void webApi.logout(session.refreshToken).catch(() => undefined)
    setSession(null); setUser(null); setShops([]); setProducts([]); setPending([]); setShop(null); setShopId(''); setError(''); setNotice('')
  }

  async function refreshProducts() {
    if (!session || !shopId) return
    const data = await webApi.products(session.accessToken, shopId)
    setShop(data.shop); setProducts(data.products)
  }

  async function saveProduct(input: Record<string, unknown>, files: File[]) {
    if (!session || !shopId) return
    setBusy(true); setError('')
    let productId: string | null = null
    try {
      if (editor) { await webApi.updateProduct(session.accessToken, editor.id, input); productId = editor.id }
      else { const created = await webApi.createProduct(session.accessToken, shopId, input); productId = created.id }
      setEditor(false)
      const currentImages = editor ? editor.images.length : 0
      for (const file of files.slice(0, Math.max(0, 5 - currentImages))) await webApi.uploadImage(session.accessToken, productId, file)
      setNotice(editor ? 'Modifications enregistrées.' : 'Produit créé comme brouillon.')
    } catch (cause) { setError(errorText(cause)) }
    finally { if (productId) await refreshProducts().catch((cause) => setError(errorText(cause))); setBusy(false) }
  }

  async function uploadImages(product: SellerProduct, files: File[]) {
    if (!session) return
    const remaining = Math.max(0, 5 - product.images.length)
    if (!remaining) { setError('Ce produit a déjà cinq photos.'); return }
    setBusy(true); setError('')
    try { for (const file of files.slice(0, remaining)) await webApi.uploadImage(session.accessToken, product.id, file); setNotice('Photos ajoutées.'); await refreshProducts() }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  async function deleteImage(product: SellerProduct, imageId: string) {
    if (!session) return
    setBusy(true)
    try { await webApi.deleteImage(session.accessToken, product.id, imageId); setNotice('Photo supprimée.'); await refreshProducts() }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  async function updateStock(product: SellerProduct, variant: ProductVariant, quantity: number) {
    if (!session) return
    setBusy(true); setError('')
    try { await webApi.updateStock(session.accessToken, product.id, variant.id, quantity); setNotice('Stock mis à jour et mouvement enregistré.'); await refreshProducts() }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  async function submitForReview(product: SellerProduct) {
    if (!session) return
    setBusy(true); setError('')
    try { await webApi.submitProduct(session.accessToken, product.id); setNotice('Produit envoyé à l’administrateur pour validation.'); await refreshProducts() }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  async function review(product: PendingProduct, approved: boolean) {
    if (!session) return
    setBusy(true); setError('')
    try { await webApi.reviewProduct(session.accessToken, product.id, approved); setPending((items) => items.filter((item) => item.id !== product.id)); setNotice(approved ? 'Produit publié dans le catalogue.' : 'Produit retourné en brouillon.') }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  if (!session || !user) return <main className="login-shell">
    <section className="login-visual"><Brand /><div className="login-copy"><span className="eyebrow">L’ESPACE DES BOUTIQUES</span><h1>Votre catalogue.<br /><em>Votre boutique.</em></h1><p>Gérez vos créations et votre stock sur PULS, le marketplace de mode d’Abidjan.</p></div><span className="login-foot">PULS SA · ABIDJAN</span></section>
    <section className="login-panel"><form className="login-card" onSubmit={login}><span className="eyebrow">BON RETOUR</span><h2>Connectez-vous</h2><p>Accédez à votre espace vendeur ou à la validation des produits.</p>
      <label>E-mail<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner1@puls.demo" /></label>
      <label>Mot de passe<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
      {error && <Alert>{error}</Alert>}<button className="button button-primary wide" disabled={authBusy}>{authBusy ? 'Connexion…' : 'Ouvrir mon espace'} <span>↗</span></button>
      <div className="login-note"><b>Démo locale</b><br />Les comptes vendeurs et administrateur sont ajoutés par le jeu de données de démonstration. Mot de passe : <code>Demo1234</code>.</div>
    </form></section>
  </main>

  return <div className="app-shell">
    <header className="topbar"><Brand /><div className="topbar-right"><span className="status-dot" />{isAdmin ? 'ADMIN PULS' : shop?.name ?? user.email}<span className="topbar-divider" /><button className="logout-button" onClick={logout}>Déconnexion <span>↗</span></button></div></header>
    <main className="dashboard">
      <div className="page-intro"><div><span className="eyebrow">{isAdmin ? 'MODÉRATION DU CATALOGUE' : 'ESPACE BOUTIQUE'}</span><h1>{isAdmin ? 'À valider' : 'Vos produits'}<span className="title-period">.</span></h1><p>{isAdmin ? 'Vérifiez les fiches envoyées par les boutiques.' : 'Créez vos fiches, suivez vos stocks et envoyez vos produits en validation.'}</p></div>
        {isOwner && shops.length > 1 && <select className="shop-select" value={shopId} onChange={(event) => { setBusy(true); setShopId(event.target.value) }}>{shops.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status === 'ACTIVE' ? 'Active' : item.status}</option>)}</select>}
        {isOwner && <button className="button button-primary" onClick={() => setEditor(null)}>＋ Nouveau produit</button>}
      </div>
      {error && <Alert>{error}</Alert>}{notice && <div className="notice" role="status">✓ {notice}<button aria-label="Fermer" onClick={() => setNotice('')}>×</button></div>}
      {isOwner ? !shops.length && !busy ? <div className="empty-panel"><div className="empty-icon">⌂</div><h2>Aucune boutique rattachée</h2><p>Ce compte vendeur n’est lié à aucune boutique.</p></div> : <>
        <div className="stats-grid"><Stat label="PRODUITS" value={products.length} note="Toutes vos fiches" icon="◈" /><Stat label="À VALIDER" value={products.filter((p) => p.status === 'PENDING').length} note="En revue" icon="◷" /><Stat label="EN LIGNE" value={products.filter((p) => p.status === 'PUBLISHED').length} note="Visibles au catalogue" icon="↗" /><Stat label="STOCK DISPONIBLE" value={products.reduce((sum, p) => sum + p.available, 0)} note="Unités vendables" icon="⌑" /></div>
        <section className="catalog-panel"><div className="panel-toolbar"><div><h2>Catalogue boutique</h2><span>{shop?.status === 'ACTIVE' ? 'Boutique active' : shop?.status}</span></div><label className="search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un produit" /></label></div>
          {busy && !products.length ? <div className="loading-line"><span className="spinner" /> Chargement des produits…</div> : visibleProducts.length ? <div className="product-list">{visibleProducts.map((product) => <SellerProductCard key={product.id} product={product} busy={busy} onEdit={() => setEditor(product)} onSubmit={() => submitForReview(product)} onStock={updateStock} onImages={uploadImages} onDeleteImage={deleteImage} />)}</div> : <div className="empty-list"><span>◈</span><b>{search ? 'Aucun résultat' : 'Votre catalogue est encore vide'}</b><p>{search ? 'Essayez un autre terme.' : 'Ajoutez un premier produit pour commencer.'}</p>{!search && <button className="button button-secondary" onClick={() => setEditor(null)}>Créer un produit</button>}</div>}
        </section>
      </> : isAdmin ? <section className="catalog-panel moderation-panel"><div className="panel-toolbar"><div><h2>Demandes de publication</h2><span>{pending.length} fiche{pending.length === 1 ? '' : 's'} en attente</span></div></div>{busy && !pending.length ? <div className="loading-line"><span className="spinner" /> Chargement…</div> : pending.length ? <div className="review-list">{pending.map((product) => <ReviewCard key={product.id} product={product} busy={busy} onReview={review} />)}</div> : <div className="empty-list"><span>✓</span><b>Tout est à jour</b><p>Aucun produit n’attend de validation.</p></div>}</section> : null}
      <footer className="app-footer"><span>PULS SA</span><span>MODE · BOUTIQUES · ABIDJAN</span><span>ESPACE SÉCURISÉ</span></footer>
    </main>
    {editor !== false && <ProductEditor product={editor || undefined} categories={categories} busy={busy} onClose={() => setEditor(false)} onSave={saveProduct} />}
  </div>
}

function ProductEditor(props: { product?: SellerProduct; categories: Category[]; busy: boolean; onClose: () => void; onSave: (input: Record<string, unknown>, files: File[]) => Promise<void> }) {
  const product = props.product
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? props.categories[0]?.id ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [basePriceXof, setBasePriceXof] = useState(product?.basePriceXof ?? '')
  const [variants, setVariants] = useState<DraftVariant[]>(() => product?.variants.map((variant) => ({
    id: variant.id, sku: variant.sku, size: variant.size, color: variant.color,
    priceXof: variant.priceXof, quantityAvailable: String(variant.available), weightG: variant.weightG ? String(variant.weightG) : '',
  })) ?? [blankVariant()])
  const [files, setFiles] = useState<File[]>([])
  function updateVariant(index: number, key: keyof DraftVariant, value: string) { setVariants((items) => items.map((item, i) => i === index ? { ...item, [key]: value } : item)) }
  function chooseFiles(event: ChangeEvent<HTMLInputElement>) { setFiles(Array.from(event.target.files ?? []).slice(0, Math.max(0, 5 - (product?.images.length ?? 0)))) }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const common = { categoryId, name: name.trim(), description: description.trim(), basePriceXof: Number(basePriceXof) }
    const input = { ...common, variants: variants.map((v) => ({ id: v.id, sku: v.sku.trim() || undefined, size: v.size.trim(), color: v.color.trim(), priceXof: Number(v.priceXof), quantityAvailable: Number(v.quantityAvailable), weightG: v.weightG ? Number(v.weightG) : undefined })) }
    void props.onSave(input, files)
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}><form className="editor-modal" onSubmit={submit}>
    <div className="editor-head"><div><span className="eyebrow">{product ? 'MODIFIER LA FICHE' : 'NOUVELLE FICHE'}</span><h2>{product ? 'Modifier le produit' : 'Créer un produit'}</h2></div><button type="button" className="icon-button" onClick={props.onClose}>×</button></div>
    <div className="editor-body"><div className="form-grid">
      <label className="field-wide">Nom du produit<input autoFocus maxLength={120} minLength={2} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Robe en pagne tissé" /></label>
      <label>Catégorie<select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="" disabled>Choisir une catégorie</option>{props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Prix de base (FCFA)<input type="number" min="0" step="1" required value={basePriceXof} onChange={(e) => setBasePriceXof(e.target.value)} placeholder="25000" /></label>
      <label className="field-wide">Description<textarea maxLength={2000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Matière, coupe et détails…" /></label>
    </div>
    <div className="variant-editor"><div className="variant-editor-heading"><div><b>Tailles, couleurs et stock</b><small>Les variantes enregistrées restent liées aux commandes passées.</small></div>{variants.length < 30 && <button type="button" className="text-button" onClick={() => setVariants((items) => [...items, blankVariant()])}>＋ Variante</button>}</div>
      {variants.map((v, i) => <div className="variant-input-row" key={v.id ?? `new-${i}`}><label>SKU<input value={v.sku} onChange={(e) => updateVariant(i, 'sku', e.target.value)} placeholder="Auto" /></label><label>Taille<input value={v.size} onChange={(e) => updateVariant(i, 'size', e.target.value)} placeholder="M" /></label><label>Couleur<input value={v.color} onChange={(e) => updateVariant(i, 'color', e.target.value)} placeholder="Noir" /></label><label>Prix<input type="number" min="0" step="1" required value={v.priceXof} onChange={(e) => updateVariant(i, 'priceXof', e.target.value)} placeholder="25000" /></label><label>Quantité<input type="number" min="0" max="100000" step="1" required value={v.quantityAvailable} onChange={(e) => updateVariant(i, 'quantityAvailable', e.target.value)} /></label><label>Poids (g)<input type="number" min="1" step="1" value={v.weightG} onChange={(e) => updateVariant(i, 'weightG', e.target.value)} placeholder="400" /></label>{!v.id && variants.length > 1 && <button type="button" className="remove-variant" onClick={() => setVariants((items) => items.filter((_, index) => index !== i))}>×</button>}</div>)}
    </div>
    <label className="photo-drop"><span className="photo-icon">▧</span><b>Photos du produit</b><small>JPEG, PNG ou WebP · 5 Mo maximum chacune · jusqu’à cinq photos</small><input accept="image/jpeg,image/png,image/webp" multiple type="file" onChange={chooseFiles} />{files.length > 0 && <span className="selected-files">{files.length} photo{files.length === 1 ? '' : 's'} sélectionnée{files.length === 1 ? '' : 's'}</span>}</label>
    {product && <p className="form-hint">Les fiches en attente ne sont pas modifiables. Modifier un produit publié le retire temporairement du catalogue pour qu’il soit revu avant sa nouvelle publication.</p>}
    </div><div className="editor-footer"><button type="button" className="button button-quiet" onClick={props.onClose}>Annuler</button><button className="button button-primary" disabled={props.busy}>{props.busy ? 'Enregistrement…' : product ? 'Enregistrer' : 'Créer le brouillon'} <span>↗</span></button></div>
  </form></div>
}

function SellerProductCard(props: { product: SellerProduct; busy: boolean; onEdit: () => void; onSubmit: () => void; onStock: (p: SellerProduct, v: ProductVariant, q: number) => void; onImages: (p: SellerProduct, files: File[]) => void; onDeleteImage: (p: SellerProduct, imageId: string) => void }) {
  const p = props.product, imageUrl = webApi.mediaUrl(p.image)
  return <article className="seller-product"><div className="product-visual">{imageUrl ? <img src={imageUrl} alt={p.name} /> : <div className="image-placeholder"><span>{p.name.charAt(0).toUpperCase()}</span><small>PHOTO À AJOUTER</small></div>}</div>
    <div className="product-main"><div className="product-topline"><div><span className="product-category">{p.categoryName}</span><h3>{p.name}</h3></div><StatusBadge status={p.status} /></div>{p.description && <p className="product-description">{p.description}</p>}
      <div className="product-meta"><span>{formatXof(p.basePriceXof)} <small>prix de base</small></span><span>{p.available} <small>unités disponibles</small></span><span>{p.variantCount} <small>variante{p.variantCount === 1 ? '' : 's'}</small></span></div>
      {!!p.variants.length && <div className="variant-list">{p.variants.map((v) => <StockRow key={`${v.id}-${v.available}`} variant={v} disabled={props.busy || p.status === 'PENDING'} onSave={(quantity) => props.onStock(p, v, quantity)} />)}</div>}
      {!!p.images.length && <div className="image-strip">{p.images.map((image) => <div key={image.id} className="image-thumb"><img src={webApi.mediaUrl(image.fileKey) ?? ''} alt="Photo produit" />{image.isPrimary && <span>PRINCIPALE</span>}<button disabled={props.busy || !['DRAFT', 'DISABLED'].includes(p.status)} onClick={() => props.onDeleteImage(p, image.id)} aria-label="Supprimer cette photo">×</button></div>)}</div>}
      <div className="product-actions">{p.status !== 'PENDING' && <button className="button button-secondary small" disabled={props.busy} onClick={props.onEdit}>Modifier</button>}{(p.status === 'DRAFT' || p.status === 'DISABLED') && <label className="button button-secondary small upload-label">＋ Photos<input accept="image/jpeg,image/png,image/webp" multiple type="file" disabled={props.busy || p.images.length >= 5} onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) props.onImages(p, f); e.target.value = '' }} /></label>}{p.status === 'DRAFT' && <button className="button button-primary small" disabled={props.busy || p.images.length === 0 || !p.variants.length} onClick={props.onSubmit} title={p.images.length ? '' : 'Ajoutez une photo avant l’envoi'}>Soumettre pour validation <span>↗</span></button>}{p.status === 'PENDING' && <span className="waiting-note">En attente de validation PULS</span>}{p.status === 'PUBLISHED' && <span className="published-note">Visible dans le catalogue · toute modification repasse en brouillon</span>}</div>
      {p.status === 'DRAFT' && p.images.length === 0 && <p className="photo-required">Ajoutez une photo avant de demander la publication.</p>}
    </div></article>
}

function StockRow(props: { variant: ProductVariant; disabled: boolean; onSave: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(String(props.variant.available))
  const label = [props.variant.size, props.variant.color].filter(Boolean).join(' · ') || 'Standard'
  return <div className="stock-row"><span className="stock-variant">{label}</span><span className="stock-sku">{props.variant.sku}</span><span className="stock-price">{formatXof(props.variant.priceXof)}</span><label>Dispo.<input type="number" min="0" max="100000" step="1" disabled={props.disabled} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label><button disabled={props.disabled || quantity === String(props.variant.available) || !/^\d+$/.test(quantity)} onClick={() => props.onSave(Number(quantity))}>Ajuster</button></div>
}

function ReviewCard(props: { product: PendingProduct; busy: boolean; onReview: (p: PendingProduct, approved: boolean) => void }) {
  const p = props.product, image = webApi.mediaUrl(p.image)
  return <article className="review-card"><div className="review-image">{image ? <img src={image} alt={p.name} /> : <span>{p.name.charAt(0)}</span>}</div><div className="review-info"><span className="product-category">{p.shopName} · {p.categoryName}</span><h3>{p.name}</h3><p>{p.description || 'Aucune description.'}</p><b>{formatXof(p.basePriceXof)}</b></div><div className="review-actions"><button className="button button-secondary small" disabled={props.busy} onClick={() => props.onReview(p, false)}>Retourner au vendeur</button><button className="button button-primary small" disabled={props.busy} onClick={() => props.onReview(p, true)}>Approuver et publier <span>↗</span></button></div></article>
}

function Brand() { return <a className="brand" href="/"><span className="brand-symbol">P</span><span>PULS<small>SA</small></span></a> }
function Stat(props: { label: string; value: number; note: string; icon: string }) { return <div className="stat-card"><div className="stat-top"><span>{props.label}</span><i>{props.icon}</i></div><strong>{props.value.toLocaleString('fr-FR')}</strong><small>{props.note}</small></div> }
function StatusBadge({ status }: { status: SellerProduct['status'] }) { const labels: Record<SellerProduct['status'], string> = { DRAFT: 'Brouillon', PENDING: 'En validation', PUBLISHED: 'Publié', DISABLED: 'À corriger' }; return <span className={`status-badge status-${status.toLowerCase()}`}><i />{labels[status]}</span> }
function Alert({ children }: { children: string }) { return <div className="alert" role="alert"><span>!</span>{children}</div> }
function errorText(cause: unknown) { return cause instanceof Error ? cause.message : 'Une erreur est survenue. Réessayez.' }

export default App
