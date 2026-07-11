# Architecture technique de Skbox

Version documentée : **1.0.0**

## 1. Vue d'ensemble

Skbox est un monorepo pnpm organisé en 2 applications et 2 packages partagés :

```
skbox/
├── apps/
│   ├── api/       NestJS 11 — backend, logique métier, accès DB, MQTT
│   └── web/       Next.js 16 + React 19 — dashboard
├── packages/
│   ├── db/        @skbox/db  — schéma Prisma (SQLite) + client partagé
│   └── shared/    @skbox/shared — types & schémas Zod partagés API/Web
├── docker/        docker-compose (Mosquitto + Redis, dev local)
└── deploy/        scripts et unités systemd pour le serveur de prod
```

Philosophie : rester volontairement simple, pas une "usine à gaz" à la Home Assistant/Jeedom — pas de système de plugins, pas d'abstractions superflues.

## 2. Flux de données et protocoles

Skbox ne parle jamais directement aux dongles radio : tout transite par **MQTT**, via deux passerelles externes qui tournent en dehors du monorepo (installées nativement, hors Docker, pour permettre le passthrough USB) :

- **Zigbee2MQTT** — pont Zigbee ↔ MQTT (dongle Sonoff ZBDongle-E / Silicon Labs EFR32MG21)
- **rfxcom2mqtt** — pont RF433 ↔ MQTT (dongle RFXtrx433E ; capteurs Oregon Scientific, interrupteurs/prises Chacon/DIO)

```
Zigbee2MQTT ──┐
              ├──► Mosquitto (broker MQTT) ◄──► apps/api (NestJS)
rfxcom2mqtt ──┘                                      │
                                                      ▼
                                              apps/web (Next.js)
```

### Conventions de topics MQTT

| Préfixe | Sens | Exemple |
|---|---|---|
| `skbox/{protocol}/{deviceId}/command` | Commandes envoyées par l'API pour un device protocole MQTT natif | `skbox/mqtt/abc123/command` |
| `zigbee2mqtt/{friendlyName}` | État publié par Z2M pour un device | `zigbee2mqtt/Salon Lampe` |
| `zigbee2mqtt/{friendlyName}/availability` | Ping online/offline par device (timeout configuré à 5 min) | |
| `zigbee2mqtt/bridge/devices` | Liste des devices → utilisé pour l'auto-discovery | |
| `zigbee2mqtt/bridge/request/permit_join` | Commande d'appairage | |
| `zigbee2mqtt/bridge/request/networkmap` | Scan réseau (module Santé réseau) | |
| `rfxcom2mqtt/devices/+` | État publié par rfxcom2mqtt | |
| `rfxcom2mqtt/send/{type}` / `rfxcom2mqtt/command/{type}/{id}` | Commandes vers rfxcom2mqtt | |

Le service `MqttService` (`apps/api/src/mqtt`) est le point d'entrée unique : il se connecte au broker, s'abonne à `skbox/#`, `zigbee2mqtt/#`, `rfxcom2mqtt/#`, et distribue les messages aux services concernés via un système de handlers avec wildcards (`+`/`#`). Il garde aussi un buffer des 500 derniers messages, exposé par `GET /api/mqtt/logs` pour le débogage (visible dans Réglages → Logs MQTT).

## 3. Backend — apps/api (NestJS)

- Démarrage (`main.ts`) : préfixe global `/api`, CORS ouvert, documentation Swagger auto-générée sur `/docs`, port `process.env.PORT` (défaut 3001).
- Persistance : Prisma / SQLite via `@skbox/db`, un client singleton partagé (mis en cache en dev pour éviter les reconnections à chaud).
- Validation : les DTOs de la plupart des modules sont des schémas **Zod** définis dans `@skbox/shared`, réutilisés tels quels côté web pour le typage.

### Modules

