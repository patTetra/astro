# La Grande Année Astronomique — Atlas d'observation

Application web (statique, sans serveur) construite à partir des deux volumes
de *La Grande Année Astronomique* de Laurent Laveau : 954 objets du ciel
profond, avec favoris, calendrier d'observation et journal personnel.

Tout est stocké **localement dans le navigateur de chaque visiteur**
(localStorage) : il n'y a pas de compte, pas de base de données, pas de
serveur à gérer. C'est ce qui permet de l'héberger gratuitement sur
GitHub Pages.

## Contenu du dossier

```
index.html          → la page de l'application
css/style.css        → tous les styles
js/data.js           → les 954 fiches extraites des PDF (données)
js/app.js            → toute la logique (filtres, favoris, calendrier…)
```

Aucune installation, aucune dépendance : ce sont des fichiers 100 % statiques.

## Mettre en ligne gratuitement sur GitHub Pages (sans ligne de commande)

1. Va sur [github.com](https://github.com) et crée un compte si tu n'en as
   pas déjà un.
2. Clique sur le **+** en haut à droite → **New repository**.
   - Nom : par exemple `grande-annee-astronomique`
   - Visibilité : **Public** (obligatoire pour que GitHub Pages serve le
     site gratuitement à tout le monde)
   - Ne coche aucune case d'initialisation (pas de README, pas de licence)
   - Clique sur **Create repository**
3. Sur la page qui s'affiche, clique sur **uploading an existing file**.
4. Glisse-dépose **tout le contenu** de ce dossier (`index.html`, le dossier
   `css`, le dossier `js`) dans la zone de dépôt.
   - Important : glisse le *contenu* du dossier, pas le dossier lui-même,
     pour que `index.html` se retrouve à la racine du dépôt.
5. En bas de page, clique sur **Commit changes**.
6. Va dans l'onglet **Settings** du dépôt (en haut) → **Pages** (menu de
   gauche).
7. Sous **Build and deployment** → **Source**, choisis **Deploy from a
   branch**. Sous **Branch**, choisis `main` et le dossier `/ (root)`, puis
   **Save**.
8. Attends 1 à 2 minutes puis reviens sur cette page **Pages** : une bannière
   verte affichera l'adresse de ton site, du type :

   ```
   https://TON-PSEUDO.github.io/grande-annee-astronomique/
   ```

Cette adresse est publique et fonctionne sur mobile comme sur ordinateur.
Tu peux la partager avec qui tu veux.

### Mettre à jour le site plus tard

Pour changer un fichier (par exemple corriger une donnée dans `js/data.js`) :
ouvre le fichier dans le dépôt GitHub, clique sur l'icône crayon (Edit),
modifie, puis **Commit changes**. Le site se met à jour automatiquement en
une minute ou deux.

## Fonctionnement de l'application

- **Catalogue** : recherche, filtres (type, constellation, difficulté,
  catalogue d'origine), tri, et un bandeau « Bien placés ce mois-ci » calculé
  automatiquement à partir de la date du visiteur.
- **Favoris** : l'étoile sur chaque fiche ajoute/retire l'objet de l'onglet
  Favoris.
- **Calendrier** : planifie une cible sur une date précise depuis la fiche
  détaillée, ou directement depuis un jour du calendrier (« + Ajouter un
  objet à cette nuit »).
- **Journal** : chaque fois qu'un objet est coché « observé », une entrée
  datée apparaît dans le journal, consultable dans l'ordre chronologique.
- Les notes personnelles, favoris, observations et séances planifiées sont
  propres à chaque navigateur/appareil (ce n'est pas synchronisé entre
  appareils, puisqu'il n'y a pas de compte ni de serveur).

## À savoir avant de partager largement

Les descriptions et la sélection des 954 objets proviennent du travail de
Laurent Laveau (*La Grande Année Astronomique*, Vol. 1 et 2). Cette
application se contente de les mettre en forme pour un usage personnel de
suivi d'observation. Avant de rendre le dépôt public ou de le partager
largement, il peut être utile de vérifier que cet usage est compatible avec
les droits associés à l'ouvrage (édition personnelle, dépôt privé, ou accord
de l'auteur), notamment si le contenu textuel complet est repris tel quel.
