# Installation de Skbox

Version documentée : **1.0.0**

## 1. Vue d'ensemble

Skbox tourne sur une machine dédiée (dans notre cas un Mac Mini reconverti sous Linux) connectée en permanence au réseau local, avec deux dongles USB pour le sans-fil domotique :

| Composant | Rôle | Port |
|---|---|---|
| API (NestJS) | Backend, logique métier, accès DB | 3001 |
| Web (Next.js) | Dashboard / interface utilisateur | 3002 |
| Mosquitto | Broker MQTT (bus de communication interne) | 1883 (MQTT), 9001 (websockets) |
| Redis | Cache / files | 6381 (hôte) → 6379 (conteneur) |
| Zigbee2MQTT | Passerelle Zigbee ↔ MQTT | 8080 (UI) |
| rfxcom2mqtt | Passerelle RF433 ↔ MQTT | 8891 (UI) |

Deux modes d'exécution existent :
- **Développement local** (macOS) : Docker pour Mosquitto/Redis, Z2M et rfxcom2mqtt en natif (le passthrough USB n'est pas supporté par Docker Desktop sur macOS), API/Web via `pnpm dev`.
- **Serveur de production** (skbox-mini, cf. §4) : mêmes briques mais gérées par systemd, sans Docker (overhead jugé inutile sur du matériel ancien).

## 2. Prérequis

- Node.js ≥ 20, pnpm ≥ 9
- Docker (dev local uniquement — Mosquitto/Redis)
- Un dongle Zigbee compatible Zigbee2MQTT (chez nous : Sonoff ZBDongle-E, Silicon Labs EFR32MG21)
- Un dongle RFXtrx433E (capteurs Oregon Scientific, interrupteurs/prises Chacon/DIO)

## 3. Installation en développement (macOS)

```bash
git clone <repo> skbox && cd skbox
pnpm install

# Base de données
pnpm db:migrate
pnpm db:seed          # crée les pièces de base

# Zigbee2MQTT (natif, hors monorepo)
git clone https://github.com/Koenkk/zigbee2mqtt.git ~/zigbee2mqtt
cd ~/zigbee2mqtt && npm ci && npm run build

# rfxcom2mqtt (natif)
npm i -g rfxcom2mqtt
```

Configurer :
- `.env` à la racine : `DATABASE_URL`, `MQTT_URL`
- `~/zigbee2mqtt/data/configuration.yaml` : port série du dongle Zigbee (`/dev/cu.usbserial-...`)
- `rfxcom2mqtt/config.yml` (racine du projet) : port série du dongle RFXtrx433E

Démarrage / arrêt complets :
```bash
./start.sh   # Docker (Mosquitto+Redis) + Z2M + rfxcom2mqtt + API + Web
./stop.sh
```

Ou plus ciblé :
```bash
pnpm docker:up   # Mosquitto + Redis seuls
pnpm dev         # API + Web seuls (suppose Z2M/rfxcom2mqtt déjà lancés à côté)
pnpm dev:api     # API seule (port 3001)
pnpm dev:web     # Web seul (port 3002)
```

Accès une fois démarré :
- Dashboard : http://localhost:3002
- API / Swagger : http://localhost:3001/api, http://localhost:3001/docs
- UI Zigbee2MQTT : http://localhost:8080
- UI rfxcom2mqtt : http://localhost:8891

## 4. Installation en production — cas concret (skbox-mini)

Notre instance de référence tourne sur un **Mac Mini 2011 (i5)** recyclé, sous **Ubuntu 22.04** (Docker abandonné au profit de paquets apt natifs — Mosquitto et Redis inclus — car la VM de Docker Desktop est trop lourde pour ce matériel).

### 4.1 Services systemd

Chaque brique tourne comme service systemd indépendant (unités fournies dans `deploy/*.service`, à copier dans `/etc/systemd/system/` puis `systemctl enable --now <service>`) :

| Service | Description |
|---|---|
| `skbox-api` | API NestJS (`node apps/api/dist/src/main.js`) |
| `skbox-web` | Web Next.js (`next start -p 3002`), démarre après `skbox-api` |
| `skbox-z2m` | Zigbee2MQTT, démarre après `mosquitto` |
| `skbox-rfxcom` | rfxcom2mqtt, démarre après `mosquitto` |
| `mosquitto` | Broker MQTT (paquet apt natif, conf perso dans `deploy/mosquitto-skbox.conf`) |

Le module « Système » du dashboard (`/settings/system`) surveille en direct l'état de ces services (+ `docker`, `fstrim.timer`), et permet un redémarrage manuel des bridges Zigbee/RFXcom depuis l'UI.

### 4.2 Déploiement

```bash
ssh skbox-mini 'cd ~/skbox && git pull && bash deploy/deploy.sh'
```

`deploy/deploy.sh` fait : pull → `pnpm install` → migrations Prisma (`prisma migrate deploy` + `generate`) → `pnpm build` → `systemctl restart skbox-api skbox-web`.

### 4.3 Sudoers dédiés

L'API tourne sous l'utilisateur `christian` (pas root) mais a besoin d'exécuter quelques commandes privilégiées (redémarrage de services, lecture SMART du disque) depuis le dashboard Système. Un fichier sudoers dédié (`deploy/skbox-sudoers`, à installer dans `/etc/sudoers.d/`) whitelist précisément ces commandes en NOPASSWD, sans ouvrir sudo en général :

```
christian ALL=(root) NOPASSWD: /usr/bin/systemctl restart skbox-api, ...
                                /usr/sbin/smartctl -H /dev/sda, /usr/sbin/smartctl -A /dev/sda
```

Sans ce fichier, les boutons de redémarrage du dashboard échouent silencieusement côté sudo (voir historique : ce cas a été corrigé pour remonter l'erreur réelle dans l'UI au lieu de rafraîchir sans rien faire).

### 4.4 Réseau

Le pare-feu (UFW) n'autorise les ports applicatifs (3001, 3002, MQTT, UIs Z2M/rfxcom2mqtt) que depuis les sous-réseaux LAN (`192.168.0.0/24`, `192.168.1.0/24`). À garder à l'esprit avant d'exposer un nouveau port.

## 5. Ajustements matériels spécifiques au Mac Mini (thermique / ventilation)

Le Mac Mini 2011 n'est pas conçu pour tourner en Linux natif 24/7 : sans intervention, le contrôle du ventilateur (piloté normalement par macOS via le capteur Apple SMC) reste à sa vitesse minimale sous Ubuntu, quel que soit l'échauffement du CPU. Trois mécanismes ont été mis en place pour rendre ça viable en usage serveur continu.

### 5.1 mbpfan — pilotage actif du ventilateur

`mbpfan` (paquet natif, service systemd `mbpfan`) lit les capteurs `applesmc` et ajuste la vitesse du ventilateur en fonction de la température CPU, ce que le noyau Linux ne fait pas nativement sur ce matériel.

Configuration retenue (`/etc/mbpfan.conf`) :
```ini
min_fan1_speed = 2000   # vitesse mini du ventilateur, cf. cat /sys/devices/platform/applesmc.768/fan*_min
max_fan1_speed = 5500   # vitesse maxi, cf. cat /sys/devices/platform/applesmc.768/fan*_max
low_temp = 55            # en dessous : vitesse mini
high_temp = 65            # au dessus : monte progressivement vers la vitesse maxi
max_temp = 87             # palier de sécurité interne à mbpfan
polling_interval = 5      # secondes entre deux lectures (défaut = 1, allégé pour ne pas user le capteur)
```

Les seuils par défaut de mbpfan sont pensés pour un usage bureautique intermittent ; ils ont été resserrés (`high_temp` abaissé) pour anticiper la montée en charge d'un serveur qui tourne en continu, sans pour autant faire tourner le ventilateur en permanence à fond (bruit, usure).

### 5.2 thermald — gestion thermique Intel

`thermald` (service systemd `thermald`, paquet Intel) complète mbpfan en pilotant le throttling CPU natif Intel (P-states) si la température continue de grimper malgré la ventilation — une seconde ligne de défense logicielle avant d'atteindre les seuils matériels.

### 5.3 thermal-shutdown — coupe-circuit de sécurité

En dernier recours (mbpfan et thermald défaillants, ventilateur physiquement bloqué, etc.), un script minimaliste indépendant surveille la température et **arrête la machine** avant qu'elle ne s'endommage :

`/usr/local/sbin/thermal-shutdown.sh` :
```bash
#!/bin/bash
LIMIT=92
LOG="/var/log/thermal-shutdown.log"
TEMP=$(sensors | awk '/Package id 0/ {gsub(/\+|°C/,"",$4); print int($4)}')
echo "$(date) - Température CPU: ${TEMP}°C" >> "$LOG"
if [ "$TEMP" -ge "$LIMIT" ]; then
  echo "$(date) - Température critique ${TEMP}°C >= ${LIMIT}°C : arrêt de sécurité" >> "$LOG"
  /usr/sbin/shutdown -h now "Arrêt automatique : température CPU critique (${TEMP}°C)"
fi
```

Déclenché toutes les minutes par un timer systemd (`thermal-shutdown.timer`, `OnBootSec=2min` / `OnUnitActiveSec=1min`) associé à un service oneshot (`thermal-shutdown.service`). Seuil fixé à **92°C**, avec de la marge sous le seuil de dégât matériel réel.

Ce garde-fou est visible et pilotable (start/stop du timer) depuis le dashboard Système, avec le dernier relevé de température et l'horodatage du dernier check.

### 5.4 Résumé — pourquoi ces trois couches

| Couche | Rôle | Ce qu'elle évite |
|---|---|---|
| mbpfan | Ventilation proactive selon la charge | Surchauffe évitable, usure prématurée |
| thermald | Throttling CPU si la ventilation ne suffit plus | Montée en température incontrôlée |
| thermal-shutdown.timer | Arrêt d'urgence à 92°C | Dommage matériel si les deux couches précédentes échouent |

### 5.5 Autres réglages système

- Désactiver la mise en veille (le Mac Mini doit rester actif en permanence en tant que serveur) — via les réglages d'énergie Ubuntu ou `systemd-logind`/`GRUB` selon la configuration graphique installée.
- `fstrim.timer` activé (TRIM périodique du SSD) — surveillé lui aussi dans le dashboard Système.

## 6. Vérification post-installation

Le dashboard `/settings/system` (module « Système ») donne un état de santé complet en un coup d'œil : CPU/RAM/disque, températures, RPM ventilateur, santé SMART du SSD, conteneurs Docker (si utilisés), état de chaque service systemd listé ci-dessus, état des bridges Zigbee/RFXcom, et l'état du garde-fou thermique.
