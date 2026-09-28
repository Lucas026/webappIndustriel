# Documentation technique du graphique

## Objectif

Le graphique « Évolution du procédé » compare la température mesurée, la consigne enregistrée et la valeur de puissance/commande disponible. Les états booléens du chauffage et du ventilateur sont présentés comme du texte dans les indicateurs du tableau de bord, pas comme des courbes.

## Provenance et préparation des données

1. `src/App.tsx` appelle `getMeasurements({ limit: 1000 })` via `src/services/installations.ts`.
2. `mapMeasurement` dans `src/data.ts` convertit chaque ligne Supabase en objet `Reading`, conserve son horodatage et expose les valeurs numériques du graphique.
3. Le tableau de bord filtre les lectures selon la période sélectionnée : 2, 8 ou 24 heures.
4. Recharts utilise l’horodatage pour positionner les points sur l’axe horizontal. Les graduations affichent l’heure, et la date avec l’heure pour la période de 24 heures.

Les dates sont formatées selon la locale française du navigateur. Les lectures restent ordonnées par horodatage; l’identifiant de mesure n’est pas utilisé comme axe temporel.

## Séries et axes

| Série | Champ de mesure | Axe | Présentation |
| --- | --- | --- | --- |
| Température | `temperature` | Gauche, en °C | Aire verte, visible par défaut |
| Consigne | `setpoint` | Gauche, en °C | Ligne grise en tirets, visible par défaut |
| Puissance / commande | `heating_power` | Droite, unité non confirmée | Aire ocre, masquée par défaut |

Ne pas interpréter `heating_power` comme des watts, kilowatts ou un pourcentage tant que son unité et sa sémantique ne sont pas documentées. Les états `heating_state` et `fan_state` sont des booléens et restent affichés dans les cartes textuelles, avec les valeurs « En marche », « À l’arrêt » ou « Inconnu ».

Les valeurs nulles sont transmises aux séries. Les options `connectNulls` actuelles relient les points connus de part et d’autre d’une valeur manquante; cela ne signifie pas que la mesure intermédiaire a été observée.

## Interactions et lisibilité

- La légende est composée de boutons accessibles au clavier. Un clic masque ou réaffiche la série correspondante; `aria-pressed` expose son état.
- « Tout afficher » réactive les trois séries.
- La puissance/commande est masquée au chargement pour éviter de mélanger une échelle non documentée aux courbes principales.
- Le survol affiche un repère vertical et une infobulle avec l’horodatage complet et les valeurs présentes.
- La température et la consigne partagent l’axe gauche. La puissance/commande a son propre axe droit.
- La période du graphique est sélectionnée dans l’en-tête. Les mesures sont alimentées par le polling ou Supabase Realtime configuré par le tableau de bord.

## Fichiers concernés

- `src/App.tsx` : filtrage de période, état de visibilité, composants Recharts, légende et infobulle.
- `src/data.ts` : modèle `Reading` et conversion des lignes de mesure.
- `src/services/installations.ts` : lecture chronologique des mesures depuis Supabase.
- `supabase/schema.sql` : définition des champs de mesure et de leurs types.

## Pistes d’évolution

- Ajouter une sélection de plage personnalisée et un bouton de réinitialisation de période.
- Ajouter des statistiques min./moyenne/max. calculées pour la période, en explicitant leur méthode.
- Signaler visuellement les interruptions de données plutôt que de relier les points connus.
- Ajouter un export CSV de la série filtrée.
- Pour de gros volumes, agréger ou échantillonner les mesures côté serveur au lieu de dépasser la limite de 1 000 lignes.