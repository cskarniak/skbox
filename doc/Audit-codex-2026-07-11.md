# Audit Codex — Skbox

**Date : 11 juillet 2026**  
**Périmètre :** revue statique du dépôt, documentation, configuration de déploiement et vérifications locales (`pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm audit --prod`). Aucun service de production, dongle ni sauvegarde n'a été modifié.

## Synthèse

Skbox a une base saine et adaptée à son objectif : un monorepo volontairement simple, des responsabilités bien séparées (API, interface, persistance, contrats partagés) et un usage pertinent de MQTT pour découpler les radios. Les protections de fonctionnement sont déjà plus mûres que la moyenne d'un projet personnel : watchdogs, journal d'événements, thermiques, sauvegardes, anti-cycles de chaudière et reprise des services par systemd.

La priorité n'est pas de réarchitecturer. Il faut surtout fiabiliser les opérations à risque et introduire un filet de tests. Le point le plus important est la restauration : dans son état actuel, elle arrête les services mais ne les redémarre pas. Pour la chaudière et les automatisations, l'absence de tests de non-régression est le deuxième risque majeur.

| Niveau | Nombre | À traiter en premier |
|---|---:|---|
| P0 — continuité de service | 1 | Restauration qui laisse la box arrêtée |
| P1 — fiabilité / sécurité de fonctionnement | 6 | tests, scénarios concurrents, pilotage chaudière, données et dépendances |
| P2 — maintenabilité / performance | 7 | découpage front, requêtes, observabilité et déploiement |

## Points solides

- Architecture lisible : `apps/api`, `apps/web`, `packages/db` et `packages/shared` constituent une séparation simple et justifiée. Les contrats Zod partagés évitent une partie importante des divergences API/UI.
- MQTT est correctement centralisé dans `MqttService`. Le démarrage différé des abonnements après l'initialisation Nest évite de perdre les messages retained au boot.
- Les bridges Zigbee et RF433 ont une surveillance, une mise hors ligne des appareils, une temporisation des relances automatiques et un journal de service.
- La chaudière incorpore hystérésis, temps minimum ON/OFF, arrêt d'urgence, validation des créneaux et pause quand la sonde est indisponible. C'est une bonne base de sûreté fonctionnelle.
- Les accès système sont en grande partie à commandes fixes et le fichier sudoers est restrictif. Les noms de sauvegardes sont validés par expression régulière avant suppression, téléchargement ou restauration.
- Les index SQLite utiles à l'historique (`DeviceEvent(deviceId, timestamp)`) sont présents ; la réduction de bruit et l'échantillonnage sont des choix pertinents pour contenir l'historique.
- Les vérifications de compilation passent : `pnpm typecheck` et `pnpm build` sont verts. Le build Next produit 24 routes statiques sans erreur.

## Constats prioritaires

### P0 — restauration : arrêt durable des services

**Constat.** `restore.sh` arrête `skbox-api`, `skbox-web`, `skbox-z2m` et `skbox-rfxcom`, restaure les fichiers, puis termine en demandant manuellement de relancer les services. L'appel depuis l'API est détaché (`BackupService.restore`) parce que l'API s'arrête elle-même ; il n'existe donc aucun mécanisme de reprise ultérieur.

**Impact.** Une restauration depuis l'interface laisse la supervision, les scénarios et potentiellement le pilotage de chauffage à l'arrêt jusqu'à une intervention humaine. C'est le risque de disponibilité le plus direct du projet.

**Recommandation.** Dans `restore.sh`, utiliser un `trap` de reprise après l'arrêt réussi, redémarrer explicitement les services en fin de script (y compris en cas d'échec après l'arrêt) et écrire un statut atomique dans un journal dédié. Ajouter dans l'UI un avertissement clair sur l'indisponibilité et, au redémarrage, un contrôle de santé/retour utilisateur. Tester une restauration sur copie ou sur une machine de validation.

### P1 — aucun test automatisé ; la commande lint est cassée

**Constat.** Le dépôt ne contient aucun fichier `*.spec.*` ou `*.test.*`. `pnpm lint` échoue : aucun workspace ne définit de script `lint`. Le typage et le build ne vérifient ni les règles de chaudière, ni le moteur de scénarios, ni le protocole MQTT, ni les scripts de sauvegarde.

