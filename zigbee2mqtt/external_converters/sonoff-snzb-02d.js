// Sonoff SNZB-02D (température/humidité avec écran) : remplace la définition fournie par
// Zigbee2MQTT, identique à celle d'origine sauf le seuil d'envoi de la température.
//
// Par défaut, Zigbee2MQTT configure ce capteur pour n'envoyer la température qu'à partir de 1 °C
// d'écart (change: 100, en centièmes de °C), au plus tard toutes les heures : trop grossier pour
// piloter la chaudière (hystérésis 0,3 °C). On descend à 0,2 °C (change: 20), comme les capteurs
// déjà appairés avec l'ancienne version.
//
// Appliqué automatiquement à la configuration d'un capteur à l'appairage. Un capteur déjà appairé
// garde ses anciens réglages tant qu'on ne le reconfigure pas (bouton du capteur + « Reconfigurer »
// ou onglet Rapports de l'interface Zigbee2MQTT).
//
// Installation : copier ce fichier dans ~/zigbee2mqtt/data/ et déclarer dans configuration.yaml :
//   external_converters:
//     - sonoff-snzb-02d.js
const m = require('zigbee-herdsman-converters/lib/modernExtend');

module.exports = {
    zigbeeModel: ['SNZB-02D'],
    model: 'SNZB-02D',
    vendor: 'SONOFF',
    description: 'Temperature and humidity sensor with screen',
    extend: [
        m.battery(),
        m.temperature({reporting: {min: '10_SECONDS', max: '1_HOUR', change: 20}}),
        m.humidity(),
        m.bindCluster({cluster: 'genPollCtrl', clusterType: 'input'}),
    ],
};
