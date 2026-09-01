# Calendrier du ciel — Smart Télescope

Webapp statique (HTML/CSS/JS, sans build) qui calcule, pour une position et une
date données, quels objets du ciel profond (Messier + sélection NGC/IC) sont
observables cette nuit-là, groupés par direction (Nord, Nord-Est, Est…), avec
l'heure de début et de fin de visibilité.

## Déploiement sur GitHub Pages

1. Créez un dépôt GitHub (public ou privé si vous avez GitHub Pro/Team/Enterprise,
   sinon public pour Pages gratuit).
2. Déposez tous les fichiers de ce dossier (`index.html`, `style.css`, `app.js`,
   `astro.js`, `catalog.js`, `github.js`) à la racine du dépôt.
3. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`. Sauvegardez.
4. Après une minute, votre site est en ligne à
   `https://<votre-identifiant>.github.io/<nom-du-depot>/`.

Tous les fichiers (y compris `suncalc.js`) sont autonomes : aucune dépendance
réseau externe au chargement, aucune connexion ni identifiant requis pour
utiliser l'app. Chaque visiteur a ses propres réglages et favoris, stockés
localement dans son navigateur (localStorage).

## Choix techniques

- **Catalogue** : les 110 objets Messier, complétés par une sélection d'une
  quarantaine d'objets NGC/IC parmi les plus populaires en astrophotographie
  grand public (Dentelles du Cygne, Amérique du Nord, Tête de Cheval, Rosette,
  Centaurus A, Carène, etc.). Le catalogue complet NGC/IC compte plus de 13 000
  objets ; ce choix garde le fichier léger tout en couvrant l'essentiel des
  cibles utiles pour un smart télescope. Vous pouvez enrichir `catalog.js`
  librement (même format : `cat`, `name`, `type`, `ra` en heures décimales,
  `dec` en degrés décimaux, `mag`).
- **Calculs de visibilité** : altitude/azimut calculés via le temps sidéral
  local (précision de l'ordre de la minute, largement suffisante pour la
  planification). La fenêtre de nuit noire utilise le crépuscule
  astronomique (Soleil sous -18°) via la librairie SunCalc, avec repli sur le
  crépuscule nautique si l'astronomique n'est pas atteint (hautes latitudes).
- **Soleil et Lune** : affichés séparément en haut du calendrier (lever/coucher,
  phase, illumination), avec un avertissement sur le filtre solaire requis
  pour le Soleil.
- **Mode nuit** : bouton dans l'en-tête, bascule toute l'interface vers un
  thème rouge sur noir (préserve l'adaptation à l'obscurité), comme dans les
  applications d'astronomie classiques. Préférence sauvegardée localement.
- **Favoris et réglages** : stockés uniquement dans le localStorage du
  navigateur de chaque utilisateur — pas de compte, pas de synchronisation
  entre appareils.
- **Pérennité** : catalogue et formules astronomiques restent valables sur
  plusieurs décennies sans mise à jour (précession négligeable à cette
  précision). `suncalc.js` est une copie locale figée (v1.9.0), donc
  aucune dépendance à un CDN externe — le site fonctionne à l'identique
  tant que les fichiers restent en ligne, sans risque de rupture si une
  librairie tierce change de version ou disparaît.
- **Direction** : rose des vents à 8 points (N, NE, E, SE, S, SO, O, NO),
  affichée directement sur chaque objet (plus de regroupement par direction :
  le classement se fait par constellation, trié par heure de lever).
- **Sélection des catégories** : cartes visuelles illustrées (icônes
  vectorielles par type, pas de photos réelles pour des raisons de droits
  d'auteur et d'hébergement).
