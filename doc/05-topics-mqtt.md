# Topics MQTT de Skbox

Version documentée : **1.0.0**

Référence exhaustive des topics MQTT utilisés par `apps/api`, vérifiée directement dans le code (`mqtt.service.ts`, `zigbee.service.ts`, `rfxcom.service.ts`, `devices.controller.ts`, `scenarios.service.ts`, `network-health.service.ts`). Voir aussi [02-architecture-technique.md](./02-architecture-technique.md) pour le flux d'ensemble.

## 1. Abonnement broker

Au démarrage, `MqttService` s'abonne côté broker à trois wildcards seulement — tout le reste passe par un routage interne (`subscribe(pattern, handler)`) sur les messages déjà reçus :

```
skbox/#
zigbee2mqtt/#
rfxcom2mqtt/#
```

L'abonnement broker est volontairement retardé jusqu'à `onApplicationBootstrap` (après que tous les modules aient enregistré leurs handlers internes via `onModuleInit`), pour ne jamais perdre une salve de messages retenus (retained) livrée avant que quoi que ce soit ne puisse la traiter.

Le matching interne (`matchTopic`) supporte les wildcards MQTT standards : `+` (un niveau) et `#` (fin de topic).

## 2. Namespace `skbox/*` — devices génériques (protocole MQTT natif)

| Topic | Sens | Émetteur | Payload |
|---|---|---|---|
| `skbox/{protocol}/{deviceId}/command` | Commande vers un appareil qui n'est ni zigbee ni rf433 (ex. protocole MQTT natif ou Matter à venir) | `devices.controller.ts` (`POST /api/devices/:id/command`) | `{ command, payload }` |

Ce chemin est le cas générique (`else`) dans `sendCommand` : si le device n'a ni `protocol === 'zigbee'` ni `protocol === 'rf433'`, la commande part sur `skbox/{protocol}/{deviceId}/command`.

## 3. Namespace `zigbee2mqtt/*` — pont Zigbee2MQTT

### En écoute (état / découverte)

| Topic | Sens | Consommé par |
|---|---|---|
| `zigbee2mqtt/bridge/devices` | Liste complète des devices connus du bridge — base de l'auto-discovery | `ZigbeeService.onModuleInit` |
| `zigbee2mqtt/bridge/state` | État du bridge (online/offline) | `ZigbeeService` |
| `zigbee2mqtt/+` | État publié par un device (1 niveau = `friendlyName`) | `ZigbeeService` (mise à jour état) et `ScenariosService` (évaluation des déclencheurs) |
| `zigbee2mqtt/+/availability` | Ping de disponibilité par device (online/offline), timeout 5 min configuré côté Z2M | `ZigbeeService` |
| `zigbee2mqtt/bridge/event` | Événements bridge (device joined/left, etc.) | `ZigbeeService` |
| `zigbee2mqtt/bridge/response/health_check` | Réponse au health-check demandé | `ZigbeeService` (watchdog) |
| `zigbee2mqtt/bridge/response/networkmap` | Résultat du scan de maillage réseau | `NetworkHealthService` |

### En publication (commandes)

| Topic | Sens | Émetteur |
|---|---|---|
| `zigbee2mqtt/bridge/request/devices` | Redemande la liste des devices (resync) | `ZigbeeService` |
| `zigbee2mqtt/bridge/request/health_check` | Déclenche un health-check du bridge | `ZigbeeService` (watchdog périodique) |
| `zigbee2mqtt/bridge/request/permit_join` | Active/désactive l'appairage (`{ value, time }`) | `ZigbeeService.permitJoin` (`POST /api/zigbee/permit-join`) |
| `zigbee2mqtt/bridge/request/networkmap` | Lance un scan du maillage (`{ type: 'raw', routes: false }`) | `NetworkHealthService.scan` (`POST /api/network-health/scan`) |
| `zigbee2mqtt/{friendlyName}/set` | Commande vers un device Zigbee précis | `DevicesController.sendCommand` (`POST /api/devices/:id/command`) et `ZigbeeService.sendCommand` (`POST /api/zigbee/devices/:ieeeAddress/command`) |

Le `mqttTopic` stocké sur chaque `Device` Zigbee vaut `zigbee2mqtt/{friendlyName}` — c'est ce champ qui sert de clé de lookup pour retrouver un device à partir d'un topic entrant (scénarios, historisation).

## 4. Namespace `rfxcom2mqtt/*` — pont rfxcom2mqtt

### En écoute (état / découverte)

