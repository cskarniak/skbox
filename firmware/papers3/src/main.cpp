// Afficheur e-ink skbox pour M5Stack PaperS3
// - Températures des capteurs + état de la chaudière (GET /api/display/summary)
// - Pilotage tactile : dérogation (boost) par niveau et durée, fin de dérogation,
//   arrêt / reprise de la régulation (arrêt confirmé par un second appui).
// - Économie d'énergie : Wi-Fi coupé et light sleep après IDLE_S d'inactivité ;
//   réveil par toucher de l'écran ou par la minuterie de rafraîchissement.

#include <M5Unified.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_sleep.h>
#include <lwip/dns.h>
#include <vector>

#if __has_include("config.h")
#include "config.h"
#else
#error "Copier include/config.example.h en include/config.h et l'adapter"
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
  String overrideLabel, overrideUntil;
  String mode, programName;  // mode : "override" | "program" | "default"
  bool hasNext = false;
  String nextDay, nextTime, nextLabel;  // nextDay : "" (aujourd'hui), "demain" ou "sam."
  float targetTemp = NAN, currentTemp = NAN;
};

static std::vector<Sensor> sensors;
static std::vector<Level> levels;
static Boiler boiler;
static bool hasData = false;
static String updatedAt, updatedDate, errorMsg;

// ---------------------------------------------------------------- UI

enum Action { A_REFRESH, A_DURATION, A_BOOST, A_CANCEL, A_TOGGLE, A_PAGE };
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

// Pages, choisies par les onglets de l'en-tête. La page 2 est réservée au futur système
// d'alarme : pour l'instant un simple écran d'attente, sans appel réseau.
enum Page { P_HOME, P_ALARM, N_PAGES };
static const char* const PAGE_LABELS[N_PAGES] = {"Maison", "Alarme"};
static int page = P_HOME;

// Vrai de la mise en veille jusqu'au réveil par toucher (y compris pendant les rafraîchissements
// périodiques) : l'en-tête l'indique, pour savoir que le prochain toucher ne fera que réveiller.
static bool asleep = false;

static uint32_t confirmStopUntil = 0;  // fenêtre de confirmation de l'arrêt de la régulation
static uint32_t lastActivity = 0;
static uint32_t lastFetch = 0;

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

static bool wifiUp() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) delay(100);
  if (WiFi.status() != WL_CONNECTED) {
    LOG("[wifi] échec connexion à %s (statut %d)\n", WIFI_SSID, (int)WiFi.status());
    return false;
  }
  LOG("[wifi] connecté en %lu ms, IP %s, RSSI %d dBm\n", (unsigned long)(millis() - start),
      WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
#ifdef SKBOX_DNS
  // Le DNS fourni par le DHCP (box) ne connaît pas les noms locaux servis par skbox-mini.
  IPAddress dnsIp;
  if (dnsIp.fromString(SKBOX_DNS)) {
    ip_addr_t d = IPADDR4_INIT((uint32_t)dnsIp);
    dns_setserver(0, &d);
    LOG("[wifi] DNS forcé : %s\n", SKBOX_DNS);
  }
#endif
  return true;
}

static void wifiDown() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
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

