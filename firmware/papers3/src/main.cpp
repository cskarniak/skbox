// Afficheur e-ink skbox pour M5Stack PaperS3 — 4 pages (onglets de l'en-tête) :
// - Maison : températures + prises et lumières (allumer / éteindre d'un toucher)
// - Chaudière : état, mode et pilotage (dérogation par niveau et durée, fin de dérogation,
//   arrêt / reprise de la régulation, arrêt confirmé par un second appui)
// - Alarme : réservée au futur système d'alarme ; Libre : réservée
// Données : GET /api/display/summary.
// - Économie d'énergie : Wi-Fi coupé et light sleep après IDLE_S d'inactivité ;
//   réveil par toucher de l'écran ou par la minuterie de rafraîchissement.

#include <M5Unified.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_sleep.h>
#include <lwip/dns.h>
#include <Preferences.h>
#include <esp_system.h>
#include <esp32s3/rom/rtc.h>
#include <vector>

#if __has_include("config.h")
#include "config.h"
#else
#error "Copier include/config.example.h en include/config.h et l'adapter"
#endif

#ifndef SWITCH_IDS
#define SWITCH_IDS ""  // prises / lumières de la page Maison (ids skbox séparés par des virgules)
#endif

#ifndef BEEP_VOLUME
#define BEEP_VOLUME 128  // buzzer intégré (GPIO21) : 0 = muet ... 255
#endif

#define D M5.Display
// Journal de diagnostic sur l'USB série (pio device monitor, 115200 bauds).
#define LOG(...) Serial.printf(__VA_ARGS__)

// ---------------------------------------------------------------- Données

struct Sensor {
  String name, room, lastSeen;
  float temp = NAN, humidity = NAN;
  int battery = -1;
  bool online = true;
};

struct Level {
  String key, label;
  float temp = NAN;
};

struct Boiler {
  bool configured = false, enabled = true, relayOnline = false, heating = false, scheduleActive = false;
  String activeLevel, activeLabel, exception;
  bool hasOverride = false;
  String overrideLevel, overrideLabel, overrideUntil;
  String mode, programName;  // mode : "override" | "program" | "default"
  bool hasNext = false;
  String nextDay, nextTime, nextLabel;  // nextDay : "" (aujourd'hui), "demain" ou "sam."
  float targetTemp = NAN, currentTemp = NAN;
};

struct Switch {
  String id, name, room;
  bool on = false, online = true;
};

static std::vector<Sensor> sensors;
static std::vector<Switch> switches;
static std::vector<Level> levels;
static Boiler boiler;
static bool hasData = false;
static String updatedAt, updatedDate, errorMsg;

// ---------------------------------------------------------------- UI

enum Action { A_REFRESH, A_DURATION, A_BOOST, A_CANCEL, A_TOGGLE, A_PAGE, A_SWITCH };
struct Button {
  int16_t x, y, w, h;
  Action action;
  int arg;
};
static std::vector<Button> buttons;

static const int durations[] = BOOST_DURATIONS;
static const int N_DURATIONS = sizeof(durations) / sizeof(durations[0]);
static int durationIndex = BOOST_DEFAULT_INDEX;

// Emplacements de capteurs : 2 colonnes x 3 lignes, remplis colonne par colonne.
// Les emplacements sans capteur restent réservés (cadre gris « libre »).
static const int SENSOR_SLOTS = 6;

// Pages, choisies par les onglets de l'en-tête. Alarme et Libre sont des écrans d'attente,
// sans appel réseau, réservés pour plus tard.
enum Page { P_HOME, P_BOILER, P_ALARM, P_FREE, N_PAGES };
static const char* const PAGE_LABELS[N_PAGES] = {"Maison", "Chaudière", "Alarme", "Libre"};
static const int TAB_W[N_PAGES] = {104, 132, 104, 90};
static int page = P_HOME;

// Vrai de la mise en veille jusqu'au réveil par toucher (y compris pendant les rafraîchissements
// périodiques) : l'en-tête l'indique, pour savoir que le prochain toucher ne fera que réveiller.
static bool asleep = false;
static bool pendingRefresh = false;  // rechargement différé après un réveil par toucher
static uint32_t wakeAt = 0;
static uint32_t refreshAt = 0;  // rechargement programmé (confirmation de l'état d'une prise)

static uint32_t confirmStopUntil = 0;  // fenêtre de confirmation de l'arrêt de la régulation
static uint32_t lastActivity = 0;
static uint32_t lastFetch = 0;    // dernier appel réussi
static uint32_t lastAttempt = 0;  // dernier appel, réussi ou non
static int failures = 0;          // échecs consécutifs

// Délai avant le prochain rechargement automatique : REFRESH_S en temps normal ; après un échec,
// 30 s puis doublé à chaque nouvel échec (plafonné à REFRESH_S), pour ne pas marteler skbox ni
// faire clignoter l'écran quand la box est injoignable.
static uint32_t refreshDelayMs() {
  uint32_t normal = REFRESH_S * 1000UL;
  if (!failures) return normal;
  uint32_t d = 30000UL << (failures > 5 ? 4 : failures - 1);
  return d < normal ? d : normal;
}

static bool refreshDue() { return millis() - lastAttempt >= refreshDelayMs(); }

static const uint16_t C_BLACK = TFT_BLACK;
static const uint16_t C_WHITE = TFT_WHITE;
static const uint16_t C_GRAY = 0x8410;       // gris moyen
static const uint16_t C_LIGHTGRAY = 0xC618;  // gris clair

