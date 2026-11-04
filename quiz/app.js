(function () {
'use strict';

var CFG = window.QUIZ_CONFIG;
var DATA = window.CONSTELLATIONS;
var R = Math.PI / 180;
var VB = 400; // taille de la vue SVG (carrée)
var NS = 'http://www.w3.org/2000/svg';

function $(s) { return document.querySelector(s); }
function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function edgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
function article(nom) { return nom; }

/* ---------- Données prétraitées ---------- */
var CAT = {}; // catalogue global des étoiles, clé = "ra_dec"
DATA.forEach(function (c, i) {
  c.i = i;
  c.keys = c.s.map(function (s) { return s[0] + '_' + s[1]; });
  c.edges = c.l.map(function (p) { return edgeKey(c.keys[p[0]], c.keys[p[1]]); });
  c.minMag = Math.min.apply(null, c.s.map(function (s) { return s[2]; }));
  c.s.forEach(function (s, j) { if (!CAT[c.keys[j]]) CAT[c.keys[j]] = { k: c.keys[j], ra: s[0], de: s[1], mag: s[2] }; });
});
var ALPHA = DATA.slice().sort(function (a, b) { return a.fr.localeCompare(b.fr, 'fr'); });

/* ---------- Projection (stéréographique centrée sur la constellation, Nord en haut, Est à gauche) ---------- */
function centroid(c) {
  var x = 0, y = 0, z = 0;
  c.s.forEach(function (s) {
    var a = s[0] * 15 * R, d = s[1] * R;
    x += Math.cos(d) * Math.cos(a); y += Math.cos(d) * Math.sin(a); z += Math.sin(d);
  });
  var n = Math.sqrt(x * x + y * y + z * z);
  return { ra: Math.atan2(y, x), de: Math.asin(z / n) };
}
function makeProj(ra0, de0) {
  return function (ra, de) {
    var a = ra * 15 * R, d = de * R, da = a - ra0;
    var den = 1 + Math.sin(de0) * Math.sin(d) + Math.cos(de0) * Math.cos(d) * Math.cos(da);
    if (den < 0.3) return null;
    var k = 2 / den;
    return { x: -k * Math.cos(d) * Math.sin(da), y: k * (Math.cos(de0) * Math.sin(d) - Math.sin(de0) * Math.cos(d) * Math.cos(da)) };
  };
}
/* mode 'show' : constellation cadrée seule ; mode 'field' : champ élargi pour le niveau expert */
function makeView(c, mode) {
  var cen = centroid(c), P = makeProj(cen.ra, cen.de);
  var pts = c.s.map(function (s) { return P(s[0], s[1]); });
  var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  pts.forEach(function (p) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); });
  var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  var ext = Math.max(maxx - minx, maxy - miny) / 2;
  var half = mode === 'show' ? Math.max(ext * 1.3, 0.04) : Math.max(ext * 1.8, 0.2);
  var sc = (VB / 2) / half;
  return {
    half: half,
    map: function (ra, de) {
      var p = P(ra, de); if (!p) return null;
      return { x: VB / 2 + (p.x - cx) * sc, y: VB / 2 - (p.y - cy) * sc };
    }
  };
}
function starR(mag) { return Math.max(1.5, Math.min(7.5, 4.8 - 0.8 * mag)); }

/* ---------- Rendu SVG ---------- */
function line(a, b, color, w, dash, op) {
  return '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) +
    '" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + (op ? ' opacity="' + op + '"' : '') + '/>';
}
function star(p, mag, extra) {
  var r = starR(mag);
  return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (r * 2.4).toFixed(1) + '" fill="#9fb4ff" opacity=".13"/>' +
         '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#fff"' + (extra || '') + '/>';
}
function svgWrap(inner) { return '<svg viewBox="0 0 ' + VB + ' ' + VB + '" xmlns="' + NS + '" role="img">' + inner + '</svg>'; }

