/* Réglages du quiz des constellations — tout se modifie ici */
window.QUIZ_CONFIG = {
  titre: "Le quiz des constellations",
  marque: "Le Télégramme",

  questionsParPartie: 10,
  pointsParQuestion: 10,

  /* Lien de la page du quiz, utilisé pour le partage (Facebook, X, WhatsApp, partage natif).
     À renseigner quand tu auras l'adresse définitive ; en attendant, c'est l'adresse de la page courante. */
  lienPartage: "",

  hashtags: "#LeTélégramme #astronomie #constellations",

  /* Texte partagé. Variables : {score} {max} {niveau} {titre} */
  texteSocial: "J'ai obtenu {score}/{max} au quiz des constellations du Télégramme ({niveau}) : {titre} ! Et vous, combien en reconnaissez-vous ?",

  niveaux: {
    debutant: { nom: "Astronome débutant", court: "Débutant", description: "Retrouve la constellation parmi 3 propositions." },
    amateur:  { nom: "Astronome amateur",  court: "Amateur",  description: "Retrouve-la dans la liste des 88 constellations." },
    expert:   { nom: "Astronome expert",   court: "Expert",   description: "Relie les étoiles pour dessiner la constellation demandée." }
  },

  /* Titres selon le score total (le plus haut seuil atteint). */
  titres: [
    { min: 0,  titre: "Étoile filante" },
    { min: 30, titre: "Apprenti astronome" },
    { min: 50, titre: "Observateur averti" },
    { min: 70, titre: "Astronome confirmé" },
    { min: 90, titre: "Maître du ciel" },
    { min: 100, titre: "Gardien des étoiles" }
  ],

  /* Niveau expert */
  expert: {
    minTraits: 3,        // une constellation doit avoir au moins 3 traits pour être tirée au niveau expert
    magMiniPourTirage: 4.7, // on évite les constellations dont toutes les étoiles sont trop faibles
    magMaxAffichee: 5.4, // étoiles du catalogue affichées dans le champ
    etoilesDeFond: 70    // petites étoiles décoratives (non cliquables) pour le réalisme
  },

  couleurs: {
    fond: "#0a1130",
    fond2: "#1a2a63",
    accent: "#ffcf5a",
    trait: "#9fb4ff",
    bon: "#4ade80",
    faux: "#f87171",
    manquant: "#fbbf24"
  },

  cleStockage: "quizConstellations.meilleurs.v1"
};
