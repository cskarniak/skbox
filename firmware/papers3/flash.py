#!/usr/bin/env python3
"""Flashe le PaperS3 de façon fiable via son USB natif (USB-Serial/JTAG), puis le redémarre.

Pourquoi pas simplement `pio run -t upload` :
- le port USB n'existe qu'entre deux mises en veille : on attend qu'il apparaisse ;
- l'esptool fourni (4.5.x) ne désactive pas le chien de garde RTC, que le bootloader arme et qui
  survit aux redémarrages : il coupait la puce au milieu de l'écriture du firmware (2,3 Mo, ~20 s) ;
- le reset "hard_reset" par RTS laissait souvent la puce en mode téléchargement ; un reset par
  chien de garde RTC la fait démarrer normalement sur le firmware.
Chaque bloc doit être vérifié (4/4), sinon le script échoue.

Usage (depuis firmware/papers3, après `pio run`) :
    "$(head -1 "$(which pio)" | cut -c3-)" flash.py   # python de PlatformIO (fournit pyserial)
"""
import glob
import os
import sys
import time

sys.path.insert(0, os.path.expanduser("~/.platformio/packages/tool-esptoolpy"))
import esptool  # noqa: E402
import serial  # noqa: E402  (pyserial, fourni avec PlatformIO)

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, ".pio", "build", "papers3")
BOOT_APP0 = os.path.expanduser(
    "~/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
)
RTC = 0x60008000  # RTC_CNTL (ESP32-S3)
WDT_WPROTECT, WDT_CONFIG0, WDT_CONFIG1, WDT_KEY = RTC + 0xB0, RTC + 0x98, RTC + 0x9C, 0x50D83AA1
SWD_CONF, SWD_WPROTECT, SWD_KEY = RTC + 0xB4, RTC + 0xB8, 0x8F1D312A


def wait_port(timeout_s=120):
    end = time.time() + timeout_s
    while time.time() < end:
        ports = glob.glob("/dev/cu.usbmodem*")
        if ports:
            return ports[0]
        time.sleep(0.1)
    sys.exit("Port USB introuvable : toucher l'écran pour le réveiller, ou le brancher en mode téléchargement.")


def disable_watchdogs(esp):
    esp.write_reg(WDT_WPROTECT, WDT_KEY)
    esp.write_reg(WDT_CONFIG0, 0)
    esp.write_reg(WDT_WPROTECT, 0)
    esp.write_reg(SWD_WPROTECT, SWD_KEY)
    esp.write_reg(SWD_CONF, esp.read_reg(SWD_CONF) | (1 << 31))  # super-watchdog : auto-alimenté
    esp.write_reg(SWD_WPROTECT, 0)


def watchdog_reset(esp):
    esp.write_reg(WDT_WPROTECT, WDT_KEY)
    esp.write_reg(WDT_CONFIG1, 2000)
    esp.write_reg(WDT_CONFIG0, (1 << 31) | (5 << 28) | (1 << 8) | 2)
    esp.write_reg(WDT_WPROTECT, 0)


def main():
    images = [
        ("0x0", os.path.join(BUILD, "bootloader.bin")),
        ("0x8000", os.path.join(BUILD, "partitions.bin")),
        ("0xe000", BOOT_APP0),
        ("0x10000", os.path.join(BUILD, "firmware.bin")),
    ]
    for _, path in images:
        if not os.path.exists(path):
            sys.exit(f"Fichier manquant : {path} (lancer `pio run` d'abord)")

    for attempt in range(1, 6):
        port = wait_port()
        try:
            # Sous macOS, ouvrir le port relance la puce en mode téléchargement : elle affiche sa
            # bannière « ESP-ROM... », qu'esptool prend pour une réponse invalide (« Invalid head of
            # packet 0x45 »). Essais impairs : on ouvre le port nous-mêmes, on laisse passer la
            # bannière, on vide le tampon, puis on dialogue sans reset sur ce même port.
            # Essais pairs : séquence de reset propre à l'USB-Serial/JTAG natif.
            if attempt % 2:
                ser = serial.serial_for_url(port, do_not_open=True)
                ser.baudrate, ser.timeout = 115200, 0.5
                ser.dtr = ser.rts = False
                ser.open()
                time.sleep(1.0)
                ser.reset_input_buffer()
                esp = esptool.detect_chip(ser, 115200, "no_reset")
            else:
                esp = esptool.detect_chip(port, 460800, "usb_reset")
            disable_watchdogs(esp)
            args = ["--chip", "esp32s3", "--port", port, "--baud", "460800",
                    "--before", "no_reset", "--after", "no_reset",
                    "write_flash", "-z", "--flash_mode", "dio", "--flash_freq", "80m", "--flash_size", "16MB"]
            for addr, path in images:
                args += [addr, path]
            esptool.main(args, esp=esp)  # lève une exception si un bloc n'est pas vérifié
        except Exception as exc:  # port perdu, puce endormie pendant la connexion...
            print(f"Essai {attempt} échoué : {exc}")
            time.sleep(1)
            continue
        # Écriture réussie : ne plus rien réécrire, seulement tenter de démarrer le firmware.
        try:
            watchdog_reset(esp)
            print("Flash OK (4/4 blocs vérifiés), PaperS3 redémarré sur le firmware.")
        except Exception:
            print("Flash OK (4/4 blocs vérifiés). Redémarrage automatique impossible : débrancher "
                  "l'USB, éteindre (appui long) puis rallumer (appui bref) le PaperS3.")
        return
    sys.exit("Échec après 5 essais : brancher en maintenant le bouton latéral (mode téléchargement), puis relancer.")


if __name__ == "__main__":
    main()
