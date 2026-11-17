// Ciel ce soir : prévisions de la nuit à venir pour chaque ville, score par ville,
// par département et pour la région, texte du post, alerte Telegram.
// Données : Open-Meteo (https://open-meteo.com). Lancé tous les jours à 9 h (heure de Paris).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(readFileSync(join(DIR, 'villes.json'), 'utf8'));
const EVENT = process.env.GITHUB_EVENT_NAME || 'local';
const TZ = 'Europe/Paris';

/* ---------- heure de Paris ---------- */
function parisParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
  const o = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hour: +o.hour % 24 };
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- Lune (phase approchée, suffisante pour dire « gênante » ou non) ---------- */
function lune(dateIso) {
  const jd = new Date(dateIso + 'T21:00:00Z').getTime() / 86400000 + 2440587.5;
  const age = (((jd - 2451550.1) / 29.530588853) % 1 + 1) % 1;
  const pct = Math.round((1 - Math.cos(2 * Math.PI * age)) / 2 * 100);
  let nom;
  if (age < 0.03 || age >= 0.97) nom = 'nouvelle Lune';
  else if (age < 0.22) nom = 'premier croissant';
  else if (age < 0.28) nom = 'premier quartier';
  else if (age < 0.47) nom = 'Lune gibbeuse croissante';
  else if (age < 0.53) nom = 'pleine Lune';
  else if (age < 0.72) nom = 'Lune gibbeuse décroissante';
  else if (age < 0.78) nom = 'dernier quartier';
  else nom = 'dernier croissant';
  const gene = pct < 10 ? 'quasi absente, idéale pour le ciel profond'
    : pct < 35 ? 'peu gênante pour le ciel profond'
    : pct < 70 ? 'présente, les objets faibles seront moins contrastés'
    : 'très lumineuse, elle éclipse les objets faibles mais la Lune elle-même sera superbe';
  return { pct, nom, gene };
}

/* ---------- Score d'une heure (0-100) ---------- */
export function scoreHeure(h) {
  const n = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const total = n(h.cloud_cover), low = n(h.cloud_cover_low), mid = n(h.cloud_cover_mid), high = n(h.cloud_cover_high);
  if (total === null) return null;
  const blend = (low ?? total) * 0.5 + (mid ?? total) * 0.3 + (high ?? total) * 0.2;   // nuages bas = les pires, cirrus = les moins gênants
  let s = 100 - (0.5 * total + 0.5 * blend);
  const pluie = n(h.precipitation), proba = n(h.precipitation_probability);
  if (pluie !== null && pluie >= 0.1) s = Math.min(s, 10);
  else if (proba !== null && proba >= 50) s -= 30;
  else if (proba !== null && proba >= 30) s -= 15;
  const rafales = n(h.wind_gusts_10m);
  if (rafales !== null) s -= rafales > 60 ? 30 : rafales > 45 ? 20 : rafales > 30 ? 10 : 0;
  const t = n(h.temperature_2m), dp = n(h.dew_point_2m);
  if (t !== null && dp !== null) { const e = t - dp; s -= e < 1 ? 15 : e < 2 ? 8 : 0; }          // buée / brouillard
  const vis = n(h.visibility);
  if (vis !== null) s -= vis < 2000 ? 25 : vis < 5000 ? 12 : 0;
  return Math.max(0, Math.min(100, s));
}
const etat = s => s >= 80 ? { mot: 'Excellent', p: '🟢' } : s >= 65 ? { mot: 'Bon', p: '🟢' } : s >= 40 ? { mot: 'Mitigé', p: '🟠' } : { mot: 'Couvert', p: '🔴' };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const hh = h => `${h % 24} h`;