// ---------------------------------------------------------------- Utilitaires

static String fmtTemp(float v) {
  if (isnan(v)) return "--";
  char buf[12];
  snprintf(buf, sizeof(buf), "%.1f", v);
  for (char* p = buf; *p; ++p)
    if (*p == '.') *p = ',';
  return String(buf);
}

static String fmtDuration(int minutes) {
  if (minutes % 60 == 0) return String(minutes / 60) + " h";
  return String(minutes) + " min";
}

static void popUtf8(String& s) {
  while (s.length() && (s[s.length() - 1] & 0xC0) == 0x80) s.remove(s.length() - 1);
  if (s.length()) s.remove(s.length() - 1);
}

// Tronque un texte (police courante) pour qu'il tienne dans maxW pixels.
static String fit(String s, int maxW) {
  if (D.textWidth(s.c_str()) <= maxW) return s;
  while (s.length() > 1 && D.textWidth((s + "...").c_str()) > maxW) popUtf8(s);
  return s + "...";
}

static void text(const String& s, int x, int y, const lgfx::IFont* font, textdatum_t datum,
                 uint16_t color = C_BLACK, float size = 1) {
  D.setFont(font);
  D.setTextSize(size);
  D.setTextDatum(datum);
  D.setTextColor(color);
  D.drawString(s.c_str(), x, y);
}

// Grand nombre + signe degré dessiné (les polices FreeSans n'ont pas le caractère °).
// Retourne la largeur totale dessinée.
static int bigTemp(float v, int x, int y, uint16_t color = C_BLACK, float scale = 1) {
  String s = fmtTemp(v);
  text(s, x, y, &fonts::FreeSansBold24pt7b, textdatum_t::top_left, color, scale);
  int w = D.textWidth(s.c_str());
  int r = (int)(6 * scale);
  int cx = x + w + (int)(9 * scale), cy = y + (int)(7 * scale);
  for (int k = 0; k < (int)(2 * scale); ++k) D.drawCircle(cx, cy, r - k, color);
  return w + (int)(18 * scale);
}

static void addButton(int x, int y, int w, int h, Action a, int arg = 0) {
  buttons.push_back({(int16_t)x, (int16_t)y, (int16_t)w, (int16_t)h, a, arg});
}

// Bouton : filled = fond noir / texte blanc ; bold = cadre épais.
static void drawButton(int x, int y, int w, int h, const String& line1, const String& line2,
                       bool filled, bool bold, Action a, int arg = 0) {
  if (filled) {
    D.fillRoundRect(x, y, w, h, 10, C_BLACK);
  } else {
    D.drawRoundRect(x, y, w, h, 10, C_BLACK);
    if (bold) {
      D.drawRoundRect(x + 1, y + 1, w - 2, h - 2, 9, C_BLACK);
      D.drawRoundRect(x + 2, y + 2, w - 4, h - 4, 8, C_BLACK);
    }
  }
  uint16_t c = filled ? C_WHITE : C_BLACK;
  if (line2.length()) {
    text(line1, x + w / 2, y + h / 2 - 12, &fonts::efontJA_24, textdatum_t::middle_center, c);
    text(line2, x + w / 2, y + h / 2 + 14, &fonts::efontJA_16, textdatum_t::middle_center, c);
  } else {
    text(line1, x + w / 2, y + h / 2, &fonts::efontJA_24, textdatum_t::middle_center, c);
  }
  addButton(x, y, w, h, a, arg);
}

// ---------------------------------------------------------------- Diagnostic
// Étapes de la veille notées en mémoire non volatile (NVS), qui survit à une coupure
// d'alimentation. Au démarrage suivant, la raison du reset et la dernière étape notée sont
// jointes à chaque requête (&rst=&last=&boot=&wk=) : lisibles dans le journal nginx de
// skbox-mini, sans moniteur série. Écriture seulement quand l'étape change (≈ 2 par cycle).
enum Phase : uint8_t { PH_AWAKE = 1, PH_SLEEPING = 2, PH_WOKE_TIMER = 3, PH_WOKE_TOUCH = 4 };
static Preferences diag;
static uint8_t phase = 0, lastPhaseAtBoot = 0;
static int resetReason = 0, rawResetReason = 0;
static uint32_t bootCount = 0;
static char lastWake = '-';  // t = minuterie, p = toucher (pression)

static void setPhase(uint8_t p) {
  if (p == phase) return;
  phase = p;
  diag.putUChar("phase", p);
}

static void diagBegin() {
  diag.begin("diag", false);
  lastPhaseAtBoot = diag.getUChar("phase", 0);
  bootCount = diag.getUInt("boots", 0) + 1;
  diag.putUInt("boots", bootCount);
  resetReason = (int)esp_reset_reason();
  rawResetReason = (int)rtc_get_reset_reason(0);  // code matériel brut (0x15 = reset par l'USB, etc.)
  setPhase(PH_AWAKE);
}

// ---------------------------------------------------------------- Sons
// Buzzer passif : tone() est non bloquant, d'où les petites attentes entre deux notes.

static void beepClick() { M5.Speaker.tone(2200, 25); }

static void beepOk() {
  M5.Speaker.tone(1400, 60);
  delay(80);
  M5.Speaker.tone(2100, 90);
}

static void beepError() { M5.Speaker.tone(330, 350); }

// ---------------------------------------------------------------- Réseau