| Module | Rôle |
|---|---|
| `mqtt` | Client MQTT central, distribution des messages, logs |
| `devices` | Registre des appareils : CRUD, commandes, historique, préférences d'affichage, config d'historique, mode "changement de pile", fusion de devices |
| `rooms` | Pièces (regroupement de devices) |
| `parent-objects` | "Objets" — regroupement hiérarchique de devices (ex : interrupteur multi-canaux) |
| `themes` | Thèmes — tags/collections transverses appliqués aux devices |
| `zigbee` | Intégration Zigbee2MQTT : auto-discovery, disponibilité, permit-join, commandes, watchdog/auto-restart |
| `rfxcom` | Intégration rfxcom2mqtt : discovery RF433, commandes, watchdog/auto-restart |
| `scenarios` | Moteur d'automatisation (déclencheurs/conditions/actions), scénarios de type "alarme" journalisés dans `AlarmEvent` |
| `scenario-groups` | Registre des groupes nommés pour regrouper visuellement les scénarios |
| `system` | Santé système, journal d'événements, coupe-circuit thermique, redémarrage manuel des bridges, gestion Tailscale |
| `system-events` | Journal d'événements service (démarrage/arrêt/erreur) consommé par `system`, `zigbee`, `rfxcom`, `tailscale` |
| `tailscale` | Supervision et auto-restart du VPN Tailscale |
| `settings` | Store générique clé/valeur — backbone de configuration de presque tous les autres modules (voir §5) |
| `backup` | Sauvegarde/restauration de la base (liste, config, lancer, restaurer, supprimer, télécharger) |
| `boiler` | Pilotage chaudière/chauffage : niveaux de consommation, config, statut, mode boost |
| `history-templates` | Modèles réutilisables de vues d'historique (graphiques/tableaux) |
| `camera` | Caméras ONVIF + Reolink : CRUD, snapshots, PTZ, réglages image, profils d'imagerie nommés |
| `weather` | Météo du domicile (actuelle + prévisions), localisation |
| `network-health` | État du maillage réseau, scan à la demande |
| `notifications` | Envoi de notifications Telegram et email (SMTP) |

Note : il n'y a pas de module "alarmes" dédié — les alarmes sont une catégorie de `Scenario` (`category: "alarm"`), journalisées dans `AlarmEvent`.

## 4. Frontend — apps/web (Next.js)

- Next.js 16 (App Router), React 19, Mantine 7 (thème sombre par défaut), TanStack Query v5 pour l'état serveur, icônes Tabler, graphiques via Recharts.
- Le navigateur ne parle jamais directement au port 3001 : `next.config.ts` proxy `/api/:path*` vers `http://localhost:3001/api/:path*`. Le client HTTP (`lib/api.ts`) est une instance axios avec `baseURL: '/api'`.
- Navigation principale (`AppNav.tsx`) : Dashboard, Appareils, Scénarios, Modules, Réglages, plus un indicateur d'alarme (`AlarmBell`/`AlarmWatcher`).

### Structure des routes

```
/                                  Dashboard
/devices                           Appareils
/scenarios                         Scénarios
/modules                           Hub des modules
  /modules/alarms
  /modules/boiler
  /modules/cameras
  /modules/history
  /modules/network-health
  /modules/weather
/settings                          Réglages (landing)
  /settings/backup
  /settings/mqtt-logs
  /settings/pairing
  /settings/preferences
  /settings/system
  /settings/tools
  /settings/parametres             Paramètres transverses
    /settings/parametres/groupes-scenarios
    /settings/parametres/objets
    /settings/parametres/pieces
    /settings/parametres/themes
```

### Composants partagés notables

- `NamedListManager` — CRUD générique réutilisé pour pièces/thèmes/objets/groupes de scénarios.
- `ValueChart` / `ExpandableChart` — graphiques d'historique.
- `DeleteConfirmButton` — confirmation de suppression (cf. convention UI dans `CLAUDE.md` : simple Oui/Non par défaut, saisie "OUI" réservée aux suppressions destructrices explicitement demandées).

