# Gestion du catalogue par les boutiques

Toutes les routes de gestion sont derrière `/api` et nécessitent un jeton Bearer. Les routes `/seller/*` exigent le rôle `SHOP_OWNER` et vérifient en base que l’utilisateur connecté possède la boutique liée au produit. Les routes `/admin/*` exigent `ADMIN`.

## Parcours vendeur

1. `GET /seller/shops` liste les boutiques de l’utilisateur.
2. `GET /seller/shops/:shopId/products` retourne les fiches, variantes, stocks et images de sa boutique.
3. `POST /seller/shops/:shopId/products` crée un brouillon avec catégorie, nom, description, prix et au moins une variante. Chaque variante peut préciser son SKU, sa taille, sa couleur, son prix, son stock initial et son poids. Un SKU est généré s’il est omis.
4. `PATCH /seller/products/:productId` modifie le nom, la catégorie, la description, le prix de base, les variantes et leur stock. Une modification d’un produit publié le remet en brouillon afin de repasser par la validation.
5. `PATCH /seller/products/:productId/variants/:variantId/stock` ajuste la quantité disponible et crée un mouvement de stock avec l’auteur et l’écart.
6. `POST /seller/products/:productId/images` reçoit un champ multipart `file`. JPEG, PNG et WebP sont vérifiés par leur signature réelle, limités à 5 Mo chacun, cinq photos au plus par fiche.
7. `DELETE /seller/products/:productId/images/:imageId` supprime une image et choisit une nouvelle image principale si nécessaire.
8. `POST /seller/products/:productId/submit` envoie le brouillon pour validation. La boutique doit être active et le produit doit avoir une variante active et au moins une photo.

Une fiche en attente n’est pas modifiable par la boutique. La modification d’une fiche publiée la retire du catalogue et la remet en brouillon; le vendeur peut alors modifier la fiche et la soumettre à nouveau. Le refus administrateur renvoie également la fiche en brouillon.

## Validation administrateur

- `GET /admin/products` liste les demandes en attente.
- `POST /admin/products/:productId/review` reçoit `{ "approved": true }` pour publier la fiche, ou `{ "approved": false }` pour la renvoyer en brouillon. Chaque demande et décision est inscrite dans `audit_logs`.

## Fichiers et mise en production

En développement, les images sont enregistrées dans `uploads/products`, monté sur le volume du conteneur API, et exposées sous `/api/media/products/...`. Le nom de fichier est généré par le serveur. Pour un déploiement multi-instance, remplacer ce stockage local par un service d’objets (et ses URL signées); le dossier local n’est pas un stockage de production partagé.