static bool wifiStarted = false;
static uint32_t wifiStartedAt = 0;
// Point d'accès de la dernière connexion réussie (la RAM est conservée pendant la veille) :
// se reconnecter directement à ce canal / BSSID évite le balayage des canaux, soit environ 1 s
// de gagnée à chaque réveil.
static uint8_t lastBssid[6];
static int32_t lastChannel = 0;
static bool fastConnect = false;  // tentative rapide en cours (repli sur la connexion normale)

static void updateStatusLine();
static String statusNote;  // message transitoire du bloc d'état (ex. « connexion Wi-Fi… »)

// Lance la connexion sans attendre (au réveil), pour qu'elle soit prête au premier toucher.
static void wifiStart() {
  if (wifiStarted || WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  fastConnect = lastChannel > 0;
  if (fastConnect) WiFi.begin(WIFI_SSID, WIFI_PASS, lastChannel, lastBssid, true);
  else WiFi.begin(WIFI_SSID, WIFI_PASS);
  wifiStarted = true;
  wifiStartedAt = millis();
}

// À appeler régulièrement pendant l'attente : si la connexion rapide n'a pas abouti en 4 s (point
// d'accès ou canal changé), on repart sur une connexion normale avec balayage.
static void wifiPoll() {
  if (fastConnect && WiFi.status() != WL_CONNECTED && millis() - wifiStartedAt > 4000) {
    fastConnect = false;
    lastChannel = 0;
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    wifiStartedAt = millis();
  }
  if (WiFi.status() == WL_CONNECTED && !lastChannel) {
    lastChannel = WiFi.channel();
    memcpy(lastBssid, WiFi.BSSID(), 6);
  }
}

// Le DNS fourni par le DHCP (box) ne connaît pas les noms locaux servis par skbox-mini. Appliqué à
// chaque appel, pas seulement à la connexion : une connexion lancée en arrière-plan (réveil par
// toucher) ou un renouvellement DHCP remettrait sinon le DNS de la box.
static void applyDns() {
#ifdef SKBOX_DNS
  IPAddress dnsIp;
  if (dnsIp.fromString(SKBOX_DNS)) {
    ip_addr_t d = IPADDR4_INIT((uint32_t)dnsIp);
    dns_setserver(0, &d);
  }
#endif
}

static bool wifiUp() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiStart();
    uint32_t start = millis();
    statusNote = "connexion Wi-Fi...";
    updateStatusLine();  // retour visuel : l'attente peut durer plusieurs secondes
    while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) {
      wifiPoll();
      delay(50);
    }
    wifiPoll();
    statusNote = "";
    if (WiFi.status() != WL_CONNECTED) {
      LOG("[wifi] échec connexion à %s (statut %d)\n", WIFI_SSID, (int)WiFi.status());
      return false;
    }
    LOG("[wifi] connecté en %lu ms, IP %s, RSSI %d dBm\n", (unsigned long)(millis() - start),
        WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
  }
  applyDns();
  return true;
}

static void wifiDown() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  wifiStarted = false;
}

// Retourne le code HTTP, ou -1 si le Wi-Fi ou la connexion échoue.
static int httpCall(const char* method, const String& path, const String& body, String* response) {
  if (!wifiUp()) {
    errorMsg = "Wi-Fi indisponible";
    return -1;
  }
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(String(SKBOX_URL) + path)) {
    errorMsg = "URL skbox invalide";
    return -1;
  }
  if (body.length()) http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest(method, body);
  LOG("[http] %s %s -> %d%s\n", method, path.c_str(), code, code <= 0 ? (" (" + http.errorToString(code) + ")").c_str() : "");
  if (code > 0 && response) *response = http.getString();
  http.end();
  if (code <= 0) errorMsg = "skbox injoignable";
  else if (code >= 300) errorMsg = "Erreur API " + String(code);
  return code;
}

static bool fetchSummaryOnce();

static bool fetchSummary() {
  lastAttempt = millis();
  bool ok = fetchSummaryOnce();
  failures = ok ? 0 : failures + 1;
  return ok;
}

