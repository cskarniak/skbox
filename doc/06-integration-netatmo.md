# Connecter le thermostat Netatmo à Skbox

Guide pour (re)relier le thermostat Netatmo — NATherm1 + relais NAPlug1 — à Skbox, afin d'utiliser sa mesure de température comme n'importe quel autre appareil (sonde du module Chaudière, condition de scénario, historique/graphiques). Voir aussi [02-architecture-technique.md](./02-architecture-technique.md) pour le fonctionnement interne du module (`apps/api/src/netatmo/`).

Skbox lit uniquement la température — il ne pilote pas le thermostat.

## Avant de commencer

- Un compte Netatmo actif, avec le thermostat déjà appairé dans l'appli Netatmo Energy.
- Un accès à la page `/modules/netatmo` de Skbox.
- Si une app développeur Netatmo existe déjà (Client ID/Secret notés), passez directement à la partie B.

## A. Créer l'app développeur Netatmo

À faire une seule fois — sautez cette partie si l'app existe déjà.

1. Ouvrez [dev.netatmo.com/apps/createanapp](https://dev.netatmo.com/apps/createanapp) et connectez-vous avec le compte Netatmo du thermostat.
2. Créez une nouvelle app — nom et description libres (ex. « Skbox »).
3. Dans le champ **Redirect URI**, saisissez exactement :
   ```
   http://localhost/
   ```
4. Une fois l'app créée, notez le **Client ID** et le **Client Secret** affichés — ils seront collés dans Skbox à l'étape suivante.

## B. Connecter Skbox à Netatmo

Sur `/modules/netatmo` :

1. Carte **Identifiants** — collez le Client ID et le Client Secret, cliquez **Enregistrer**.
2. Carte **Autorisation** — cliquez **Autoriser Skbox sur Netatmo**. Un nouvel onglet s'ouvre : connectez-vous et autorisez l'accès.
3. Netatmo redirige vers une page qui ne répond pas — c'est attendu. L'adresse ressemble à :
   ```
   http://localhost/?code=XXXXXXXX
   ```
   Copiez uniquement la valeur après `code=`.
4. Revenez sur Skbox, collez le code dans **Code d'autorisation**, cliquez **Connecter**.

> **Le code ne sert qu'une fois.** S'il a expiré ou si la connexion échoue, refaites les étapes 2 à 4 pour obtenir un code neuf — impossible de réutiliser un ancien code.

## C. Vérifier que ça fonctionne

- Le statut sur `/modules/netatmo` passe à **Connecté**, avec la température actuelle de la pièce.
- Un nouvel appareil (protocole `netatmo`) apparaît dans `/devices`.
- La température se met à jour automatiquement toutes les 5 minutes — ou immédiatement via **Resynchroniser maintenant**.
- Cet appareil peut ensuite être choisi comme sonde de température du module Chaudière, ou dans une condition de scénario.

## D. En cas de problème

| Symptôme | Cause probable / solution |
|---|---|
| « Identifiants Netatmo non configurés » | Le Client ID/Secret n'a pas été enregistré — refaire la partie B, étape 1. |
| Échec au clic sur « Connecter » | Le code a expiré ou a déjà été utilisé — refaire la partie B, étapes 2 à 4 pour un code neuf. |
| « Aucun thermostat Netatmo trouvé » | Le thermostat (NATherm1) n'est pas appairé sur ce compte, ou l'autorisation a été donnée sur le mauvais compte Netatmo. |
| Statut « Erreur » persistant | Voir le message affiché sous la température — le plus souvent une coupure réseau côté Netatmo ou une autorisation révoquée ; se déconnecter puis refaire la partie B. |

## Repères techniques

- Sondage automatique de l'API Netatmo toutes les 5 minutes (`NetatmoService`, `apps/api/src/netatmo/netatmo.service.ts`).
- Configuration (identifiants, jetons, pièce/maison détectées, id de l'appareil créé) stockée sous la clé `netatmo.config` (table `Setting`), en clair — même convention que les secrets Telegram/SMTP existants.
- Le jeton d'accès Netatmo expire après ~3h ; le rafraîchissement via `refresh_token` est automatique (Netatmo fait tourner ce jeton à chaque utilisation, la nouvelle valeur est toujours persistée).
