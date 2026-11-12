# API catalogue (premier incrément)

Les routes sont publiques et préfixées par `/api` derrière Nginx.

## Catégories

`GET /catalog/categories` retourne les catégories (`id`, `name`, `slug`, `parentId`).

## Liste des produits

`GET /catalog/products` retourne les produits publiés dont la boutique est active. Les produits supprimés et les boutiques suspendues ou supprimées ne sont pas exposés.

Paramètres facultatifs :

| Paramètre | Exemple | Règle |
| --- | --- | --- |
| `q` | `robe` | Recherche partielle, insensible à la casse, dans le nom, la description et le nom de boutique |
| `category` | `robes` | Slug de catégorie |
| `shop` | `atelier-adjoua` | Slug de boutique |
| `sort` | `price_asc` | `newest` (défaut), `price_asc`, `price_desc` |
| `page` | `2` | Page à partir de 1 |
| `limit` | `20` | Entre 1 et 50, 20 par défaut |

La réponse contient `items` et `pagination` (`page`, `limit`, `total`, `pages`). Les prix sont des chaînes représentant des FCFA entiers afin d’éviter les pertes de précision JSON sur `bigint` PostgreSQL. Le stock présenté est la quantité disponible (vendable) cumulée dans les emplacements de la boutique.

## Détail d’un produit

`GET /catalog/products/:id` retourne les mêmes informations ainsi que les variantes actives, leur prix, taille, couleur et stock disponible. Les identifiants UUID sont vérifiés avant la requête.

## Limites de cet incrément

La lecture du catalogue est implémentée. La création, modification et publication des produits par les boutiques, ainsi que l’hébergement et la diffusion des images, restent à construire. Le champ `image` expose la clé enregistrée en base; ce n’est pas encore une URL publique d’image.