**Impact.** Les zones à effet physique ou irréversible peuvent régresser sans signal : modification de l'hystérésis, exécution d'alarme, suppression/fusion d'appareil, restauration ou calcul de créneau horaire.

**Recommandation.** Mettre en place Vitest/Jest et ESLint, puis rendre `typecheck`, `lint`, les tests unitaires et un build obligatoires en CI. Commencer par des tests de table pour :

- `BoilerService` : hystérésis, anti-cycle, sonde absente, créneaux chevauchant minuit, boost expiré ;
- `ScenariosService` : ET/OU, déclenchement/résolution d'alarme, cron et non-régression sur événements rapprochés ;
- `history-change.util`, calibration, noms de sauvegarde et validation des DTO ;
- un test d'intégration SQLite/MQTT simulé pour discovery → état → historique → scénario.

### P1 — moteur de scénarios : événements perdus pendant une exécution

**Constat.** `ScenariosService` protège toute l'évaluation par un unique booléen `executing`. Si un message MQTT arrive pendant une action lente (notification, commande, base), `evaluateScenariosFor` retourne immédiatement. L'événement est perdu, sans file d'attente ni nouvelle évaluation.

**Impact.** Une alarme ou automatisation légitime peut ne jamais partir lors de rafales de messages, de plusieurs appareils ou d'un service externe lent.

**Recommandation.** Remplacer le verrou global par une sérialisation par scénario ou par device, ou une file bornée/dédupliquée. Conserver une protection explicite contre les boucles d'auto-déclenchement, mais mesurer les événements ignorés. Ajouter des métriques : messages reçus, évaluations lancées, dédoublonnées, échouées.

### P1 — chaudière : absence de stratégie explicite sur relais hors ligne et redémarrage

**Constat.** La régulation vérifie `mqttTopic`, mais pas `device.active`, `device.status === online` ni l'accusé de réception de la commande. `lastCommandedState` est sauvegardé immédiatement après `mqtt.publish`, même si le broker est indisponible ou le relais hors ligne. Après un redémarrage, cet état persistant peut empêcher la réémission de l'ordre attendu.

**Impact.** L'interface peut indiquer une commande appliquée alors que le relais ne l'a jamais reçue. Dans la zone d'hystérésis, une commande manquée peut durer jusqu'à un changement de température ou de seuil.

**Recommandation.** Définir et documenter une politique de sûreté : par exemple « en cas de doute, ne pas changer l'état et alerter » ou « OFF après délai maximal », selon le câblage réel. Ne confirmer l'état commandé qu'après retour d'état Zigbee/MQTT, avec timeout et alarme dédiée. Au boot, resynchroniser l'état réel du relais avant la première décision. Ajouter un capteur de fraîcheur de sonde (pas seulement une valeur numérique présente).

### P1 — sauvegarde : rétention configurée mais non appliquée ; cohérence de l'ensemble non vérifiée

**Constat.** L'API stocke `retentionDays`, mais `backup.sh` purge toujours les quotidiennes après 14 jours et ne purge jamais les archives `full`. La copie SQLite est cohérente si `sqlite3` est installé (`.backup`), mais le fallback `cp` peut capturer une base en écriture. Les archives contiennent aussi `.env` et les clés/réseaux radio : c'est normal, mais leur protection n'est pas contrôlée par le code.

**Impact.** La promesse de rétention de l'UI est fausse ; l'espace disque peut croître sans limite avec les full backups. Une sauvegarde de secours peut être inutilisable ou exposer des secrets si ses permissions/emplacement sont trop ouverts.

**Recommandation.** Passer explicitement la rétention au script, purger les deux modes selon une politique documentée, échouer si `sqlite3` est absent au lieu de copier une DB vivante, définir `umask 077`, vérifier l'archive (`tar -tzf`) et produire régulièrement une restauration de vérification. Ajouter taille disponible, dernier succès/échec et alerte de sauvegarde obsolète au tableau système.

### P1 — dépendances de production à mettre à jour

**Constat.** `pnpm audit --prod` remonte 1 vulnérabilité haute et 3 modérées : `multer 2.1.1` (DoS), `postcss 8.4.31` (XSS dans certains usages de stringify) et `js-yaml 4.1.1` (DoS). Elles sont transitives via Nest/Swagger et Next.