/* ---------- Prévisions d'une ville ---------- */
const VARS = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation_probability,precipitation,wind_gusts_10m,temperature_2m,dew_point_2m';
async function prevision(v) {
  if (process.env.CIEL_MOCK) return JSON.parse(readFileSync(process.env.CIEL_MOCK, 'utf8'))[v.nom];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}&hourly=${VARS}&timezone=${encodeURIComponent(TZ)}&forecast_days=2`;
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { err = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw err;
}
function heuresNuit(json, date) {
  const H = json.hourly, out = [];
  for (let h = CFG.fenetre.debut; h < CFG.fenetre.fin; h++) {
    const d = h >= 24 ? addDays(date, 1) : date, key = `${d}T${String(h % 24).padStart(2, '0')}:00`;
    const i = H.time.indexOf(key);
    if (i < 0) continue;
    const o = { h }; for (const k of Object.keys(H)) if (k !== 'time') o[k] = H[k][i];
    o.score = scoreHeure(o);
    if (o.score !== null) out.push(o);
  }
  return out;
}
function meilleureFenetre(heures, largeur = 3) {
  if (heures.length < largeur) return null;
  let best = null;
  for (let i = 0; i + largeur <= heures.length; i++) {
    const m = mean(heures.slice(i, i + largeur).map(x => x.score));
    if (!best || m > best.m) best = { m, a: heures[i].h, b: heures[i + largeur - 1].h + 1 };
  }
  return `${hh(best.a)}–${hh(best.b)}`;
}
const pondere = hs => { let s = 0, w = 0; for (const x of hs) { const p = x.h < 24 ? 1 : 0.6; s += x.score * p; w += p; } return s / w; };

/* ---------- Texte du post ---------- */
function titre(region, deps) {
  const best = deps[0], worst = deps[deps.length - 1];
  if (region.score >= 80) return { t: 'Conditions excellentes pour observer le ciel ce soir en Bretagne', sub: '' };
  if (best.score >= 75 && worst.score < 45) {
    const hauts = deps.filter(d => d.score >= 65).map(d => d.nom), bas = deps.filter(d => d.score < 40).map(d => d.nom);
    return { t: 'Observer les étoiles ce soir : ciel partagé en Bretagne', sub: `Dégagé : ${hauts.join(', ')}${bas.length ? ' · couvert : ' + bas.join(', ') : ''}` };
  }
  if (region.score >= 65) return { t: 'Belle soirée pour observer les étoiles en Bretagne', sub: '' };
  if (region.score >= 40) return { t: 'Observer les étoiles ce soir : ciel mitigé en Bretagne', sub: '' };
  return { t: 'Observer les étoiles ce soir : ciel couvert en Bretagne', sub: '' };
}
const ART = {
  'Finistère': { le: 'le Finistère', dans: 'dans le Finistère' },
  'Morbihan': { le: 'le Morbihan', dans: 'dans le Morbihan' },
  "Côtes-d'Armor": { le: "les Côtes-d'Armor", dans: "dans les Côtes-d'Armor", pl: true, fem: true },
  'Ille-et-Vilaine': { le: "l'Ille-et-Vilaine", dans: "en Ille-et-Vilaine" }
};
const art = d => ART[d.nom] || { le: d.nom, dans: 'en ' + d.nom };
const liste = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const groupesVilles = d => {
  const g = { '🟢': [], '🟠': [], '🔴': [] };
  for (const v of d.villes) g[v.etat.p].push(v.nom);
  return g;
};
const homogene = d => { const g = groupesVilles(d); return [g['🟢'], g['🟠'], g['🔴']].filter(x => x.length).length === 1; };
function phraseMixte(d) {
  const A = art(d), g = groupesVilles(d), p = d.etat.p, det = [];
  if (g['🟢'].length) det.push(`dégagé à ${liste(g['🟢'])}`);
  if (g['🟠'].length) det.push(`partagé à ${liste(g['🟠'])}`);
  if (g['🔴'].length) det.push(`couvert à ${liste(g['🔴'])}`);
  const tete = p === '🟢' ? `${cap(A.le)} ${A.pl ? 'sont' : 'est'} plutôt bien placé${A.fem ? 'es' : A.pl ? 's' : ''} ce soir`
    : p === '🟠' ? `${cap(A.dans)}, le ciel est contrasté ce soir`
    : `${cap(A.dans)}, le ciel reste couvert dans l’ensemble`;
  return `${tete} : ${det.join(', ')}.`;
}
function phrasesGroupe(p, ds, tous) {
  const A = ds.map(art), un = ds.length === 1;
  const villes = un ? ` à ${liste(ds[0].villes.map(v => v.nom))}` : '';
  if (p === '🟢') {
    const plur = !un || A[0].pl, fem = A.every(x => x.fem);
    return `${cap(liste(A.map(x => x.le)))} ${plur ? 'sont' : 'est'} bien placé${fem ? 'es' : plur ? 's' : ''} ce soir : le ciel s’annonce dégagé${villes}.`;
  }
  if (p === '🟠') return `${cap(liste(A.map(x => x.dans)))}, le ciel sera partagé entre nuages et éclaircies${villes}.`;
  return `${tous ? 'Malheureusement, ' : ''}le ciel restera couvert ${liste(A.map(x => x.dans))}${villes ? ',' + villes : ''}.`.replace(/^le/, 'Le');
}
function corpsTexte(deps) {
  const homo = deps.filter(homogene), ps = new Set(homo.map(d => d.etat.p));
  // tout le monde dans le même état : une seule phrase pour la région
  if (homo.length === deps.length && ps.size === 1) {
    const p = deps[0].etat.p;
    return [p === '🟢' ? 'Bonne nouvelle : le ciel s’annonce dégagé sur toute la Bretagne ce soir.'
      : p === '🟠' ? 'Le ciel sera partagé entre nuages et éclaircies sur toute la Bretagne ce soir.'
      : 'Malheureusement, le ciel restera couvert sur toute la Bretagne ce soir.'];
  }
  const out = [], vu = new Set();
  const ordre = ['🟢', '🟠', '🔴'];
  for (const d of deps) {
    if (vu.has(d.nom)) continue;
    if (!homogene(d)) { out.push(phraseMixte(d)); vu.add(d.nom); continue; }
    const grp = homo.filter(x => x.etat.p === d.etat.p);
    grp.forEach(x => vu.add(x.nom));
    out.push({ p: d.etat.p, s: phrasesGroupe(d.etat.p, grp, false) });
  }
  // couvert : « Malheureusement » seulement s'il y a aussi de bonnes nouvelles avant
  return out.map(o => typeof o === 'string' ? o : o.p === '🔴' && out.length > 1 && out.some(x => x.p === '🟢' || x.p === '🟠') ? o.s.replace(/^Le /, 'Malheureusement, le ') : o.s);
}
function fenetreTexte(f) {
  const m = /^(\d+) h.(\d+) h$/.exec(f || '');
  if (!m) return null;
  const fin = +m[2] % 24 === 0 ? 'minuit' : `${+m[2] % 24} h`;
  return `entre ${m[1]} h et ${fin}`;
}
function texte(region, deps, lun) {
  const L = [`🔭 ${region.titre}`, ''];
  for (const s of corpsTexte(deps)) { L.push(s); L.push(''); }
  const f = fenetreTexte(region.meilleureFenetre);
  if (f) L.push(`Le meilleur moment pour observer : ${f}.`);
  L.push(`La Lune sera à ${lun.pct} % (${lun.nom}) : ${lun.gene}.`);
  L.push('');
  L.push((region.score >= 65 || deps[0].score >= 75 ? 'Préparez-vous à observer le ciel ce soir ! ' : 'Le ciel s’annonce capricieux : guettez les éclaircies. ') +
    `Pour savoir quoi regarder, rendez-vous dans notre article quotidien : ${CFG.lienArticle}`);
  L.push('');
  L.push('#astronomie #Bretagne #ciel #LeTélégramme');
  return L.join('\n');
}

/* ---------- Telegram ---------- */
async function telegram(msg) {
  const token = process.env.TELEGRAM_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) { console.log('Telegram : secrets absents, message non envoyé.'); return false; }
  const r = await fetch(`${process.env.TELEGRAM_API || 'https://api.telegram.org'}/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: msg, disable_web_page_preview: true })
  });
  if (!r.ok) throw new Error('Telegram HTTP ' + r.status + ' ' + (await r.text()));
  return true;
}