static bool fetchSummary() {
  // bat / mv / chg : ignorés par l'API, mais visibles dans le journal nginx de skbox-mini, ce qui
  // permet de suivre la batterie à distance (le moniteur série est peu utilisable sous macOS).
  String path = "/api/display/summary?bat=" + String((int)M5.Power.getBatteryLevel()) +
                "&mv=" + String((int)M5.Power.getBatteryVoltage()) + "&chg=" + String((int)M5.Power.isCharging());
  if (strlen(SENSOR_IDS)) path += "&devices=" + String(SENSOR_IDS);
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

// Zone centrale de l'en-tête (entre les onglets et la batterie), redessinable seule.
static const int STATUS_X = 272, STATUS_W = 392;

static void drawStatusLine() {
  D.fillRect(STATUS_X, 8, STATUS_W, 44, C_WHITE);
  String middle;
  if (errorMsg.length()) middle = "! " + errorMsg;
  else if (hasData) middle = updatedDate + " · maj " + updatedAt;
  if (asleep) middle += middle.length() ? " · en veille" : "en veille";
  D.setFont(&fonts::efontJA_16);
  D.setTextSize(1);
  text(fit(middle, STATUS_W), STATUS_X + STATUS_W / 2, 30, &fonts::efontJA_16, textdatum_t::middle_center);
}

// Mise à jour partielle et rapide de la seule ligne d'état (entrée / sortie de veille).
static void updateStatusLine() {
  D.setEpdMode(epd_mode_t::epd_fast);
  D.startWrite();
  drawStatusLine();
  D.endWrite();
  D.display(STATUS_X, 8, STATUS_W, 44);
}

static void drawHeader() {
  // Onglets (l'onglet courant est plein).
  for (int i = 0; i < N_PAGES; ++i) {
    drawButton(16 + i * 128, 8, 120, 44, PAGE_LABELS[i], "", i == page, false, A_PAGE, i);
  }

  drawStatusLine();

  // Batterie sur deux lignes : niveau, puis tension et état du chargeur.
  int bat = M5.Power.getBatteryLevel();
  int mv = M5.Power.getBatteryVoltage();
  auto chg = M5.Power.isCharging();
  String line2;
  if (mv > 0) {
    char vb[8];
    snprintf(vb, sizeof(vb), "%d,%02d V", mv / 1000, (mv % 1000) / 10);
    line2 = vb;
  }
  if (chg == m5::Power_Class::is_charging) line2 += " · charge";
  text(bat >= 0 ? String(bat) + " %" : "? %", 780, 19, &fonts::efontJA_16, textdatum_t::middle_right);
  text(line2, 780, 41, &fonts::efontJA_16, textdatum_t::middle_right);

  drawButton(796, 8, 148, 44, "Actualiser", "", false, false, A_REFRESH);
  D.drawFastHLine(0, 60, 960, C_BLACK);
}

static void drawSensors() {
  const int x0 = 16, y0 = 72, cw = 264, ch = 146, gap = 10;

  for (int i = 0; i < SENSOR_SLOTS; ++i) {
    int x = x0 + (i / 3) * (cw + gap);
    int y = y0 + (i % 3) * (ch + gap);

    if ((size_t)i >= sensors.size()) {  // emplacement réservé pour un ajout ultérieur
      D.drawRoundRect(x, y, cw, ch, 10, C_LIGHTGRAY);
      text("libre", x + cw / 2, y + ch / 2, &fonts::efontJA_16, textdatum_t::middle_center, C_LIGHTGRAY);
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

static void drawBoiler() {
  const int px = 576, py = 70, pw = 368, ph = 462;
  const int x = px + 16, w = pw - 32;
  D.drawRoundRect(px, py, pw, ph, 12, C_BLACK);
  text("Chaudière", x, py + 12, &fonts::efontJA_24, textdatum_t::top_left);

  if (!boiler.configured) {
    text("Non configurée dans skbox", px + pw / 2, py + ph / 2, &fonts::efontJA_24, textdatum_t::middle_center, C_GRAY);
    return;
  }

  // État du brûleur : indicateur non cliquable. Badge noir seulement quand elle chauffe ; sinon
  // simple texte, sans cadre, pour ne pas ressembler à un bouton. Régulation arrêtée : rien ici,
  // le badge ARRÊT du mode le dit déjà.
  if (boiler.enabled && boiler.heating) {
    D.setFont(&fonts::efontJA_24);
    int bw = D.textWidth("CHAUFFE") + 24;
    int bx = px + pw - 16 - bw;
    D.fillRoundRect(bx, py + 8, bw, 34, 8, C_BLACK);
    text("CHAUFFE", bx + bw / 2, py + 25, &fonts::efontJA_24, textdatum_t::middle_center, C_WHITE);
  } else if (boiler.enabled) {
    text("ne chauffe pas", px + pw - 16, py + 25, &fonts::efontJA_24, textdatum_t::middle_right, C_BLACK);
  }

  // Températures
  int tw = bigTemp(boiler.currentTemp, x, py + 54);
  text("cible " + fmtTemp(boiler.targetTemp) + "°", x + tw + 12, py + 72, &fonts::efontJA_24, textdatum_t::middle_left);

  // Mode actif : badge (FORCÉ / PROGRAMME / DÉFAUT) + niveau, puis origine, puis prochain changement.
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
  const int ty = py + 96, th = 30;
  int tagW = D.textWidth(tag.c_str()) + 16;
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
  text(fit(l2, w), x, py + 130, &fonts::efontJA_24, textdatum_t::top_left);
  if (l3.length()) {
    D.setFont(&fonts::efontJA_16);
    text(fit(l3, w), x, py + 155, &fonts::efontJA_16, textdatum_t::top_left);
  }
  if (!boiler.relayOnline) text("Relais hors ligne !", px + pw - 16, py + 172, &fonts::efontJA_16, textdatum_t::top_right);

  // Durée de dérogation
  text("Durée", x, py + 172, &fonts::efontJA_16, textdatum_t::top_left, C_GRAY);
  const int dg = 8, dw = (w - dg * (N_DURATIONS - 1)) / N_DURATIONS;
  for (int i = 0; i < N_DURATIONS; ++i) {
    drawButton(x + i * (dw + dg), py + 190, dw, 42, fmtDuration(durations[i]), "", i == durationIndex, false,
               A_DURATION, i);
  }

  // Niveaux (3 par ligne) + fin de dérogation
  text("Dérogation", x, py + 240, &fonts::efontJA_16, textdatum_t::top_left, C_GRAY);
  const int lg = 8, lw = (w - 2 * lg) / 3, lh = 56;
  int slot = 0;
  for (size_t i = 0; i < levels.size() && slot < 6; ++i, ++slot) {
    int bx2 = x + (slot % 3) * (lw + lg);
    int by2 = py + 258 + (slot / 3) * (lh + lg);
    bool active = levels[i].key == boiler.activeLevel;
    drawButton(bx2, by2, lw, lh, levels[i].label, fmtTemp(levels[i].temp) + "°", false, active, A_BOOST, (int)i);
  }
  if (boiler.hasOverride && slot < 6) {
    int bx2 = x + (slot % 3) * (lw + lg);
    int by2 = py + 258 + (slot / 3) * (lh + lg);
    drawButton(bx2, by2, lw, lh, "Annuler", "dérogation", true, false, A_CANCEL);
  }

  // Arrêt / reprise de la régulation
  bool confirming = confirmStopUntil && millis() < confirmStopUntil;
  String label = !boiler.enabled ? "Reprendre la régulation"
                 : confirming    ? "Confirmer l'arrêt ?"
                                 : "Arrêter la régulation";
  drawButton(x, py + ph - 16 - 52, w, 52, label, "", confirming, false, A_TOGGLE);
}

static void drawAlarmPage() {
  D.drawRoundRect(16, 72, 928, 460, 12, C_LIGHTGRAY);
  text("Système d'alarme", 480, 270, &fonts::efontJA_24, textdatum_t::middle_center, C_GRAY, 1.5);
  text("à venir", 480, 320, &fonts::efontJA_24, textdatum_t::middle_center, C_LIGHTGRAY);
}

static void render(epd_mode_t mode) {
  buttons.clear();
  D.setEpdMode(mode);
  D.startWrite();
  D.fillScreen(C_WHITE);
  drawHeader();
  if (page == P_ALARM) {
    drawAlarmPage();
  } else if (hasData) {
    drawSensors();
    drawBoiler();
  } else {
    text(errorMsg.length() ? errorMsg : "Connexion à skbox...", 480, 290, &fonts::efontJA_24,
         textdatum_t::middle_center, C_BLACK, 1.5);
    text(SKBOX_URL, 480, 340, &fonts::efontJA_16, textdatum_t::middle_center, C_GRAY);
  }
  D.endWrite();
  D.display();
}

static bool refreshAll(epd_mode_t mode) {
  bool ok = fetchSummary();
  render(mode);
  return ok;
}

// Commande de la chaudière depuis l'écran : son de confirmation ou d'erreur selon la réponse de
// skbox, puis rechargement pour afficher le nouvel état.
static void command(const char* method, const char* path, const String& body) {
  int code = httpCall(method, path, body, nullptr);
  if (code >= 200 && code < 300) beepOk();
  else beepError();
  refreshAll(epd_mode_t::epd_text);
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
        if (!refreshAll(epd_mode_t::epd_quality)) beepError();
        break;
      case A_PAGE:
        if (b.arg == page) break;
        page = b.arg;
        render(epd_mode_t::epd_quality);  // changement complet d'écran : rendu propre sans rémanence
        break;
      case A_DURATION:
        durationIndex = b.arg;
        render(epd_mode_t::epd_fast);
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
          render(epd_mode_t::epd_fast);
        }
        break;
    }
    return;
  }
}

// ---------------------------------------------------------------- Veille

static void waitTouchRelease() {
  uint32_t start = millis();
  do {
    M5.update();
    delay(10);
  } while (M5.Touch.getCount() > 0 && millis() - start < 2000);
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
  uint32_t since = (millis() - lastFetch) / 1000;
  uint32_t wait = since >= REFRESH_S ? 1 : REFRESH_S - since;
  LOG("[veille] light sleep %lu s (batterie %d %%)\n", (unsigned long)wait, (int)M5.Power.getBatteryLevel());
  Serial.flush();
  M5.Power.lightSleep((uint64_t)wait * 1000000ULL, true);

  LOG("[veille] réveil, cause %d\n", (int)esp_sleep_get_wakeup_cause());
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER) {
    // Rafraîchissement périodique, puis retour immédiat en veille.
    refreshAll(epd_mode_t::epd_quality);
    lastActivity = millis() - IDLE_S * 1000UL;
  } else {
    // Réveil par toucher : le premier appui sert seulement à réveiller.
    waitTouchRelease();
    lastActivity = millis();
    asleep = false;
    if (millis() - lastFetch > 60000UL) refreshAll(epd_mode_t::epd_text);
    else updateStatusLine();
  }
}

// ---------------------------------------------------------------- Arduino

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
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
  if (t.wasClicked()) {
    lastActivity = millis();
    LOG("[touch] %d,%d\n", (int)t.x, (int)t.y);
    onTap(t.x, t.y);
  }

  if (confirmStopUntil && millis() >= confirmStopUntil) {
    confirmStopUntil = 0;
    render(epd_mode_t::epd_fast);
  }

  if (millis() - lastFetch >= REFRESH_S * 1000UL) refreshAll(epd_mode_t::epd_quality);

  if (millis() - lastActivity >= IDLE_S * 1000UL) goToSleep();

  delay(10);
}