static bool fetchSummaryOnce() {
  // bat / mv / chg : ignorés par l'API, mais visibles dans le journal nginx de skbox-mini, ce qui
  // permet de suivre la batterie à distance (le moniteur série est peu utilisable sous macOS).
  String path = "/api/display/summary?bat=" + String((int)M5.Power.getBatteryLevel()) +
                "&mv=" + String((int)M5.Power.getBatteryVoltage()) + "&chg=" + String((int)M5.Power.isCharging());
  path += "&rst=" + String(resetReason) + "&rr=" + String(rawResetReason) + "&last=" + String((int)lastPhaseAtBoot) + "&boot=" + String(bootCount) +
          "&wk=" + String(lastWake);
  if (strlen(SENSOR_IDS)) path += "&devices=" + String(SENSOR_IDS);
  if (strlen(SWITCH_IDS)) path += "&switches=" + String(SWITCH_IDS);
  String body;
  if (httpCall("GET", path, "", &body) != 200) return false;

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    errorMsg = "Réponse illisible";
    LOG("[json] réponse illisible (%u octets)\n", body.length());
    return false;
  }

  sensors.clear();
  for (JsonObject t : doc["temperatures"].as<JsonArray>()) {
    Sensor s;
    s.name = (const char*)(t["name"] | "");
    s.room = (const char*)(t["room"] | "");
    s.lastSeen = (const char*)(t["lastSeen"] | "");
    s.temp = t["temp"].isNull() ? NAN : t["temp"].as<float>();
    s.humidity = t["humidity"].isNull() ? NAN : t["humidity"].as<float>();
    s.battery = t["battery"].isNull() ? -1 : t["battery"].as<int>();
    s.online = t["online"] | false;
    sensors.push_back(s);
  }

  switches.clear();
  for (JsonObject t : doc["switches"].as<JsonArray>()) {
    Switch sw;
    sw.id = (const char*)(t["id"] | "");
    sw.name = (const char*)(t["name"] | "");
    sw.room = (const char*)(t["room"] | "");
    sw.on = t["on"] | false;
    sw.online = t["online"] | false;
    switches.push_back(sw);
  }

  levels.clear();
  for (JsonObject l : doc["levels"].as<JsonArray>()) {
    Level lv;
    lv.key = (const char*)(l["key"] | "");
    lv.label = (const char*)(l["label"] | "");
    lv.temp = l["temp"].isNull() ? NAN : l["temp"].as<float>();
    levels.push_back(lv);
  }

  JsonObject b = doc["boiler"];
  boiler.configured = b["configured"] | false;
  boiler.enabled = b["enabled"] | false;
  boiler.relayOnline = b["relayOnline"] | false;
  boiler.heating = b["heating"] | false;
  boiler.scheduleActive = b["scheduleActive"] | false;
  boiler.activeLevel = (const char*)(b["activeLevel"] | "");
  boiler.activeLabel = (const char*)(b["activeLabel"] | "");
  boiler.exception = (const char*)(b["exception"] | "");
  boiler.targetTemp = b["targetTemp"].isNull() ? NAN : b["targetTemp"].as<float>();
  boiler.currentTemp = b["currentTemp"].isNull() ? NAN : b["currentTemp"].as<float>();
  boiler.hasOverride = !b["override"].isNull();
  boiler.overrideLevel = (const char*)(b["override"]["level"] | "");
  boiler.overrideLabel = (const char*)(b["override"]["label"] | "");
  boiler.overrideUntil = (const char*)(b["override"]["until"] | "");
  boiler.mode = (const char*)(b["mode"] | "");
  boiler.programName = (const char*)(b["programName"] | "");
  boiler.hasNext = !b["next"].isNull();
  boiler.nextDay = (const char*)(b["next"]["day"] | "");
  boiler.nextTime = (const char*)(b["next"]["time"] | "");
  boiler.nextLabel = (const char*)(b["next"]["label"] | "");

  updatedAt = (const char*)(doc["localTime"] | "");
  updatedDate = (const char*)(doc["localDate"] | "");
  hasData = true;
  errorMsg = "";
  lastFetch = millis();
  LOG("[data] %u capteurs, %u niveaux, chaudière %s\n", sensors.size(), levels.size(),
      boiler.configured ? boiler.activeLabel.c_str() : "non configurée");
  return true;
}

// ---------------------------------------------------------------- Rendu

// Bloc d'état de l'en-tête (entre les onglets et « Actualiser »), redessinable seul :
// ligne 1 = date et heure de mise à jour (ou erreur), ligne 2 = batterie et veille.
static const int STATUS_X = 472, STATUS_W = 308, STATUS_R = STATUS_X + STATUS_W;

static void drawStatusLine() {
  D.fillRect(STATUS_X, 8, STATUS_W, 44, C_WHITE);
  String l1;
  if (statusNote.length()) l1 = statusNote;
  else if (errorMsg.length()) l1 = "! " + errorMsg;
  else if (hasData) l1 = updatedDate + " · maj " + updatedAt;

  int bat = M5.Power.getBatteryLevel();
  int mv = M5.Power.getBatteryVoltage();
  String l2 = bat >= 0 ? String(bat) + " %" : "? %";
  if (mv > 0) {
    char vb[10];
    snprintf(vb, sizeof(vb), " · %d,%02d V", mv / 1000, (mv % 1000) / 10);
    l2 += vb;
  }
  if (M5.Power.isCharging() == m5::Power_Class::is_charging) l2 += " · charge";
  if (asleep) l2 += " · en veille";

  D.setFont(&fonts::efontJA_16);
  D.setTextSize(1);
  text(fit(l1, STATUS_W), STATUS_R, 19, &fonts::efontJA_16, textdatum_t::middle_right);
  text(fit(l2, STATUS_W), STATUS_R, 41, &fonts::efontJA_16, textdatum_t::middle_right);
}

// Mise à jour partielle et rapide du seul bloc d'état (entrée / sortie de veille).
static void updateStatusLine() {
  D.setEpdMode(epd_mode_t::epd_fast);
  D.startWrite();
  drawStatusLine();
  D.endWrite();
  D.display(STATUS_X, 8, STATUS_W, 44);
}

static void drawHeader() {
  // Onglets (l'onglet courant est plein).
  int tx = 16;
  for (int i = 0; i < N_PAGES; ++i) {
    drawButton(tx, 8, TAB_W[i], 44, PAGE_LABELS[i], "", i == page, false, A_PAGE, i);
    tx += TAB_W[i] + 6;
  }
  drawStatusLine();
  drawButton(796, 8, 148, 44, "Actualiser", "", false, false, A_REFRESH);
  D.drawFastHLine(0, 60, 960, C_BLACK);
}

// Page Maison : grille de 4 colonnes x 3 lignes de cartes identiques. Colonnes 1-2 : températures,
// colonnes 3-4 : prises et lumières. Remplissage colonne par colonne.
static const int CARD_X0 = 16, CARD_Y0 = 72, CARD_W = 224, CARD_H = 146, CARD_GAP = 10;

static void cardPos(int col, int row, int& x, int& y) {
  x = CARD_X0 + col * (CARD_W + CARD_GAP);
  y = CARD_Y0 + row * (CARD_H + CARD_GAP);
}