function renderShow(c) {
  var v = makeView(c, 'show'), out = '';
  var pos = c.s.map(function (s) { return v.map(s[0], s[1]); });
  c.l.forEach(function (p) { out += line(pos[p[0]], pos[p[1]], CFG.couleurs.trait, 2); });
  c.s.forEach(function (s, j) { out += star(pos[j], s[2]); });
  return svgWrap(out);
}

/* Générateur pseudo-aléatoire reproductible (étoiles de fond décoratives) */
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Champ du niveau expert : étoiles réelles du catalogue + fond décoratif */
function buildField(c) {
  var v = makeView(c, 'field'), stars = [], deco = [], key;
  for (key in CAT) {
    var s = CAT[key];
    if (s.mag > CFG.expert.magMaxAffichee) continue;
    var p = v.map(s.ra, s.de);
    if (p && p.x > 12 && p.x < VB - 12 && p.y > 12 && p.y < VB - 12) stars.push({ k: s.k, x: p.x, y: p.y, mag: s.mag });
  }
  var rand = rng(c.i * 977 + 13), n = CFG.expert.etoilesDeFond, tries = 0;
  while (deco.length < n && tries < n * 6) {
    tries++;
    var x = 6 + rand() * (VB - 12), y = 6 + rand() * (VB - 12);
    if (stars.some(function (s) { return (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) < 100; })) continue;
    deco.push({ x: x, y: y, r: 0.7 + rand() * 0.9, o: 0.3 + rand() * 0.4 });
  }
  var byKey = {}; stars.forEach(function (s) { byKey[s.k] = s; });
  return { stars: stars, deco: deco, byKey: byKey };
}
function fieldBase(f) {
  var out = '';
  f.deco.forEach(function (d) { out += '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="' + d.r.toFixed(1) + '" fill="#fff" opacity="' + d.o.toFixed(2) + '"/>'; });
  return out;
}
function fieldStars(f) {
  var out = '';
  f.stars.forEach(function (s) { out += star(s, s.mag); });
  return out;
}
function edgeLine(f, e, color, w, dash) {
  var p = e.split('|'), a = f.byKey[p[0]], b = f.byKey[p[1]];
  return (a && b) ? line(a, b, color, w, dash) : '';
}

/* ---------- État ---------- */
var S = null; // partie en cours
var shareBlobUrl = null;

function show(id) {
  ['accueil', 'jeu', 'resultat'].forEach(function (n) { $('#' + n).hidden = (n !== id); });
  $('#btnAccueil').hidden = (id === 'accueil');
  window.scrollTo(0, 0);
}
function toast(t) {
  var el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600);
}
function lireMeilleurs() { try { return JSON.parse(localStorage.getItem(CFG.cleStockage)) || {}; } catch (e) { return {}; } }
function ecrireMeilleur(niv, sc) {
  var m = lireMeilleurs(), ancien = m[niv] || 0;
  if (sc > ancien) { m[niv] = sc; try { localStorage.setItem(CFG.cleStockage, JSON.stringify(m)); } catch (e) {} }
  return Math.max(ancien, sc);
}
function maxScore() { return CFG.questionsParPartie * CFG.pointsParQuestion; }
function titreDuScore(sc) {
  var t = CFG.titres[0].titre;
  CFG.titres.forEach(function (x) { if (sc >= x.min) t = x.titre; });
  return t;
}

/* ---------- Accueil ---------- */
function renderAccueil() {
  var best = lireMeilleurs(), html = '';
  ['debutant', 'amateur', 'expert'].forEach(function (k) {
    var n = CFG.niveaux[k];
    html += '<button class="card" data-niv="' + k + '"><b>' + esc(n.nom) + '</b><span>' + esc(n.description) + '</span>' +
      (best[k] != null ? '<em>Meilleur score : ' + best[k] + '/' + maxScore() + '</em>' : '') + '</button>';
  });
  $('#niveaux').innerHTML = html;
  show('accueil');
}

