# Supabase — lecture et consigne cible

L’application lit les enregistrements de `public.measurements`, selon le schéma partagé : `id`, `timestamp`, `temperature`, `setpoint`, `heating_power`, `heating_state`, `fan_state`, `pid_output`, `operating_mode`, `alarm_code` et `cycle_number`.

## Champs du formulaire « Ajouter une mesure »

- Température mesurée (`temperature`) : degrés Celsius.
- Consigne de chauffe (`setpoint`) : cible en degrés Celsius.
- Puissance/commande chauffage (`heating_power`) : unité non définie dans le schéma ; ne pas interpréter en watts/kW avant confirmation.
- Chauffage actif (`heating_state`) et ventilateur actif (`fan_state`) : états vrai/faux.
- Sortie régulateur PID (`pid_output`) : valeur numérique, échelle à confirmer.
- Mode (`operating_mode`) et code défaut (`alarm_code`) : textes de 50 caractères maximum.
- Numéro de cycle (`cycle_number`) : entier.

L’horodatage est généré par défaut par Supabase ; `id` est auto-incrémenté.

## Lecture des mesures

1. Configurer `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env.local`.
2. Accorder à la clé publique une politique `SELECT` sur `measurements`. Le schéma fourni crée la lecture de `control_settings` pour `anon` et `authenticated` ; l’écriture est réservée aux sessions authentifiées.
3. Lancer `npm run dev`.

Le menu « Lecture » choisit un polling de 2, 5, 10, 30 ou 60 secondes, ou le mode manuel. Le réglage est mémorisé dans le navigateur. Le bouton d’actualisation force une lecture ponctuelle. Le toggle « Direct » active les notifications Supabase Realtime ; le polling reste une solution de repli. Pour la lecture en direct, `supabase/schema.sql` ajoute `measurements` à la publication `supabase_realtime` ; vérifier que Realtime est activé pour la table dans les paramètres Supabase. Le dashboard et la page Historique affichent les mesures réelles. L’historique récupère les 1 000 dernières lignes.

## Écriture de la consigne cible

`supabase/schema.sql` crée aussi `control_settings`, distincte de `measurements` afin de ne pas modifier l’historique des capteurs. La page Maintenance permet à un utilisateur connecté par Supabase Auth de lire et d’enregistrer une consigne cible unique. Les écritures sont limitées aux rôles `authenticated` et la politique lie l’utilisateur à `updated_by`.

Après toute migration de schéma, exécuter `supabase/schema.sql` dans l’éditeur SQL. Créer un utilisateur de test dans Supabase Auth pour essayer l’écriture. Le mode non connecté peut lire la consigne selon la politique `SELECT`, mais ne peut pas la modifier.

**L’enregistrement de la consigne n’envoie pas de commande au chauffage.** Le backend ou le PLC doit encore lire `control_settings`, valider cette cible avec ses limites de sécurité et appliquer la commande. Ne pas écrire des consignes directement dans `measurements` : cette table représente les relevés du banc.

`heating_power` ne possède pas d’unité précisée ; il est donc présenté sans interprétation énergétique. `alarm_code` représente les codes défaut dans l’historique des mesures ; le schéma ne contient pas de table d’alarmes dédiée.