static void drawFreeCard(int x, int y) {
  D.drawRoundRect(x, y, CARD_W, CARD_H, 10, C_LIGHTGRAY);
  text("libre", x + CARD_W / 2, y + CARD_H / 2, &fonts::efontJA_16, textdatum_t::middle_center, C_LIGHTGRAY);
}

static void drawSensors() {
  const int cw = CARD_W, ch = CARD_H;

  for (int i = 0; i < SENSOR_SLOTS; ++i) {
    int x, y;
    cardPos(i / 3, i % 3, x, y);

    if ((size_t)i >= sensors.size()) {  // emplacement réservé pour un ajout ultérieur
      drawFreeCard(x, y);
      continue;
    }

    const Sensor& s = sensors[i];
    uint16_t c = s.online ? C_BLACK : C_GRAY;
    D.drawRoundRect(x, y, cw, ch, 10, c);
    D.drawRoundRect(x + 1, y + 1, cw - 2, ch - 2, 9, c);
    D.setFont(&fonts::efontJA_24);
    D.setTextSize(1);
    text(fit(s.name, cw - 24), x + 12, y + 10, &fonts::efontJA_24, textdatum_t::top_left, c);
    bigTemp(s.temp, x + 12, y + 50, c, 1.5f);

    String info;
    if (!s.online) info = "hors ligne " + s.lastSeen;
    else if (!isnan(s.humidity)) info = String((int)lroundf(s.humidity)) + " %";
    text(info, x + cw - 12, y + ch - 10, &fonts::efontJA_16, textdatum_t::bottom_right, c);
    if (s.battery >= 0 && s.battery <= 20) {
      text("pile " + String(s.battery) + " %", x + cw - 12, y + 12, &fonts::efontJA_16, textdatum_t::top_right, C_BLACK);
    }
  }
}

// Prises et lumières (colonnes 3-4 de la page Maison), même format que les températures.
// Carte entière = bouton : allumée = fond noir, texte blanc ; éteinte = fond blanc.
static const int SW_SLOTS = 6;
static const int SW_X = CARD_X0 + 2 * (CARD_W + CARD_GAP), SW_Y = CARD_Y0;
static const int SW_W = 2 * CARD_W + CARD_GAP, SW_H = 3 * CARD_H + 2 * CARD_GAP;

static void drawSwitches() {
  const int cw = CARD_W, ch = CARD_H;
  for (int i = 0; i < SW_SLOTS; ++i) {
    int x, y;
    cardPos(2 + i / 3, i % 3, x, y);
    if ((size_t)i >= switches.size()) {
      drawFreeCard(x, y);
      continue;
    }

    const Switch& sw = switches[i];
    bool lit = sw.online && sw.on;
    uint16_t fg = lit ? C_WHITE : sw.online ? C_BLACK : C_GRAY;
    if (lit) {
      D.fillRoundRect(x, y, cw, ch, 10, C_BLACK);
    } else {
      D.drawRoundRect(x, y, cw, ch, 10, fg);
      D.drawRoundRect(x + 1, y + 1, cw - 2, ch - 2, 9, fg);
    }
    D.setFont(&fonts::efontJA_24);
    D.setTextSize(1);
    text(fit(sw.name, cw - 24), x + 12, y + 10, &fonts::efontJA_24, textdatum_t::top_left, fg);
    String state = !sw.online ? "hors ligne" : sw.on ? "allumé" : "éteint";
    text(state, x + 12, y + 58, &fonts::efontJA_24, textdatum_t::top_left, fg, sw.online ? 1.5f : 1.0f);
    if (sw.room.length()) {
      D.setFont(&fonts::efontJA_16);
      text(fit(sw.room, cw - 24), x + cw - 12, y + ch - 10, &fonts::efontJA_16, textdatum_t::bottom_right, fg);
    }
    addButton(x, y, cw, ch, A_SWITCH, i);
  }
}

