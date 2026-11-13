# PULS SA

Marketplace de mode multi-boutiques avec logistique à Abidjan. Le dépôt est organisé en monorepo :

- `apps/mobile` : application client Expo avec Expo Router et TypeScript.
- `apps/web` : portail web React + Vite (les portails boutique, logistique et administration seront construits ici).
- `apps/api` : API NestJS en TypeScript.
- `infra` : Nginx et scripts SQL PostgreSQL.
- `docs` : décisions de données et documentation du projet.

## Prérequis

- Node.js 24 et npm (API/web), pnpm 11 (mobile).
- Docker Desktop avec Docker Compose.
- Expo Go ou un émulateur Android pour lancer l'application mobile.

## Démarrage local

Si `.env` n'existe pas encore, le créer depuis `.env.example`, puis vérifier les secrets de développement avant de démarrer les services :

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build
```

L'API est accessible via Nginx sur `http://localhost:8080/api/health`.

Lancer les applications dans des terminaux séparés :

```powershell
npm ci --prefix apps/api
npm run start:dev --prefix apps/api
```

```powershell
npm ci --prefix apps/web
npm run dev --prefix apps/web
```

```powershell
pnpm --dir apps/mobile install
pnpm --dir apps/mobile start
```

## Base de données

Au premier démarrage, les scripts de `infra/postgres/init` sont exécutés dans l'ordre : types, tables, fonctions et triggers, vues, données de référence.
Les données de démonstration se trouvent dans `infra/postgres/seed/demo_data.sql`.

Après le premier démarrage, charger le jeu de démonstration avec PowerShell :

```powershell
docker compose cp infra/postgres/seed/demo_data.sql db:/tmp/demo_data.sql
docker compose exec db psql -U puls -d puls -v ON_ERROR_STOP=1 -f /tmp/demo_data.sql
```

Le portail vendeur est disponible dans `apps/web` (`npm run dev --prefix apps/web`). Sa configuration API par défaut cible `http://localhost:8080/api`; l’origine Vite `http://localhost:5173` est autorisée par défaut et peut être changée avec `WEB_ORIGINS`. Les images téléversées sont conservées dans `uploads/`.

Pour la démonstration, les comptes `owner1@puls.demo` à `owner5@puls.demo` donnent accès aux boutiques de test, avec le mot de passe `Demo1234`. Le compte `admin@puls.demo` peut examiner les demandes de publication. Ces comptes ne sont créés qu’après le chargement du jeu de démonstration.

## Décisions de cadrage

Les arbitrages MLD consignés sont dans [`docs/decisions-donnees.md`](docs/decisions-donnees.md). Les références MLD5, MLD7 et MLD8 ne sont pas définies dans l'annexe du cahier des charges fournie.

Le calendrier de réalisation est celui de la feuille de route PULS SA du 5 novembre 2026 au 10 janvier 2027. Le cahier des charges décrit encore une estimation initiale de 14 semaines ; son chapitre 11 doit être aligné après validation du calendrier raccourci.

Les routes d’authentification, la durée des jetons et l’usage des rôles sont décrits dans [`docs/authentification.md`](docs/authentification.md).
Les routes publiques du catalogue sont décrites dans [`docs/catalogue.md`](docs/catalogue.md).
Le portail vendeur, les statuts de validation et les routes d’administration sont décrits dans [`docs/gestion-boutique.md`](docs/gestion-boutique.md).
# PULS-SA-