/* ---------- Démarrage d'une partie ---------- */
function tirage(niveau) {
  var pool = DATA.filter(function (c) {
    if (niveau !== 'expert') return true;
    return c.edges.length >= CFG.expert.minTraits && c.minMag <= CFG.expert.magMiniPourTirage;
  });
  return shuffle(pool).slice(0, CFG.questionsParPartie);
}
function demarrer(niveau) {
  S = { niveau: niveau, qs: tirage(niveau), i: 0, score: 0, rep: [], trouvees: {}, sel: null, verrou: false };
  $('#niveauLabel').textContent = CFG.niveaux[niveau].court;
  show('jeu');
  question();
}

function question() {
  var c = S.qs[S.i];
  S.verrou = false; S.sel = null;
  $('#retour').hidden = true; $('#legende').hidden = true;
  $('#zoneQcm').hidden = S.niveau !== 'debutant';
  $('#zoneListe').hidden = S.niveau !== 'amateur';
  $('#zoneExpert').hidden = S.niveau !== 'expert';
  $('#progression').textContent = 'Question ' + (S.i + 1) + '/' + S.qs.length;
  $('#scoreLive').textContent = S.score + (S.score > 1 ? ' pts' : ' pt');
  $('#barre').style.width = (S.i / S.qs.length * 100) + '%';

  if (S.niveau === 'expert') {
    $('#consigne').innerHTML = 'Dessine : <b>' + esc(c.fr) + '</b>';
    S.field = buildField(c); S.user = []; S.pending = null;
    drawExpert();
  } else {
    $('#consigne').textContent = 'Quelle est cette constellation ?';
    $('#scene').innerHTML = renderShow(c);
    if (S.niveau === 'debutant') renderQcm(c); else renderListe('');
  }
}

/* ---------- Débutant ---------- */
function renderQcm(c) {
  var autres = shuffle(DATA.filter(function (x) { return x !== c; })).slice(0, 2);
  var opts = shuffle([c].concat(autres));
  var html = '';
  opts.forEach(function (o) { html += '<button class="answer" data-i="' + o.i + '">' + esc(o.fr) + '</button>'; });
  $('#zoneQcm').innerHTML = html;
}
function repondreQcm(i) {
  if (S.verrou) return; S.verrou = true;
  var c = S.qs[S.i], ok = (i === c.i);
  Array.prototype.forEach.call($('#zoneQcm').children, function (b) {
    b.disabled = true;
    var bi = +b.dataset.i;
    if (bi === c.i) b.classList.add('bon'); else if (bi === i) b.classList.add('faux');
  });
  enregistrer(c, ok ? CFG.pointsParQuestion : 0, ok);
  retour(ok ? 'Bravo ! C\'est ' + c.fr + ' (' + c.la + '). +' + CFG.pointsParQuestion + ' pts' : 'Raté : c\'était ' + c.fr + ' (' + c.la + ').');
}

/* ---------- Amateur ---------- */
function renderListe(filtre) {
  var f = filtre.trim().toLowerCase(), html = '', n = 0;
  ALPHA.forEach(function (c) {
    if (f && c.fr.toLowerCase().indexOf(f) < 0 && c.la.toLowerCase().indexOf(f) < 0) return;
    n++;
    var cls = S.trouvees[c.i] ? 'fait' : (S.sel === c.i ? 'sel' : '');
    html += '<li data-i="' + c.i + '" class="' + cls + '">' + esc(c.fr) + '</li>';
  });
  if (!n) html = '<li class="vide">Aucune constellation</li>';
  $('#liste').innerHTML = html;
  $('#btnValiderListe').disabled = (S.sel == null || S.verrou);
}
function validerListe() {
  if (S.verrou || S.sel == null) return; S.verrou = true;
  var c = S.qs[S.i], ok = (S.sel === c.i);
  if (ok) S.trouvees[c.i] = true;
  enregistrer(c, ok ? CFG.pointsParQuestion : 0, ok);
  $('#btnValiderListe').disabled = true;
  renderListe($('#recherche').value);
  retour(ok ? 'Bravo ! C\'est ' + c.fr + ' (' + c.la + '). +' + CFG.pointsParQuestion + ' pts' : 'Raté : c\'était ' + c.fr + ' (' + c.la + ').');
}

