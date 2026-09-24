# Afficheur skbox — M5Stack PaperS3

Écran e-ink 4,7" (960×540, tactile) qui affiche les températures des capteurs et l'état de la chaudière, et permet de piloter la chaudière.

![Aperçu](docs/apercu.png)

## Fonctions

- **Températures** : 6 emplacements (2 colonnes × 3). Actuellement Extérieur, Sous-sol et Séjour dans la colonne de gauche ; les 3 emplacements de droite sont réservés pour des ajouts ultérieurs. Un capteur hors ligne apparaît en gris avec l'heure de son dernier message. Le niveau de pile s'affiche quand il passe sous 20 %.
- Pas de seconde page pour l'instant (réservée à des usages futurs, par exemple le système d'alarme).
- **Chaudière** : température mesurée et cible, état (*CHAUFFE* / *en attente* / *ARRÊTÉE*), mode actif (programme, niveau par défaut, période dérogatoire ou dérogation en cours), alerte si le relais est hors ligne.
- **Pilotage** :
  - choisir une durée (1 h, 2 h, 4 h ou 8 h), puis toucher un niveau : `POST /api/boiler/boost` ;
  - *Annuler dérogation* : `DELETE /api/boiler/boost` ;
  - *Arrêter la régulation* : il faut toucher deux fois en moins de 5 s, puis `PUT /api/boiler/enabled`. *Reprendre la régulation* fonctionne en un seul toucher.
- **Veille** : après `IDLE_S` secondes sans toucher, le Wi-Fi est coupé et l'appareil passe en *light sleep*. Il se réveille au toucher (ce premier toucher sert seulement à réveiller l'écran) ou toutes les `REFRESH_S` secondes pour se rafraîchir.

Les données viennent d'un seul appel : `GET /api/display/summary` (module `apps/api/src/display`).

## Installation

1. Installer [PlatformIO](https://platformio.org/) (extension VS Code ou `pip install platformio`).
2. `cp include/config.example.h include/config.h`, puis renseigner le Wi-Fi et l'URL de l'API (`http://<ip-skbox-mini>:3001`).
3. Brancher le PaperS3 en USB-C, puis lancer `pio run -t upload` et `pio device monitor`.

Renseigner `SENSOR_IDS` avec les ids skbox des capteurs Extérieur, Sous-sol et Séjour, séparés par des virgules et dans cet ordre. Les ids sont visibles dans Swagger (`/docs`, `GET /api/devices`). Pour ajouter un capteur plus tard, il suffit d'ajouter son id : il prendra le premier emplacement libre.

## Remarques

- L'API skbox n'a pas d'authentification : le PaperS3 doit être sur le même réseau local que skbox-mini.
- Si l'appareil ne démarre pas en mode téléversement, maintenir le bouton latéral pendant le branchement.
