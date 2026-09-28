# Guide utilisateur

## Présentation

Le Centre de contrôle industriel permet de consulter les mesures d’un banc de chauffage, de parcourir leur historique et, avec une session Supabase, d’ajouter des relevés ou d’enregistrer une consigne cible.

> La consigne cible est enregistrée dans la base. Elle ne commande pas directement le chauffage : un backend ou un automate doit encore la lire et l’appliquer avec ses propres limites de sécurité.

## Démarrer l’application

1. Demander à l’administrateur du projet l’URL Supabase et la clé publique du projet.
2. Les configurer dans le fichier local `.env.local` sous `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. Dans un terminal, lancer `npm install`, puis `npm run dev`.
4. Ouvrir l’adresse locale affichée par Vite.

Ne jamais ajouter une clé `service_role` ou une clé secrète dans une variable `VITE_`, dans le navigateur ou dans un dépôt Git.

## Navigation

- **Vue d’ensemble** : dernières valeurs, indicateurs de fonctionnement, graphique, activité récente.
- **Historique** : tableau des mesures ou liste des alarmes enregistrées.
- **Maintenance** : connexion Supabase, consigne cible et formulaire d’ajout d’un relevé.

## Suivre l’installation

Dans la barre supérieure :

- **Lecture** règle la fréquence de récupération : manuelle, 2, 5, 10, 30 ou 60 secondes, ou intervalle personnalisé de 1 à 3 600 secondes.
- **Direct** active ou désactive l’écoute Supabase Realtime. Le polling choisi dans « Lecture » reste actif séparément.
- **Lire maintenant** déclenche une récupération ponctuelle.
- L’indicateur à côté de l’heure indique le chargement, une erreur, ou l’heure de la dernière lecture.

Sur le graphique, choisir une période de 2, 8 ou 24 heures. Cliquer sur un bouton de légende masque ou réaffiche une série. « Tout afficher » restaure les trois séries.

## Se connecter

Dans **Maintenance**, entrer l’adresse courriel et le mot de passe d’un utilisateur créé dans **le même projet Supabase** que celui configuré dans `.env.local`. Si la confirmation d’adresse est activée, confirmer l’utilisateur dans Supabase avant de se connecter. Le bouton de déconnexion apparaît une fois la session établie.

Avec les politiques de `supabase/schema.sql`, une session Supabase est nécessaire pour lire les mesures et pour écrire dans la base. La consigne cible peut être lue sans session, mais sa modification nécessite une connexion. Le compte n’a pas besoin d’un rôle Supabase `admin` pour les politiques actuelles : celles-ci autorisent les utilisateurs `authenticated`.

## Enregistrer une consigne cible

1. Se connecter dans la page Maintenance.
2. Dans **Consigne cible**, entrer une valeur entre 0 et 999,99 °C, avec au plus deux décimales.
3. Cliquer sur **Enregistrer la consigne**.
4. Vérifier le message de confirmation et la valeur affichée.

La valeur est stockée comme consigne courante dans `control_settings`. Elle est distincte de la consigne inscrite dans chaque relevé de `measurements`. Elle ne modifie aucun relevé existant et ne commande pas directement l’installation.

## Ajouter un relevé

1. Se connecter dans la page Maintenance.
2. Remplir les valeurs disponibles; laisser vides les champs inconnus.
3. Choisir l’état du chauffage et du ventilateur, ou « Inconnu ».
4. Cliquer sur **Ajouter la mesure**. Au moins une valeur doit être renseignée; l’horodatage est ajouté par Supabase.

`heating_power` n’a pas d’unité confirmée et la sortie PID n’a pas d’échelle documentée. Ne pas interpréter ces valeurs comme des watts, kilowatts ou pourcentages sans confirmation technique.

## Indicateurs de maintenance et analyse

Le résumé indique les relevés de chauffage actif, les cycles distincts, les codes d’alarme et un temps de marche estimé à partir des relevés consécutifs. Le temps d’atteinte et la stabilisation sont calculés pour le dernier cycle disponible : atteinte à partir de `consigne - 1 °C`, stabilisation après trois relevés consécutifs à ±1 °C. Ces estimations dépendent de la cadence et de la qualité des données.

Le panneau **Signaux à vérifier** reprend les codes d’alarme et signale un dépassement supérieur à 1 °C. Ce seuil n’est pas une limite de sécurité constructeur. Le bouton **Analyser avec IA** ouvre actuellement un rapport fondé sur des règles locales; aucun service IA n’est raccordé.

## Consulter et imprimer l’historique

Dans **Historique**, l’onglet **Mesures** présente jusqu’aux 1 000 derniers relevés disponibles; l’onglet **Alarmes** filtre les relevés qui possèdent un code d’alarme. Le bouton **Exporter** ouvre la fonction d’impression du navigateur. Choisir une imprimante ou « Enregistrer au format PDF » pour créer un fichier PDF; ce bouton ne génère pas de CSV.

## Dépannage

- **Identifiants invalides** : vérifier l’adresse, le mot de passe et le projet Supabase utilisé.
- **Adresse non confirmée** : confirmer le compte dans Supabase Auth, puis réessayer.
- **Connexion impossible** : vérifier `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et l’accès réseau.
- **Connexion réussie, écriture refusée** : vérifier que `supabase/schema.sql` a été exécuté dans le même projet et que les politiques/grants sont présents.
- **Aucune donnée** : vérifier que `public.measurements` contient des lignes et que la politique de lecture autorise le rôle utilisé.
- **Realtime non connecté** : le polling peut continuer à fonctionner; vérifier l’activation de Realtime pour les tables dans Supabase.

Pour diagnostiquer une erreur, transmettre son texte sans partager de mot de passe, de jeton ou de clé secrète.