/* ---------- Expert ---------- */
function drawExpert(resultat) {
  var f = S.field, out = fieldBase(f);
  if (resultat) {
    resultat.manquants.forEach(function (e) { out += edgeLine(f, e, CFG.couleurs.manquant, 2.4, '6 5'); });
    resultat.faux.forEach(function (e) { out += edgeLine(f, e, CFG.couleurs.faux, 2.4); });
    resultat.bons.forEach(function (e) { out += edgeLine(f, e, CFG.couleurs.bon, 2.8); });
  } else {
    S.user.forEach(function (e) { out += edgeLine(f, e, CFG.couleurs.trait, 2.6); });
  }
  out += fieldStars(f);
  if (!resultat && S.pending) {
    var s = f.byKey[S.pending];
    if (s) out += '<circle cx="' + s.x.toFixed(1) + '" cy="' + s.y.toFixed(1) + '" r="' + (starR(s.mag) + 7) + '" fill="none" stroke="' + CFG.couleurs.accent + '" stroke-width="2"/>';
  }
  $('#scene').innerHTML = svgWrap(out);
}
function toucherScene(ev) {
  if (S.niveau !== 'expert' || S.verrou) return;
  var svg = $('#scene svg'); if (!svg) return;
  var r = svg.getBoundingClientRect(), k = VB / r.width;
  var x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
  var best = null, bd = 26 * 26;
  S.field.stars.forEach(function (s) { var d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y); if (d < bd) { bd = d; best = s; } });
  if (!best) { S.pending = null; drawExpert(); return; }
  if (S.pending == null) S.pending = best.k;
  else if (S.pending === best.k) S.pending = null;
  else {
    var e = edgeKey(S.pending, best.k), idx = S.user.indexOf(e);
    if (idx >= 0) S.user.splice(idx, 1); else S.user.push(e);
    S.pending = best.k; // on enchaîne : la dernière étoile devient le point de départ
  }
  drawExpert();
}
function validerExpert() {
  if (S.verrou) return;
  if (!S.user.length) { toast('Trace au moins un trait'); return; }
  S.verrou = true; S.pending = null;
  var c = S.qs[S.i], vrai = c.edges, user = S.user;
  var bons = user.filter(function (e) { return vrai.indexOf(e) >= 0; });
  var faux = user.filter(function (e) { return vrai.indexOf(e) < 0; });
  var manquants = vrai.filter(function (e) { return user.indexOf(e) < 0; });
  var union = bons.length + faux.length + manquants.length;
  var pts = Math.round(CFG.pointsParQuestion * bons.length / union);
  drawExpert({ bons: bons, faux: faux, manquants: manquants });
  $('#zoneExpert').hidden = true;
  $('#legende').hidden = false;
  enregistrer(c, pts, pts >= CFG.pointsParQuestion * 0.7);
  retour(c.fr + ' : ' + bons.length + ' trait' + (bons.length > 1 ? 's' : '') + ' juste' + (bons.length > 1 ? 's' : '') + ' sur ' + vrai.length + ', ' +
    faux.length + ' en trop. +' + pts + ' pt' + (pts > 1 ? 's' : '') + ' sur ' + CFG.pointsParQuestion);
}

