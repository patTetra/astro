/* Logo "T" du Télégramme : 4 barres horizontales (2 larges, 2 étroites), reprises à l'identique du PDF
   (cotes exactes, grille 80 x 90). En-tête : rouge. Filigrane de l'image de partage : blanc.
   Pour changer le logo : remplacer le contenu de TELE_LOGO_PATHS. */
window.TELE_LOGO_VIEWBOX = '0 0 80 90';
window.TELE_LOGO_PATHS =
  '<rect x="0" y="0" width="80" height="12.9"/>' +
  '<rect x="0" y="25.8" width="80" height="12.8"/>' +
  '<rect x="25" y="51.5" width="30" height="12.9"/>' +
  '<rect x="25" y="77.2" width="30" height="12.9"/>';

window.teleLogoSVG = function (couleur) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + window.TELE_LOGO_VIEWBOX + '" fill="' + (couleur || '#fff') + '">' + window.TELE_LOGO_PATHS + '</svg>';
};
