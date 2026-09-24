// Copier ce fichier en include/config.h (ignoré par git) puis l'adapter.
#pragma once

// --- Réseau -------------------------------------------------------------
#define WIFI_SSID "MonWifi"
#define WIFI_PASS "motdepasse"

// URL de l'API skbox, sans slash final (même réseau local que skbox-mini).
#define SKBOX_URL "http://192.168.1.50:3001"

// --- Capteurs affichés --------------------------------------------------
// Ids skbox séparés par des virgules, dans l'ordre d'affichage (6 emplacements,
// remplis colonne par colonne ; les emplacements non utilisés restent « libres »).
// Actuellement : Extérieur, Sous-sol, Séjour. Ids visibles dans Swagger (GET /api/devices).
// Vide = tous les capteurs de température visibles (les 6 premiers).
#define SENSOR_IDS "id_exterieur,id_sous_sol,id_sejour"

// --- Rythme -------------------------------------------------------------
#define REFRESH_S 300   // rafraîchissement automatique (secondes)
#define IDLE_S 45       // inactivité avant mise en veille (secondes)

// Durées de dérogation proposées (minutes) et choix par défaut (index).
#define BOOST_DURATIONS {60, 120, 240, 480}
#define BOOST_DEFAULT_INDEX 1
