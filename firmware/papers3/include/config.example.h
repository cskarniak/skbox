// Copier ce fichier en include/config.h (ignoré par git) puis l'adapter.
#pragma once

// --- Réseau -------------------------------------------------------------
#define WIFI_SSID "MonWifi"
#define WIFI_PASS "motdepasse"

// URL de l'API skbox, sans slash final (même réseau local que skbox-mini).
// Sur skbox-mini, l'API n'écoute que sur 127.0.0.1 : passer par le virtual host nginx.
#define SKBOX_URL "http://skbox.lan.home"

// Serveur DNS qui résout le nom ci-dessus (skbox-mini). Commenter pour garder celui du DHCP.
#define SKBOX_DNS "192.168.1.11"

// --- Capteurs affichés --------------------------------------------------
// Ids skbox séparés par des virgules, dans l'ordre d'affichage (6 emplacements,
// remplis colonne par colonne ; les emplacements non utilisés restent « libres »).
// Actuellement : Extérieur, Sous-sol, Séjour. Ids visibles dans Swagger (GET /api/devices).
// Vide = tous les capteurs de température visibles (les 6 premiers).
#define SENSOR_IDS "id_exterieur,id_sous_sol,id_sejour"

// --- Prises et lumières (page Maison) ------------------------------------
// Ids skbox séparés par des virgules, dans l'ordre d'affichage (6 au plus). Liste explicite
// uniquement : ne pas y mettre la ventilation ni le relais de la chaudière.
#define SWITCH_IDS "id_lampe,id_prise"

// --- Rythme -------------------------------------------------------------
#define REFRESH_S 300   // rafraîchissement automatique (secondes)
#define IDLE_S 45       // inactivité avant mise en veille (secondes)

// Durées de dérogation proposées (minutes) et choix par défaut (index).
#define BOOST_DURATIONS {60, 120, 240, 480}
#define BOOST_DEFAULT_INDEX 1

// Volume du buzzer intégré (bips de toucher, confirmation, erreur) : 0 = muet ... 255.
#define BEEP_VOLUME 128