## 5. Base de données (packages/db, Prisma/SQLite)

Modèles principaux :

- **Device** — registre central : protocole, type, statut, pièce, objet parent, état JSON, adressage (`address`, `ieeeAddress`, `rfxcomId`, `mqttTopic`), calibration capteurs, préférences d'affichage/historique, flags visibilité/actif/suivi historique.
- **DeviceEvent** — historique horodaté par device (cascade avec le device).
- **ServiceEvent** — journal d'événements des services (zigbee/rfxcom/tailscale).
- **Scenario** — règles d'automatisation : déclencheur, conditions (JSON + opérateur AND/OR), actions, catégorie (automation/alarm), sévérité, groupe.
- **ScenarioGroup**, **AlarmEvent** — regroupement et journal des alarmes déclenchées.
- **Room**, **ParentObject**, **Theme** — entités de regroupement/tag des devices.
- **Camera**, **CameraImagingProfile** — configuration caméra et profils d'image nommés.
- **Setting** — store clé/valeur générique (voir §6).
- **HistoryTemplate** — modèles de vues d'historique.

## 6. Configuration : très peu d'`.env`, presque tout en base

Contrairement à beaucoup de projets, Skbox ne configure quasiment rien via variables d'environnement. Seules `DATABASE_URL`, `MQTT_URL` et `PORT` sont lues depuis `.env`. Toute la configuration fonctionnelle (identifiants Telegram/SMTP, localisation météo, config de sauvegarde, intervalles des watchdogs zigbee/rfxcom/tailscale, état chaudière...) est stockée dans le modèle **`Setting`** (clé/valeur) et pilotée via `GET/PUT /api/settings/:key`, modifiable depuis l'UI sans redéploiement.

## 7. Packages partagés

- **`@skbox/db`** — schéma Prisma + client singleton, script de seed (pièces par défaut).
- **`@skbox/shared`** — schémas Zod (device, scenario, theme, history-template) + types inférés, enums `Protocol` (ZIGBEE, MATTER, MQTT, RF433) et `DeviceType` (LIGHT, SWITCH, SENSOR_*, THERMOSTAT, PLUG, REMOTE), `DeviceStatus` (ONLINE, OFFLINE, PAIRING). Consommés à la fois par l'API (validation) et le Web (typage des contrats).

## 8. Infrastructure & déploiement

- **Dev local (macOS)** : Docker pour Mosquitto + Redis (`docker/docker-compose.yml`), Z2M et rfxcom2mqtt en natif (passthrough USB indisponible dans Docker Desktop sur macOS).
- **Prod (skbox-mini)** : tout en natif via systemd, sans Docker (overhead jugé disproportionné sur du matériel ancien) — Mosquitto en paquet apt, services `skbox-api`, `skbox-web`, `skbox-z2m`, `skbox-rfxcom` (unités dans `deploy/`).
- **Déploiement** : `deploy/deploy.sh` — pull, install, migrations Prisma (`migrate deploy`), build, redémarrage des services.
- **Sécurité d'accès** : sudoers dédié (`deploy/skbox-sudoers`) limitant précisément les commandes que l'API peut exécuter en NOPASSWD (redémarrage des services skbox/bridges, lecture SMART), pare-feu UFW restreint aux sous-réseaux LAN.
- Détails complets des réglages matériels (thermique/ventilation) et de la procédure d'installation : voir [01-installation.md](./01-installation.md).

## 9. Points d'observabilité

- `GET /api/system/health` — CPU, RAM, disque, températures, RPM ventilateur, SMART SSD, conteneurs Docker, état des services systemd, état des bridges, statut Tailscale, coupe-circuit thermique.
- `GET /api/mqtt/logs` — derniers messages MQTT transités.
- Journal d'événements service (`ServiceEvent`) consultable pour tracer les redémarrages/erreurs des bridges et de Tailscale.