**Impact.** Même en LAN privé, l'API sans authentification rend un déni de service plus facile si un poste du réseau est compromis ; une mise à jour réduit aussi le risque de maintenance bloquée plus tard.

**Recommandation.** Mettre à jour les dépendances directes/pins qui tirent ces versions, régénérer le lockfile puis refaire audit, typecheck et build. Documenter une cadence mensuelle de `pnpm audit --prod`.

### P1 — surfaces d'administration non authentifiées

**Constat.** L'API active CORS sans restriction et n'a aucun garde d'authentification. Swagger, commandes d'appareils, appairage, arrêt de bridges, restauration et téléchargement de sauvegardes sont donc accessibles à tout client qui atteint le port API. Mosquitto de développement autorise aussi les connexions anonymes.

**Impact.** Ce point dépasse la sécurité « hacking », car une action accidentelle depuis le LAN peut couper les bridges, restaurer une ancienne base ou piloter le chauffage. L'UFW aide en production, mais n'est pas une identité applicative.

**Recommandation.** Avant toute exposition élargie (y compris Tailscale), ajouter une authentification simple à rôle unique, CSRF si cookies, CORS avec origines explicites et désactiver/limiter Swagger en production. Réserver les opérations destructrices à un rôle admin et journaliser l'auteur. Configurer Mosquitto avec identifiants/ACL dès qu'un client hors machine est nécessaire.

## Architecture et modularité

### Évaluation

Le découpage technique est bon pour la taille actuelle. `@skbox/shared` apporte des DTO Zod là où ils sont utilisés, `@skbox/db` évite les clients Prisma multiples, et les modules Nest suivent bien les domaines. Le choix d'absence de plugins est justifié : le domaine est très spécifique et le coût d'une plateforme d'extensions serait prématuré.

Les limites commencent à être visibles dans deux endroits : l'API mélange des adaptateurs d'infrastructure (MQTT, systemd, ONVIF, HTTP) et la logique métier dans les mêmes services ; le frontend concentre beaucoup de logique dans des pages monolithiques. Les plus grandes pages font 617 à 1 037 lignes (`page.tsx` dashboard, appareils, scénarios, alarmes, historique, système, caméras et chaudière).

### Recommandations P2

1. Conserver le monorepo et les modules Nest, mais isoler progressivement des ports/adaptateurs : `DeviceCommandPort`, `BridgeHealthPort`, `SystemCommandPort`, `CameraPort`, `NotificationPort`. Les services métier deviendront testables sans MQTT, shell ou caméra.
2. Extraire des composants/hooks par page web : liste/filtre, formulaire, panneau de détail, appels TanStack Query et formatage. Aucun besoin de réécriture ; cibler une grande page à la fois lors de chaque évolution.
3. Étendre `@skbox/shared` aux contrats actuellement typés inline dans les controllers (settings, rooms, boiler, camera, system) et activer une validation Nest globale qui transforme proprement les erreurs Zod en 400. Aujourd'hui la validation est hétérogène.
4. Le modèle `Setting` clé/valeur est pratique, mais opaque : versionner les documents JSON importants (`boiler`, sauvegarde, préférences), valider à la lecture et prévoir des migrations. Les références `Scenario.group`, `Device.room` et `parentObject` sont parfois stockées par nom plutôt que par clé étrangère ; c'est simple, mais rend les renommages/cascades plus fragiles.
5. Relever l'écart documentaire : `03-fonctionnel.md` annonce Notifications, et `02-architecture-technique.md` mentionne Redis, Tailscale et go2rtc implicitement/partiellement. La configuration effective, les dépendances système et leurs unités doivent être une source de vérité unique.

## Performance et capacité

### État actuel

Pour une maison et un Mac Mini 2011, SQLite, Prisma et un processus Node par brique sont raisonnables. Les optimisations d'historique sont pertinentes : filtrage de bruit avant écriture, index composite, purge par lots et décimation pour les graphiques. Le tableau système parallélise les lectures indépendantes.

### Risques et améliorations P2

