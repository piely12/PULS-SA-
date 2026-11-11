# Authentification de l’API

Préfixe local : `http://localhost:8080/api`.

## Routes

| Méthode | Route | Accès | Corps |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | `{ "email": "client@example.com", "password": "…", "fullName": "…" }` |
| `POST` | `/auth/login` | Public | `{ "email": "client@example.com", "password": "…" }` |
| `POST` | `/auth/refresh` | Public, jeton requis | `{ "refreshToken": "…" }` |
| `POST` | `/auth/logout` | Public, jeton requis | `{ "refreshToken": "…" }` |
| `GET` | `/auth/me` | Bearer access token | — |

Inscription et connexion renvoient `accessToken`, `refreshToken`, `tokenType` et `expiresIn`. L’access token dure 15 minutes ; le refresh token dure 7 jours et est renouvelé à chaque appel à `/auth/refresh`. Seul son hash SHA-256 est stocké en base. La déconnexion révoque le refresh token présenté.

L’inscription attribue toujours le rôle `CUSTOMER`. Le client ne peut pas choisir son rôle dans le corps de la requête. Les autres rôles proviennent des tables `roles` et `user_roles` et doivent être attribués par un flux autorisé.

## Contrôle des rôles dans un contrôleur

Les routes métier peuvent combiner les guards exportés par `AuthModule` :

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Get('admin-only')
```

Erreurs principales : `400` pour un corps invalide, `401` pour des identifiants ou jetons invalides, `403` pour un rôle manquant et `409` si l’adresse e-mail est déjà utilisée.

## Configuration locale

`JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` doivent être deux valeurs distinctes d’au moins 32 caractères. Le fichier `.env.example` ne contient que des remplacements indicatifs ; conserver les secrets réels dans `.env`, qui est ignoré par Git.
