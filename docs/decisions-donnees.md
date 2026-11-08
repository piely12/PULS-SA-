# Décisions de données (S0) : à figer avant le script SQL

Source : cahier des charges, annexe des arbitrages (MLD1, MLD2, MLD3, MLD4, MLD6, MLD9 ; les numéros 5, 7 et 8 n'y figurent pas).
La colonne « Proposition » reprend celle du cahier ; la colonne « Décision » est à remplir par vous.

| Réf. | Point | Proposition du cahier | Décision | Date |
| --- | --- | --- | --- | --- |
| MLD1 | Utilisateurs par boutique | shops.owner_id en MVP (table shop_members en version 2) | Validé | 05/11/2026 |
| MLD2 | Suppression de products.brand_id | À accepter (marque lue via la vue v_products_with_brand) | Validé | 05/11/2026 |
| MLD3 | Sens de quantity_available | Quantité vendable ; stock physique = disponible + réservé | Validé | 05/11/2026 |
| MLD4 | Statuts | Types ENUM en MVP, transitions contrôlées par une table de transitions | Validé | 05/11/2026 |
| MLD6 | Création de la commande | En attente de paiement, avec ses réservations, avant l'appel au prestataire | Validé | 05/11/2026 |
| MLD9 | Commission sur article remboursé | Le net est réduit, commission non recalculée sur la part remboursée, à confirmer | **Option A** : commission de la ligne remboursée annulée, net de la ligne = 0 | 05/11/2026 |

## Précision MLD9 (tranchée : option A)
Exemple : ligne de 10 000 FCFA, taux de 15 %, commission 1 500, net boutique 8 500.
- Option A (recommandée) : la ligne est remboursée, la commission sur cette ligne est annulée, net de la ligne = 0.
- Option B : la ligne est remboursée, PULS conserve la commission de 1 500 : à éviter, la boutique paierait une commission sans vente.