// Page Chaudière, plein écran : état à gauche, commandes à droite.
static void drawBoilerPage() {
  const int lx = 16, ly = 70, lw = 440, lh = 462;
  const int x = lx + 20, w = lw - 40;
  D.drawRoundRect(lx, ly, lw, lh, 12, C_BLACK);
  text("Chaudière", x, ly + 14, &fonts::efontJA_24, textdatum_t::top_left, C_BLACK, 1.25f);

  if (!boiler.configured) {
    text("Non configurée dans skbox", 480, 300, &fonts::efontJA_24, textdatum_t::middle_center, C_GRAY);
    return;
  }

  // État du brûleur : indicateur non cliquable. Badge noir seulement quand elle chauffe ; sinon
  // simple texte, sans cadre, pour ne pas ressembler à un bouton. Régulation arrêtée : rien ici,
  // le badge ARRÊT du mode le dit déjà.
  if (boiler.enabled && boiler.heating) {
    D.setFont(&fonts::efontJA_24);
    int bw = D.textWidth("CHAUFFE") + 24;
    int bx = lx + lw - 20 - bw;
    D.fillRoundRect(bx, ly + 12, bw, 36, 8, C_BLACK);
    text("CHAUFFE", bx + bw / 2, ly + 30, &fonts::efontJA_24, textdatum_t::middle_center, C_WHITE);
  } else if (boiler.enabled) {
    text("ne chauffe pas", lx + lw - 20, ly + 30, &fonts::efontJA_24, textdatum_t::middle_right);
  }

  // Températures
  int tw = bigTemp(boiler.currentTemp, x, ly + 66, C_BLACK, 2.0f);
  text("cible", x + tw + 16, ly + 84, &fonts::efontJA_16, textdatum_t::top_left, C_GRAY);
  text(fmtTemp(boiler.targetTemp) + "°", x + tw + 16, ly + 104, &fonts::efontJA_24, textdatum_t::top_left);

  // Mode actif : badge (FORCÉ / PROGRAMME / DÉFAUT / ARRÊT) + niveau, puis origine, puis prochain changement.
  String tag, l2, l3;
  bool forced = boiler.hasOverride || boiler.mode == "override";
  if (!boiler.enabled) {
    tag = "ARRÊT";
    l2 = "Régulation arrêtée";
  } else if (forced) {
    tag = "FORCÉ";
    l2 = "jusqu'à " + boiler.overrideUntil;
    if (boiler.hasNext) l3 = "ensuite " + boiler.nextLabel + " (programme)";
  } else if (boiler.programName.length()) {
    tag = "PROGRAMME";
    l2 = boiler.exception.length() ? boiler.exception + " : " + boiler.programName : boiler.programName;
  } else {
    tag = "DÉFAUT";
    l2 = "aucun programme aujourd'hui";
  }
  if (boiler.enabled && !forced && boiler.hasNext) {
    String when = boiler.nextDay.length() ? boiler.nextDay + " " + boiler.nextTime : "à " + boiler.nextTime;
    l3 = "puis " + boiler.nextLabel + " " + when;
  }
  D.setFont(&fonts::efontJA_24);
  D.setTextSize(1);
  const int ty = ly + 176, th = 36;
  int tagW = D.textWidth(tag.c_str()) + 20;
  if (forced || !boiler.enabled) {
    D.fillRoundRect(x, ty, tagW, th, 6, C_BLACK);
    text(tag, x + tagW / 2, ty + th / 2, &fonts::efontJA_24, textdatum_t::middle_center, C_WHITE);
  } else {
    D.drawRoundRect(x, ty, tagW, th, 6, C_BLACK);
    D.drawRoundRect(x + 1, ty + 1, tagW - 2, th - 2, 5, C_BLACK);
    text(tag, x + tagW / 2, ty + th / 2, &fonts::efontJA_24, textdatum_t::middle_center);
  }
  if (boiler.enabled) {
    D.setFont(&fonts::efontJA_24);
    text(fit(boiler.activeLabel, w - tagW - 12), x + tagW + 12, ty + th / 2, &fonts::efontJA_24, textdatum_t::middle_left);
  }
  D.setFont(&fonts::efontJA_24);
  text(fit(l2, w), x, ly + 226, &fonts::efontJA_24, textdatum_t::top_left);
  if (l3.length()) text(fit(l3, w), x, ly + 260, &fonts::efontJA_24, textdatum_t::top_left);
  if (!boiler.relayOnline) text("Relais hors ligne !", x, ly + lh - 20, &fonts::efontJA_24, textdatum_t::bottom_left);

  // ---- Commandes
  const int rx = 472, rw = 472;
  const int cx = rx + 20, cw = rw - 40;
  D.drawRoundRect(rx, ly, rw, lh, 12, C_BLACK);

  text("Durée de la dérogation", cx, ly + 14, &fonts::efontJA_16, textdatum_t::top_left, C_GRAY);
  const int dg = 8, dw = (cw - dg * (N_DURATIONS - 1)) / N_DURATIONS;
  for (int i = 0; i < N_DURATIONS; ++i) {
    drawButton(cx + i * (dw + dg), ly + 38, dw, 52, fmtDuration(durations[i]), "", i == durationIndex, false,
               A_DURATION, i);
  }

  text("Forcer un niveau", cx, ly + 108, &fonts::efontJA_16, textdatum_t::top_left, C_GRAY);
  const int lg = 8, lbw = (cw - 2 * lg) / 3, lbh = 72;
  int slot = 0;
  for (size_t i = 0; i < levels.size() && slot < 6; ++i, ++slot) {
    int bx = cx + (slot % 3) * (lbw + lg);
    int by = ly + 132 + (slot / 3) * (lbh + lg);
    bool active = levels[i].key == boiler.activeLevel;
    drawButton(bx, by, lbw, lbh, levels[i].label, fmtTemp(levels[i].temp) + "°", false, active, A_BOOST, (int)i);
  }
  if (boiler.hasOverride && slot < 6) {
    int bx = cx + (slot % 3) * (lbw + lg);
    int by = ly + 132 + (slot / 3) * (lbh + lg);
    drawButton(bx, by, lbw, lbh, "Annuler", "dérogation", true, false, A_CANCEL);
  }

  // Arrêt / reprise de la régulation
  bool confirming = confirmStopUntil && millis() < confirmStopUntil;
  String label = !boiler.enabled ? "Reprendre la régulation"
                 : confirming    ? "Confirmer l'arrêt ?"
                                 : "Arrêter la régulation";
  drawButton(cx, ly + lh - 20 - 60, cw, 60, label, "", confirming, false, A_TOGGLE);
}

static void drawPlaceholderPage(const char* title, const char* subtitle) {
  D.drawRoundRect(16, 72, 928, 460, 12, C_LIGHTGRAY);
  text(title, 480, 270, &fonts::efontJA_24, textdatum_t::middle_center, C_GRAY, 1.5);
  text(subtitle, 480, 320, &fonts::efontJA_24, textdatum_t::middle_center, C_LIGHTGRAY);
}

