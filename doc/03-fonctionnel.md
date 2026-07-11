# Documentation fonctionnelle de Skbox

Version documentée : **1.0.0**

Skbox est une box domotique personnelle : elle centralise le pilotage et la supervision des appareils connectés du domicile (Zigbee, RF433, MQTT), avec un moteur de scénarios/alarmes et des modules dédiés à quelques usages spécifiques (météo, chaudière, caméras, réseau).

## 1. Dashboard

Page d'accueil : vue d'ensemble de l'état de la maison en un coup d'œil (dernières valeurs des devices suivis, accès rapide aux modules et scénarios).

## 2. Appareils

Registre central de tous les équipements connectés (Zigbee, RF433, MQTT), quel que soit leur protocole d'origine :

- Vue liste avec tri (les devices sans pièce/objet assigné sont poussés en fin de liste alphabétique), filtrage.
- Fiche par appareil : état courant, envoi de commandes, historique des valeurs.
- Organisation : rattachement à une **pièce**, à un **objet parent** (ex. regrouper les boutons d'un interrupteur multi-canaux), et à des **thèmes** (tags transverses, ex. "Extérieur", "Sécurité").
- Réglages fins par device : préférences d'affichage, configuration des champs suivis en historique, décalage de calibration pour les capteurs de température/humidité, mode "changement de pile" (pause temporaire des alertes offline pendant une intervention).
- Fusion de deux fiches device (utile après un ré-appairage qui recrée un device dupliqué).
- Suppression de l'historique d'un device : suppression sécurisée (saisie de "OUI" requise), car destructrice et non récupérable.

## 3. Scénarios

Moteur d'automatisation "si condition(s) alors action(s)" :

- Un scénario a un **déclencheur** (ex. changement d'état d'un device), une ou plusieurs **conditions** combinables en **ET/OU**, et une ou plusieurs **actions**.
- Deux catégories : **automatisation** classique, ou **alarme** — les scénarios d'alarme journalisent chaque déclenchement (`AlarmEvent`) avec un niveau de sévérité, et nécessitent un acquittement manuel (visible via la cloche d'alarme dans la barre de navigation).
- Test manuel d'un scénario sans attendre le déclencheur réel.
- Regroupement de scénarios apparentés sous un **groupe nommé** (repliable dans l'UI), configurable dans Réglages → Paramètres → Groupes de scénarios.

## 4. Modules

Fonctionnalités métier spécifiques, regroupées sous l'onglet "Modules" :

### Alarmes
Vue dédiée aux scénarios de catégorie "alarme" : historique des déclenchements, acquittement.

### Chaudière
Pilotage et supervision du chauffage : niveaux de consommation, statut courant, activation/désactivation, **mode boost** temporaire (ex. forcer un pic de chauffe ponctuel).

### Caméras
Gestion des caméras IP (ONVIF et Reolink) : flux vidéo, snapshot à la demande, contrôle PTZ (pan/tilt/zoom) avec préréglages de position, réglages d'image (luminosité/contraste/saturation/netteté) sauvegardables en **profils d'imagerie** nommés (ex. "Jour" / "Nuit"). La vignette caméra coupe son flux vidéo tant que la vue agrandie n'est pas ouverte, pour économiser bande passante et CPU.

### Historique
Consultation de l'historique des valeurs des devices sous forme de graphiques/tableaux, avec des **modèles nommés** de vues réutilisables (ensemble de panneaux prédéfinis) pour ne pas reconfigurer l'affichage à chaque consultation.

### Santé réseau
État du maillage Zigbee (scan à la demande du réseau) pour diagnostiquer les problèmes de portée/répéteurs.

### Météo
Conditions actuelles et prévisions pour le domicile, avec l'heure de dernière mise à jour affichée, basées sur une localisation configurable (recherche de ville, coordonnées).

## 5. Réglages

### Système
Tableau de bord de santé de la machine hôte : CPU, mémoire, disque, températures et vitesse ventilateur, santé SMART du disque, état des conteneurs Docker (si utilisés), état de chaque service (API, Web, bridges Zigbee/RFXcom, Mosquitto, mbpfan, thermald, fstrim), état des bridges Zigbee/RFXcom avec redémarrage manuel possible, statut Tailscale (VPN) avec démarrage/arrêt, et état du **coupe-circuit thermique** de sécurité (seuil configuré, dernier relevé de température, activation/désactivation du timer).

### Appairage
Interface d'appairage des nouveaux appareils Zigbee (permit-join).

### Sauvegarde
Sauvegarde et restauration de la base de données : configuration de la fréquence, lancement manuel, liste des sauvegardes existantes avec téléchargement ou suppression.

### Logs MQTT
Visualisation en direct des derniers messages transités sur le bus MQTT — utile pour diagnostiquer un appareil qui ne remonte pas d'état.

### Préférences
Réglages généraux de l'application (notifications, comportements par défaut).

### Outils
Utilitaires divers d'administration : optimisation des historiques (suppression des entrées redondantes), et lancement à la demande de la suite de tests unitaires (moteur chaudière/scénarios) directement depuis le serveur, avec résumé et détail complet du résultat.

### Paramètres (listes de référence)
Gestion des référentiels transverses utilisés partout ailleurs dans l'app, chacun en CRUD dédié (liste + création/modification/suppression) :
- **Pièces** — les pièces du domicile.
- **Objets** — regroupements hiérarchiques de devices.
- **Thèmes** — tags transverses appliqués aux devices.
- **Groupes de scénarios** — regroupements nommés de scénarios.

## 6. Notifications

Envoi d'alertes vers l'extérieur via **Telegram** et **email (SMTP)**, avec un mode test pour vérifier la configuration sans attendre un déclenchement réel — typiquement utilisé par les scénarios d'alarme.

## 7. Conventions transverses

- **Suppression** : par défaut une confirmation légère (message + bouton Oui/Non) suffit pour supprimer un objet ou un enregistrement (scénario, pièce, thème...). Une confirmation renforcée (saisie du mot "OUI") n'est utilisée que pour les actions destructrices difficiles à annuler (ex. vider tout l'historique d'un appareil).
- **Disponibilité des appareils Zigbee** : le statut en ligne/hors ligne provient du ping de disponibilité natif de Zigbee2MQTT (timeout 5 min), pas seulement du dernier message d'état reçu — un appareil qui ne répond plus est donc détecté hors ligne même si le pont Zigbee2MQTT reste connecté.
