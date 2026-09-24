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

enum Action { A_REFRESH, A_DURATION, A_BOOST, A_CANCEL, A_TOGGLE };
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
  String path = "/api/display/summary";
  if (strlen(SENSOR_IDS)) path += "?devices=" + String(SENSOR_IDS);
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

static void drawHeader() {
  text("skbox", 16, 30, &fonts::efontJA_24, textdatum_t::middle_left, C_BLACK, 1.5);

  String middle;
  if (errorMsg.length()) middle = "! " + errorMsg;
  else if (hasData) middle = updatedDate + "   maj " + updatedAt;
  text(middle, 480, 30, &fonts::efontJA_24, textdatum_t::middle_center);

  int bat = M5.Power.getBatteryLevel();
  String batTxt = bat >= 0 ? String(bat) + " %" : "";
  if (M5.Power.isCharging() == m5::Power_Class::is_charging) batTxt += " (charge)";
  text(batTxt, 780, 30, &fonts::efontJA_16, textdatum_t::middle_right);

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

  // Badge d'état
  String badge = !boiler.enabled ? "ARRÊTÉE" : boiler.heating ? "CHAUFFE" : "en attente";
  bool badgeFilled = !boiler.enabled || boiler.heating;
  D.setFont(&fonts::efontJA_24);
  int bw = D.textWidth(badge.c_str()) + 24;
  int bx = px + pw - 16 - bw;
  if (badgeFilled) D.fillRoundRect(bx, py + 8, bw, 34, 8, C_BLACK);
  else D.drawRoundRect(bx, py + 8, bw, 34, 8, C_BLACK);
  text(badge, bx + bw / 2, py + 25, &fonts::efontJA_24, textdatum_t::middle_center, badgeFilled ? C_WHITE : C_BLACK);

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

static void render(epd_mode_t mode) {
  buttons.clear();
  D.setEpdMode(mode);
  D.startWrite();
  D.fillScreen(C_WHITE);
  drawHeader();
  if (hasData) {
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

static void refreshAll(epd_mode_t mode) {
  fetchSummary();
  render(mode);
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

    if (b.action != A_TOGGLE || !boiler.enabled) confirmStopUntil = 0;
    switch (b.action) {
      case A_REFRESH:
        flashButton(b);
        refreshAll(epd_mode_t::epd_quality);
        break;
      case A_DURATION:
        durationIndex = b.arg;
        render(epd_mode_t::epd_fast);
        break;
      case A_BOOST: {
        flashButton(b);
        String body = "{\"level\":\"" + levels[b.arg].key + "\",\"minutes\":" + String(durations[durationIndex]) + "}";
        httpCall("POST", "/api/boiler/boost", body, nullptr);
        refreshAll(epd_mode_t::epd_text);
        break;
      }
      case A_CANCEL:
        flashButton(b);
        httpCall("DELETE", "/api/boiler/boost", "", nullptr);
        refreshAll(epd_mode_t::epd_text);
        break;
      case A_TOGGLE:
        if (!boiler.enabled) {
          flashButton(b);
          httpCall("PUT", "/api/boiler/enabled", "{\"enabled\":true}", nullptr);
          refreshAll(epd_mode_t::epd_text);
        } else if (confirmStopUntil && millis() < confirmStopUntil) {
          confirmStopUntil = 0;
          flashButton(b);
          httpCall("PUT", "/api/boiler/enabled", "{\"enabled\":false}", nullptr);
          refreshAll(epd_mode_t::epd_text);
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
  wifiDown();
  D.waitDisplay();
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
    if (millis() - lastFetch > 60000UL) refreshAll(epd_mode_t::epd_text);
  }
}

// ---------------------------------------------------------------- Arduino

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
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