static void drawPage() {
  drawHeader();
  if (page == P_ALARM) {
    drawPlaceholderPage("Système d'alarme", "à venir");
  } else if (page == P_FREE) {
    drawPlaceholderPage("Page libre", "à définir");
  } else if (!hasData) {
    text(errorMsg.length() ? errorMsg : "Connexion à skbox...", 480, 290, &fonts::efontJA_24,
         textdatum_t::middle_center, C_BLACK, 1.5);
    text(SKBOX_URL, 480, 340, &fonts::efontJA_16, textdatum_t::middle_center, C_GRAY);
  } else if (page == P_BOILER) {
    drawBoilerPage();
  } else {
    drawSensors();
    drawSwitches();
  }
}

static void render(epd_mode_t mode) {
  buttons.clear();
  D.setEpdMode(mode);
  D.startWrite();
  D.fillScreen(C_WHITE);
  drawPage();
  D.endWrite();
  D.display();
}

// Même rendu, mais seul le rectangle donné est envoyé à l'écran : bien plus rapide qu'un
// rafraîchissement complet quand un seul rang de boutons change.
static void renderRect(int x, int y, int w, int h) {
  buttons.clear();
  D.setEpdMode(epd_mode_t::epd_fast);
  D.startWrite();
  D.fillScreen(C_WHITE);
  drawPage();
  D.endWrite();
  D.display(x, y, w, h);
}

static void renderBand(int y, int h) { renderRect(0, y, 960, h); }

static const Button* findButton(Action a) {
  for (const Button& b : buttons)
    if (b.action == a) return &b;
  return nullptr;
}

// Échec avec des données déjà affichées : seul le bloc d'état change (message d'erreur), le
// reste de l'écran garde les dernières valeurs — pas de rafraîchissement complet qui clignote.
static bool refreshAll(epd_mode_t mode) {
  bool ok = fetchSummary();
  if (ok || !hasData) render(mode);
  else updateStatusLine();
  return ok;
}

// Commande de la chaudière depuis l'écran : son de confirmation ou d'erreur selon la réponse de
// skbox, puis rechargement pour afficher le nouvel état.
static void command(const char* method, const char* path, const String& body) {
  int code = httpCall(method, path, body, nullptr);
  if (code >= 200 && code < 300) beepOk();
  else beepError();
  refreshAll(epd_mode_t::epd_fast);
}

// ---------------------------------------------------------------- Actions

static void flashButton(const Button& b) {
  D.setEpdMode(epd_mode_t::epd_fastest);
  D.fillRoundRect(b.x, b.y, b.w, b.h, 10, C_LIGHTGRAY);
  D.display();
}

static void onTap(int tx, int ty) {
  for (const Button& b : buttons) {
    if (tx < b.x || tx >= b.x + b.w || ty < b.y || ty >= b.y + b.h) continue;

    beepClick();
    if (b.action != A_TOGGLE || !boiler.enabled) confirmStopUntil = 0;
    switch (b.action) {
      case A_REFRESH:
        flashButton(b);
        if (!refreshAll(epd_mode_t::epd_text)) beepError();
        break;
      case A_PAGE:
        if (b.arg == page) break;
        page = b.arg;
        render(epd_mode_t::epd_text);  // tout l'écran change : mode net, plus rapide que "quality"
        break;
      case A_DURATION:
        durationIndex = b.arg;
        if (boiler.hasOverride && boiler.overrideLevel.length()) {
          // Dérogation en cours : la nouvelle durée s'applique tout de suite (même niveau, à partir
          // de maintenant), pour que l'heure de fin et le prochain changement soient recalculés.
          flashButton(b);
          command("POST", "/api/boiler/boost",
                  "{\"level\":\"" + boiler.overrideLevel + "\",\"minutes\":" + String(durations[durationIndex]) + "}");
        } else {
          renderBand(b.y, b.h);  // simple choix pour la prochaine dérogation
        }
        break;
      case A_BOOST: {
        flashButton(b);
        String body = "{\"level\":\"" + levels[b.arg].key + "\",\"minutes\":" + String(durations[durationIndex]) + "}";
        command("POST", "/api/boiler/boost", body);
        break;
      }
      case A_CANCEL:
        flashButton(b);
        command("DELETE", "/api/boiler/boost", "");
        break;
      case A_TOGGLE:
        if (!boiler.enabled) {
          flashButton(b);
          command("PUT", "/api/boiler/enabled", "{\"enabled\":true}");
        } else if (confirmStopUntil && millis() < confirmStopUntil) {
          confirmStopUntil = 0;
          flashButton(b);
          command("PUT", "/api/boiler/enabled", "{\"enabled\":false}");
        } else {
          confirmStopUntil = millis() + 5000;
          renderBand(b.y, b.h);
        }
        break;
      case A_SWITCH: {
        // Affichage optimiste dès que skbox accepte la commande, puis relecture de l'état réel
        // quelques secondes plus tard (l'appareil confirme via MQTT, ou pas s'il est injoignable).
        if ((size_t)b.arg >= switches.size()) break;
        Switch& sw = switches[b.arg];
        const int bx = b.x, by = b.y, bw = b.w, bh = b.h;  // `buttons` est vidé par le rendu
        flashButton(b);
        bool target = !sw.on;
        int code = httpCall("POST", "/api/devices/" + sw.id + "/command",
                            target ? "{\"command\":\"on\"}" : "{\"command\":\"off\"}", nullptr);
        if (code >= 200 && code < 300) {
          beepOk();
          sw.on = target;
          refreshAt = millis() + 3000;
        } else {
          beepError();
        }
        renderRect(bx, by, bw, bh);
        break;
      }
    }
    return;
  }
}