- `DevicesService.getHistory` charge **tous** les événements quand `maxPoints` est demandé, avant de les décimer en mémoire. Sur des années de capteurs bavards, cela peut saturer RAM/CPU et bloquer SQLite. Imposer une plage maximale, un plafond dur, puis agréger côté SQL ou conserver des rollups (min/max/moyenne par heure/jour).
- Les listes et pages principales chargent largement côté client. Ajouter pagination/virtualisation pour appareils, historiques, alarmes et journaux quand les volumes augmenteront.
- `MqttService` conserve 500 messages, ce qui est sain ; en revanche chaque message est loggé en niveau `debug`. Vérifier que ce niveau n'est pas activé durablement en production pour ne pas produire de bruit I/O.
- Les timers (`boiler`, watchdogs, cron, backups) sont en mémoire. Après une coupure, aucun rattrapage n'est défini. Pour la chaudière, enregistrer le dernier cycle et décider explicitement de l'action de reprise ; pour les cron, documenter que les exécutions manquées ne sont pas rejouées.
- Les appels système de santé lancent plusieurs processus externes à chaque rafraîchissement. Mettre un cache très court (2–5 s) ou une collecte périodique évitera les rafales si plusieurs onglets sont ouverts.
- Les clients caméra et météo doivent avoir des timeouts/AbortController systématiques. Les fetch non bornés peuvent maintenir des requêtes ouvertes et dégrader le serveur si un équipement devient muet.

## Exploitabilité et déploiement

- Les unités systemd ont `Restart=on-failure`, ce qui est positif. Ajouter `StartLimitIntervalSec`/`StartLimitBurst`, `TimeoutStartSec`, `TimeoutStopSec`, `EnvironmentFile=` et un `ExecStartPre` de vérification des dépendances (DB, MQTT) rendrait les pannes plus lisibles.
- `deploy/deploy.sh` fait correctement migrations puis build avant restart, mais un `git pull origin main` sur un répertoire de production sale peut échouer et l'absence de healthcheck post-redémarrage laisse une livraison incomplète passer silencieusement. Déployer un commit précis, vérifier `systemctl is-active` et une route `/api/health/ready` après restart.
- Les scripts locaux `start.sh`/`stop.sh` utilisent plusieurs `pkill -9` et des ports génériques. C'est acceptable pour du développement personnel mais peut tuer un processus homonyme et ne permet aucun arrêt propre. Préférer des PID files/process groups et SIGTERM puis délai avant SIGKILL.
- Il n'y a pas de route de readiness dédiée : `/system/health` dépend de commandes matérielles et ne distingue pas API démarrée, Prisma prête et MQTT connecté. Créer `/health/live` et `/health/ready` légers facilite systemd, déploiement et supervision.

## Feuille de route proposée

| Horizon | Action | Critère de sortie |
|---|---|---|
| Immédiat | Corriger restauration/reprise et la rétention effective ; ajouter un journal de résultat | restauration de test et retour des quatre services validés |
| 1 semaine | Introduire lint + tests du moteur chaudière/scénarios/sauvegarde ; corriger les dépendances audit | CI verte, audit sans vulnérabilité haute connue |
| 2–3 semaines | Accusés de commande / fraîcheur de sonde chaudière ; queue/dédoublonnage des scénarios | tests de pertes de messages et de relais indisponible verts |
| Ensuite | Health/readiness, cache santé, agrégation historique, découpage progressif UI/adaptateurs | volumes réalistes mesurés, pages principales ramenées à des composants testables |

## Résultats des commandes exécutées

| Commande | Résultat |
|---|---|
| `pnpm typecheck` | succès sur les workspaces concernés |
| `pnpm build` | succès : packages, Next.js et NestJS |
| `pnpm lint` | échec attendu : aucun script `lint` défini dans les packages |
| `pnpm audit --prod` | 1 haute, 3 modérées (détails ci-dessus) |

## Conclusion

Skbox n'a pas besoin d'une plateforme plus lourde. Son architecture est adaptée et son approche de résilience est prometteuse. La prochaine marche de maturité consiste à rendre les actions opérationnelles réversibles ou auto-réparatrices, à prouver le comportement des fonctions physiques par des tests, puis à traiter les volumes d'historique avant qu'ils ne deviennent un problème. Les corrections P0/P1 ci-dessus apporteront beaucoup plus de valeur qu'une refonte structurelle.