/* ---------- Programme ---------- */
async function main() {
  const now = parisParts();
  const date = now.date;
  if (EVENT === 'schedule') {
    // GitHub peut retarder un déclenchement : on accepte de 9 h à 12 h (heure de Paris), une seule fois par jour.
    if (now.hour < 9 || now.hour > 12) { console.log(`Il est ${now.hour} h à Paris : hors de la plage 9 h à 12 h, on s'arrête.`); return; }
    try {
      const prev = JSON.parse(readFileSync(join(DIR, 'conditions.json'), 'utf8'));
      if (prev.date === date && prev.notifie) { console.log('Déjà traité aujourd’hui, on s’arrête.'); return; }
    } catch { /* pas de fichier : on continue */ }
  }
  const deps = [];
  let erreurs = 0;
  for (const d of CFG.departements) {
    const villes = [];
    for (const v of d.villes) {
      try {
        const hs = heuresNuit(await prevision(v), date);
        if (!hs.length) throw new Error('pas de données pour la fenêtre');
        const score = Math.round(pondere(hs));
        villes.push({
          nom: v.nom, lat: v.lat, lon: v.lon, label: v.label, score, etat: etat(score), meilleureFenetre: meilleureFenetre(hs),
          nuages: Math.round(mean(hs.map(x => x.cloud_cover ?? 0))),
          rafales: Math.round(Math.max(...hs.map(x => x.wind_gusts_10m ?? 0))),
          temperature: Math.round(mean(hs.map(x => x.temperature_2m ?? 0))),
          heures: hs.map(x => ({ h: x.h, score: Math.round(x.score) }))
        });
      } catch (e) { erreurs++; console.error(`Ville ${v.nom} : ${e.message}`); }
    }
    if (villes.length) { const score = Math.round(mean(villes.map(v => v.score))); deps.push({ nom: d.nom, score, etat: etat(score), villes }); }
  }
  if (!deps.length) throw new Error('Aucune ville exploitable : pas de conditions.json mis à jour.');
  deps.sort((a, b) => b.score - a.score);
  const tout = deps.flatMap(d => d.villes);
  const score = Math.round(mean(deps.map(d => d.score)));
  const region = { score, etat: etat(score) };
  const t = titre(region, deps); region.titre = t.t; region.sousTitre = t.sub;
  // meilleure fenêtre de la région : moyenne des heures de toutes les villes
  const parHeure = tout[0].heures.map((x, i) => ({ h: x.h, score: mean(tout.map(v => (v.heures[i] || x).score)) }));
  region.meilleureFenetre = meilleureFenetre(parHeure);
  const lun = lune(date);
  const post = texte(region, deps, lun);
  const alerte = deps[0].score >= CFG.seuilAlerte;
  const out = { genere: new Date().toISOString(), date, notifie: false, fenetre: `${CFG.fenetre.debut} h – ${hh(CFG.fenetre.fin)}`, seuilAlerte: CFG.seuilAlerte, alerte, region, lune: lun, departements: deps, post, lienArticle: CFG.lienArticle, source: 'Open-Meteo' };
  writeFileSync(join(DIR, 'conditions.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`Bretagne ${score}/100 (${region.etat.mot}) · ${deps.map(d => `${d.nom} ${d.score}`).join(' · ')} · alerte : ${alerte}${erreurs ? ` · ${erreurs} ville(s) en erreur` : ''}`);

  const envoyer = alerte || CFG.toujoursNotifier || EVENT === 'workflow_dispatch';
  if (envoyer) {
    const entete = alerte
      ? `🔔 Alerte post ciel : ${region.titre}\nMeilleur département : ${deps[0].nom} (${deps[0].score}/100) · Bretagne ${score}/100\nÀ publier sur LinkedIn dès 11 h.`
      : `ℹ️ Ciel ce soir : pas de post conseillé (meilleur département : ${deps[0].nom}, ${deps[0].score}/100, seuil ${CFG.seuilAlerte}).`;
    await telegram(`${entete}\n\n— Texte du post (à copier) —\n\n${post}\n\nAtelier : ${CFG.atelierUrl}`);
  }
  // marqué « traité » seulement si tout s'est bien passé (sinon le déclenchement suivant réessaie)
  out.notifie = true;
  writeFileSync(join(DIR, 'conditions.json'), JSON.stringify(out, null, 1) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