// ---------------------------------------------------------------- Veille

// Attend que le doigt se lève ; renvoie dans (x, y) la première position lue (-1 si aucune).
static void waitTouchRelease(int& x, int& y) {
  x = y = -1;
  uint32_t start = millis();
  do {
    M5.update();
    auto d = M5.Touch.getDetail();
    if (x < 0 && d.isPressed()) {
      x = d.x;
      y = d.y;
    }
    delay(10);
  } while (M5.Touch.getCount() > 0 && millis() - start < 2000);
}

static const Button* buttonAt(int x, int y) {
  for (const Button& b : buttons)
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return &b;
  return nullptr;
}

static void goToSleep() {
  // En veille, l'écran reste figé : on y laisse la page principale, la plus utile d'un coup d'œil.
  if (!asleep) {
    asleep = true;
    if (page != P_HOME) {
      page = P_HOME;
      render(epd_mode_t::epd_quality);
    } else {
      updateStatusLine();
    }
  }
  wifiDown();
  D.waitDisplay();
  while (M5.Speaker.isPlaying()) delay(5);  // laisser finir un son avant de couper
  uint32_t elapsed = millis() - lastAttempt, delayMs = refreshDelayMs();
  uint32_t wait = elapsed >= delayMs ? 1 : (delayMs - elapsed + 999) / 1000;
  LOG("[veille] light sleep %lu s (batterie %d %%)\n", (unsigned long)wait, (int)M5.Power.getBatteryLevel());
  Serial.flush();
  setPhase(PH_SLEEPING);
  M5.Power.lightSleep((uint64_t)wait * 1000000ULL, true);
  bool timerWake = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER;
  lastWake = timerWake ? 't' : 'p';
  setPhase(timerWake ? PH_WOKE_TIMER : PH_WOKE_TOUCH);

  LOG("[veille] réveil, cause %d\n", (int)esp_sleep_get_wakeup_cause());
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER) {
    // Rafraîchissement périodique, puis retour immédiat en veille.
    refreshAll(epd_mode_t::epd_quality);
    lastActivity = millis() - IDLE_S * 1000UL;
  } else {
    // Réveil par toucher : le premier appui sert seulement à réveiller.
    // Retour immédiat (petit bip + « en veille » effacé), Wi-Fi relancé en arrière-plan ; les
    // données trop anciennes sont rechargées par loop() dès que le Wi-Fi est prêt, sans bloquer
    // les touchers entre-temps.
    M5.Speaker.tone(1500, 15);
    wifiStart();
    int wx, wy;
    waitTouchRelease(wx, wy);
    lastActivity = millis();
    wakeAt = millis();
    asleep = false;
    updateStatusLine();
    pendingRefresh = millis() - lastFetch > 60000UL;
    setPhase(PH_AWAKE);  // réveil par toucher entièrement traité

    // Le toucher de réveil agit s'il vise un onglet ou « Actualiser » (sans risque) ; les commandes
    // (dérogation, prises, arrêt) demandent toujours un second toucher, contre les effleurements.
    const Button* wb = buttonAt(wx, wy);
    if (wb && (wb->action == A_PAGE || wb->action == A_REFRESH)) {
      if (wb->action == A_REFRESH) pendingRefresh = false;  // « Actualiser » recharge déjà
      onTap(wx, wy);
    }
  }
}

// ---------------------------------------------------------------- Arduino

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  diagBegin();
  M5.Speaker.setVolume(BEEP_VOLUME);
  Serial.begin(115200);
  LOG("[boot] skbox PaperS3, écran %dx%d, batterie %d %%, PSRAM %u o\n", (int)D.width(), (int)D.height(),
      (int)M5.Power.getBatteryLevel(), (unsigned)ESP.getPsramSize());
  if (D.width() < D.height()) D.setRotation(D.getRotation() ^ 1);  // paysage 960x540
  render(epd_mode_t::epd_quality);                                 // écran "Connexion..."
  refreshAll(epd_mode_t::epd_quality);
  lastActivity = millis();
}

void loop() {
  M5.update();
  auto t = M5.Touch.getDetail();
  if (t.isPressed()) lastActivity = millis();
  if (t.wasPressed()) {  // réagir dès l'appui, sans attendre que le doigt se lève
    lastActivity = millis();
    LOG("[touch] %d,%d\n", (int)t.x, (int)t.y);
    onTap(t.x, t.y);
  }

  if (confirmStopUntil && millis() >= confirmStopUntil) {
    confirmStopUntil = 0;
    const Button* tb = findButton(A_TOGGLE);
    if (tb) renderBand(tb->y, tb->h);  // absent si on a quitté la page Chaudière : rien à redessiner
  }

  if (refreshAt && millis() >= refreshAt) {
    refreshAt = 0;
    if (fetchSummary() && page == P_HOME) renderRect(SW_X, SW_Y, SW_W, SW_H);
  }

  if (wifiStarted) wifiPoll();  // repli de la connexion rapide, mémorisation du point d'accès

  if (pendingRefresh && (WiFi.status() == WL_CONNECTED || millis() - wakeAt > 12000UL)) {
    pendingRefresh = false;
    refreshAll(epd_mode_t::epd_fast);
  }

  if (refreshDue()) refreshAll(epd_mode_t::epd_quality);

  if (millis() - lastActivity >= IDLE_S * 1000UL) goToSleep();

  delay(10);
}
