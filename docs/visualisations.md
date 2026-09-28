# Référence des visualisations

Cette page décrit ce que les indicateurs et tableaux signifient, comment leurs valeurs sont calculées et les précautions d’interprétation. La documentation spécifique du graphique est dans [graphique.md](graphique.md).

## Tableau de bord

Les cartes d’indicateurs utilisent le dernier relevé récupéré, sauf le dépassement maximal qui est calculé sur la période choisie pour le graphique.

| Indicateur | Source et calcul | Interprétation |
| --- | --- | --- |
| Température actuelle | `temperature` du dernier relevé, arrondie à 0,1 °C pour l’affichage. | `—` signifie qu’aucune valeur n’est disponible. |
| Écart à la consigne | Température du dernier relevé moins `measurements.setpoint`, en °C. | Positif : température supérieure à la consigne du relevé; négatif : inférieure. Ce n’est pas comparé à `control_settings.setpoint`. |
| Chauffage | `heating_state` du dernier relevé. | Booléen rendu en « En marche », « À l’arrêt » ou « Inconnu ». Le détail de commande n’affiche pas d’unité confirmée. |
| Ventilateur | `fan_state` du dernier relevé. | Booléen rendu en texte, pas en courbe. |
| Dépassement maximal | Maximum de `temperature - setpoint` parmi les relevés de la période, borné au minimum à zéro. | `0,0 °C` signifie absence de dépassement positif calculé; faute de données valides, le code affiche aussi zéro. |

## Maintenance et signaux à vérifier

- Le temps de marche du chauffage est estimé en additionnant les intervalles entre deux relevés consécutifs dont l’état chauffage vaut vrai. Les intervalles supérieurs à deux fois l’intervalle médian d’échantillonnage sont exclus pour limiter l’effet des trous de télémétrie. Les transitions entre relevés ne sont pas connues précisément.
- Le nombre de cycles compte les valeurs `cycle_number` distinctes présentes dans la période.
- Pour le dernier cycle chargé, le temps d’atteinte correspond au temps entre le premier relevé exploitable du cycle et le premier relevé où `temperature >= setpoint - 1 °C`. Le calcul utilise les mesures chargées même si le cycle a commencé avant la période affichée.
- La stabilisation est estimée au premier groupe de trois relevés consécutifs dont la température reste dans une bande de ±1 °C autour de la consigne correspondante. Cela dépend de la cadence réelle des mesures et ne constitue pas un critère de conformité thermique.
- Le panneau « Signaux à vérifier » compte les codes d’alarme non vides sur la période sélectionnée. Il ajoute un signal si le dépassement maximal dépasse 1 °C. Ce seuil est une règle indicative choisie pour l’application, pas une limite de sécurité définie par le constructeur.
- Le rapport « Analyser avec IA » est pour l’instant une synthèse locale fondée sur ces règles et les dernières valeurs. Aucun service IA distant n’est branché.

### Périodes

Le graphique propose 2, 8 et 24 heures. L’application récupère au plus 1 000 lignes et filtre ces lectures côté client selon leur horodatage. Si l’installation émet beaucoup de mesures, la limite peut empêcher de couvrir entièrement 24 heures.

## Graphique « Évolution du procédé »

| Courbe | Champ | Axe | État initial |
| --- | --- | --- | --- |
| Température | `temperature` | Gauche, °C | Visible |
| Consigne du relevé | `measurements.setpoint` | Gauche, °C | Visible |
| Puissance / commande | `heating_power` | Droite, unité inconnue | Masquée |

Les états du chauffage et du ventilateur ne sont **pas** dessinés sur ce graphique. Ils restent des états textuels dans les cartes. Cliquer sur la légende masque/affiche une courbe; « Tout afficher » restaure toutes les courbes. Le survol affiche un curseur vertical, l’horodatage complet et les valeurs disponibles.

L’axe temporel suit les dates de mesure et les présente dans la locale française du navigateur. La vue 24 heures ajoute jour et mois aux graduations. La zone sous la température sert de repère visuel; elle ne représente pas une intégrale ni une énergie.

### Limites de lecture

- `heating_power` dispose d’un axe séparé afin de ne pas confondre son échelle avec les °C. Son unité est inconnue : ne pas la convertir en énergie ou en pourcentage.
- Les points manquants sont actuellement reliés pour les trois séries (`connectNulls`). Une ligne continue ne garantit donc pas qu’une mesure existe à chaque instant.
- Les courbes se basent sur les données récupérées; la sélection de période n’interroge pas Supabase à nouveau.
- L’état visible en carte correspond au dernier relevé récupéré, pas à une commande temps réel du chauffage.

## Historique des mesures

L’onglet **Mesures** présente les colonnes du relevé : date, température, consigne du relevé, valeur brute de puissance, états du chauffage et ventilateur, sortie PID, mode et cycle. `—` signifie une valeur nulle. Les nombres sont affichés avec deux décimales dans le tableau.

La table est chronologique; le compteur indique le nombre de lignes chargées (maximum 1 000), pas le nombre total de lignes en base. **Exporter** appelle `window.print()` : l’impression ou l’enregistrement PDF dépend du navigateur et de ses styles d’impression. Aucun fichier CSV n’est construit.

## Historique des alarmes et activité récente

Un relevé apparaît dans **Alarmes** s’il contient un `alarm_code` non vide. La carte « Activité récente » en montre au plus trois.

La classe visuelle de l’alarme utilise une heuristique textuelle : les codes contenant `high`, `over` ou `fault` sont classés comme avertissement; les autres comme information. Ce classement n’est pas un niveau de gravité défini par le schéma industriel et ne doit pas remplacer une table de codes d’alarme documentée.

## Résumé de fonctionnement

- « Mesures avec chauffage actif » compte les lignes de la période filtrée dont `heating_state` vaut vrai.
- « Cycles distincts » compte les valeurs `cycle_number` non nulles et distinctes dans cette même période.
- « Mesures avec code alarme » compte les alarmes de la période sélectionnée. La liste « Activité récente » peut inclure des alarmes plus anciennes parmi les relevés chargés.
- Les valeurs dépendent de la période choisie (2, 8 ou 24 heures); ce ne sont pas nécessairement des agrégats du jour civil.
- L’énergie consommée est volontairement indiquée comme indisponible, car l’unité de `heating_power` n’est pas confirmée.