/* ---------- Commun ---------- */
function enregistrer(c, pts, ok) {
  S.score += pts; S.rep.push({ c: c, pts: pts, ok: ok });
  $('#scoreLive').textContent = S.score + (S.score > 1 ? ' pts' : ' pt');
}
function retour(texte) {
  $('#retourTexte').textContent = texte;
  $('#btnSuivant').textContent = (S.i + 1 >= S.qs.length) ? 'Voir mon score' : 'Suivant';
  $('#retour').hidden = false;
  $('#retour').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function suivant() {
  S.i++;
  if (S.i >= S.qs.length) fin(); else question();
}

/* ---------- Résultat ---------- */
function fin() {
  var max = maxScore(), titre = titreDuScore(S.score), best = ecrireMeilleur(S.niveau, S.score);
  $('#resNiveau').textContent = CFG.niveaux[S.niveau].nom;
  $('#resScore').textContent = S.score; $('#resMax').textContent = '/' + max;
  $('#resTitre').textContent = titre;
  $('#resMeilleur').textContent = 'Meilleur score à ce niveau : ' + best + '/' + max;
  var html = '';
  S.rep.forEach(function (r) { html += '<li class="' + (r.ok ? 'ok' : 'ko') + '">' + esc(r.c.fr) + '<span class="pts">' + r.pts + '/' + CFG.pointsParQuestion + '</span></li>'; });
  $('#recap').innerHTML = html;
  $('#apercu').hidden = true;
  show('resultat');
  construireImage().then(function (blob) {
    if (!blob) return;
    if (shareBlobUrl) URL.revokeObjectURL(shareBlobUrl);
    shareBlobUrl = URL.createObjectURL(blob);
    $('#apercu').src = shareBlobUrl; $('#apercu').hidden = false;
    S.blob = blob;
  });
}

function lienPartage() { return CFG.lienPartage || (location.href.split('#')[0]); }
function texteSocial() {
  var t = CFG.texteSocial.replace('{score}', S.score).replace('{max}', maxScore())
    .replace('{niveau}', CFG.niveaux[S.niveau].nom.toLowerCase()).replace('{titre}', titreDuScore(S.score));
  return t + ' ' + CFG.hashtags;
}

/* ---------- Image de partage 1080 x 1350 (4:5, adaptée Instagram et Facebook) ---------- */
function chargerLogo() {
  return new Promise(function (res) {
    var img = new Image();
    img.onload = function () { res(img); };
    img.onerror = function () { res(null); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.teleLogoSVG('#ffffff'));
  });
}
function construireImage() {
  var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var g = cv.getContext('2d');
  return chargerLogo().then(function (logo) {
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, CFG.couleurs.fond2); grad.addColorStop(1, CFG.couleurs.fond);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    var rand = rng(S.score * 31 + S.i + 7);
    for (var i = 0; i < 160; i++) {
      g.globalAlpha = 0.25 + rand() * 0.6; g.fillStyle = '#fff';
      g.beginPath(); g.arc(rand() * W, rand() * H, 0.8 + rand() * 2.2, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // filigrane logo en haut à gauche
    if (logo) { g.globalAlpha = 0.45; g.drawImage(logo, 56, 52, 85, 96); g.globalAlpha = 1; }
    g.textAlign = 'center';
    g.fillStyle = CFG.couleurs.accent; g.font = '800 54px system-ui,Helvetica,Arial,sans-serif';
    g.fillText('QUIZ DES CONSTELLATIONS', W / 2, 230);
    g.fillStyle = '#fff'; g.font = '600 44px system-ui,Helvetica,Arial,sans-serif';
    g.fillText(CFG.niveaux[S.niveau].nom, W / 2, 296);

    // dessin d'une constellation de la partie (la meilleure trouvée, sinon la première)
    var pick = S.rep.slice().sort(function (a, b) { return b.pts - a.pts; })[0] || S.rep[0];
    if (pick) {
      var c = pick.c, v = makeView(c, 'show'), sz = 540, ox = (W - sz) / 2, oy = 340, k = sz / VB;
      var pos = c.s.map(function (s) { var p = v.map(s[0], s[1]); return { x: ox + p.x * k, y: oy + p.y * k }; });
      g.strokeStyle = CFG.couleurs.trait; g.lineWidth = 4; g.lineCap = 'round';
      c.l.forEach(function (p) { g.beginPath(); g.moveTo(pos[p[0]].x, pos[p[0]].y); g.lineTo(pos[p[1]].x, pos[p[1]].y); g.stroke(); });
      c.s.forEach(function (s, j) {
        var r = starR(s[2]) * k * 1.1;
        g.fillStyle = 'rgba(159,180,255,.18)'; g.beginPath(); g.arc(pos[j].x, pos[j].y, r * 2.4, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(pos[j].x, pos[j].y, r, 0, 7); g.fill();
      });
      g.fillStyle = '#cfd8ff'; g.font = '500 40px system-ui,Helvetica,Arial,sans-serif';
      g.fillText(c.fr, W / 2, 925);
    }
    g.fillStyle = CFG.couleurs.accent; g.font = '800 210px system-ui,Helvetica,Arial,sans-serif';
    g.fillText(S.score + '/' + maxScore(), W / 2, 1140);
    g.fillStyle = '#fff'; g.font = '700 56px system-ui,Helvetica,Arial,sans-serif';
    g.fillText(titreDuScore(S.score), W / 2, 1220);
    g.fillStyle = '#cfd8ff'; g.font = '500 34px system-ui,Helvetica,Arial,sans-serif';
    g.fillText('Teste-toi sur ' + CFG.marque, W / 2, 1292);
    return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/png'); });
  });
}

function obtenirBlob() { return S.blob ? Promise.resolve(S.blob) : construireImage().then(function (b) { S.blob = b; return b; }); }
function partagerNatif() {
  obtenirBlob().then(function (blob) {
    var file = new File([blob], 'quiz-constellations.png', { type: 'image/png' });
    var data = { text: texteSocial() };
    if (CFG.lienPartage) data.url = CFG.lienPartage;
    if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
    if (navigator.share) navigator.share(data).catch(function () {});
    else { telecharger(); toast('Partage non disponible : image téléchargée'); }
  });
}
function telecharger() {
  obtenirBlob().then(function (blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quiz-constellations.png';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Image enregistrée');
  });
}
function ouvrir(url) { window.open(url, '_blank', 'noopener'); }
function enc(t) { return encodeURIComponent(t); }

/* ---------- Événements ---------- */
$('#niveaux').addEventListener('click', function (e) { var b = e.target.closest('[data-niv]'); if (b) demarrer(b.dataset.niv); });
$('#zoneQcm').addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) repondreQcm(+b.dataset.i); });
$('#liste').addEventListener('click', function (e) {
  var li = e.target.closest('li[data-i]'); if (!li || S.verrou) return;
  S.sel = +li.dataset.i; renderListe($('#recherche').value);
});
$('#recherche').addEventListener('input', function () { renderListe(this.value); });
$('#btnValiderListe').addEventListener('click', validerListe);
$('#scene').addEventListener('pointerdown', function (e) { e.preventDefault(); toucherScene(e); });
$('#btnAnnuler').addEventListener('click', function () { if (S.verrou) return; S.user.pop(); S.pending = null; drawExpert(); });
$('#btnEffacer').addEventListener('click', function () { if (S.verrou) return; S.user = []; S.pending = null; drawExpert(); });
$('#btnValiderExpert').addEventListener('click', validerExpert);
$('#btnSuivant').addEventListener('click', suivant);
$('#btnAccueil').addEventListener('click', renderAccueil);
$('#btnRejouer').addEventListener('click', function () { demarrer(S.niveau); });
$('#btnChangerNiveau').addEventListener('click', renderAccueil);
$('#btnPartager').addEventListener('click', partagerNatif);
$('#btnTelecharger').addEventListener('click', telecharger);
$('#btnWhatsapp').addEventListener('click', function () { ouvrir('https://wa.me/?text=' + enc(texteSocial() + ' ' + lienPartage())); });
$('#btnFacebook').addEventListener('click', function () { ouvrir('https://www.facebook.com/sharer/sharer.php?u=' + enc(lienPartage()) + '&quote=' + enc(texteSocial())); });
$('#btnX').addEventListener('click', function () { ouvrir('https://twitter.com/intent/tweet?text=' + enc(texteSocial()) + '&url=' + enc(lienPartage())); });

$('#logo').innerHTML = window.teleLogoSVG(CFG.couleurs.logo || '#ed1c24');
document.title = CFG.titre + ' — ' + CFG.marque;
renderAccueil();

})();