| Topic | Sens | Consommé par |
|---|---|---|
| `rfxcom2mqtt/bridge/status` | État du bridge (online/offline) | `RfxcomService` |
| `rfxcom2mqtt/devices/+` | État publié par un device RF433 | `RfxcomService` (découverte + mise à jour état) et `ScenariosService` (évaluation des déclencheurs) |

### En publication (commandes)

| Topic | Sens | Émetteur |
|---|---|---|
| `rfxcom2mqtt/send/{type}` | Commande générique pour un device RF433 (`{ id, ...payload }`) | `DevicesController.sendCommand` (`POST /api/devices/:id/command`) |
| `rfxcom2mqtt/command/{type}/{subId}` | Commande adressée précisément (type + sous-identifiant extraits du `rfxcomId`) | `RfxcomService.sendCommand` (`POST /api/rfxcom/devices/:rfxcomId/command`) |

Le `mqttTopic` stocké sur chaque `Device` RF433 vaut `rfxcom2mqtt/devices/{id}`. Il existe deux chemins de commande distincts selon l'endpoint API appelé (générique via `devices/:id/command`, ou dédié via `rfxcom/devices/:rfxcomId/command`) — normal, ce sont deux implémentations indépendantes qui parlent au même bridge par deux formats de topic différents ; ne pas s'étonner de voir les deux dans les logs MQTT.

## 5. Récapitulatif par device

| Device.protocol | `mqttTopic` stocké | Topic de commande |
|---|---|---|
| `zigbee` | `zigbee2mqtt/{friendlyName}` | `{mqttTopic}/set` |
| `rf433` | `rfxcom2mqtt/devices/{id}` | `rfxcom2mqtt/send/{type}` (générique) ou `rfxcom2mqtt/command/{type}/{subId}` (module RFXcom) |
| autre (mqtt natif, futur matter...) | — | `skbox/{protocol}/{deviceId}/command` |

## 6. Observabilité

- Un buffer circulaire des **500 derniers messages** (tous topics confondus, y compris ceux sans handler applicatif) est conservé en mémoire par `MqttService`.
- Exposé via `GET /api/mqtt/logs` (optionnellement filtré par topic avec les mêmes wildcards `+`/`#`), consultable dans le dashboard sous **Réglages → Logs MQTT**.
- Utile pour vérifier qu'un appareil publie bien, ou diagnostiquer une commande qui semble ignorée côté bridge.

## 7. Exemples réels (relevés sur skbox-mini)

Les tableaux ci-dessus donnent les *structures génériques* de topics telles qu'écrites dans le code (`{friendlyName}`, `{deviceId}`, `{type}`...). Voici les topics réellement utilisés en base aujourd'hui, pour donner un ancrage concret :

| Appareil | Protocole | `mqttTopic` réel |
|---|---|---|
| Température Salon | rf433 | `rfxcom2mqtt/devices/0xA702` |
| Température extérieure | rf433 | `rfxcom2mqtt/devices/0xE701` |
| Température sous-sol | rf433 | `rfxcom2mqtt/devices/0x7801` |
| Electricité (capteur conso) | rf433 | `rfxcom2mqtt/devices/0x8002` |
| PRISE IKEA TRETAKT 1 | zigbee | `zigbee2mqtt/PRISE IKEA TRETAKT 1` |
| Lampe chambre clara | zigbee | `zigbee2mqtt/Lampe chambre clara` |
| Lumière balcon | zigbee | `zigbee2mqtt/Lumière balcon` |
| shelley1Gen4-chaudiere (relais chaudière) | zigbee | `zigbee2mqtt/shelley1Gen4-chaudiere` |
| PRESENCE ATELIER | zigbee | `zigbee2mqtt/PRESENCE ATELIER` |
| Ventilation ss sol | zigbee | `zigbee2mqtt/Ventilation ss sol` |

Pour ces devices, une commande part donc par exemple sur `zigbee2mqtt/Lampe chambre clara/set`, ou une lecture d'état arrive sur `rfxcom2mqtt/devices/0xA702`. Le `friendlyName` Zigbee est le nom donné à l'appareil dans Zigbee2MQTT au moment de l'appairage (modifiable côté Z2M) — c'est pour ça qu'on trouve aussi des devices non renommés, encore identifiés par leur adresse IEEE brute (ex. `0x0c4314fffe1c9a9b`).

## 8. Notes

- Skbox ne se connecte qu'à **un seul broker** (`MQTT_URL`, Mosquitto) : Zigbee2MQTT et rfxcom2mqtt y publient également, Skbox ne leur parle jamais en direct.
- Aucun topic n'est retenu (retained) côté Skbox lui-même ; les topics `bridge/devices` et `+/availability` côté Z2M le sont en revanche, d'où l'attention portée à l'ordre d'abonnement au démarrage (§1).
