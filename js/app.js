/* ============================================================
   LA GRANDE ANNÉE ASTRONOMIQUE — logique de l'application
   Tout est stocké localement dans le navigateur (localStorage).
   ============================================================ */
(function(){
"use strict";

const CATALOG = window.CATALOG || [];
const BY_ID = new Map(CATALOG.map(o => [o.id, o]));

const MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const DAYS_FR = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];

/* ---------------- storage ---------------- */
const LS_KEYS = {
  favorites: "gaa.favorites.v1",
  observed:  "gaa.observed.v1",
  sessions:  "gaa.sessions.v1",
  notes:     "gaa.notes.v1"
};

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return fallback;
    return JSON.parse(raw);
  }catch(e){ return fallback; }
}
function saveJSON(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }
  catch(e){ /* storage full or unavailable — fail silently */ }
}

let favorites = new Set(loadJSON(LS_KEYS.favorites, []));
let observed  = loadJSON(LS_KEYS.observed, {});   // { [id]: [{date, note}, ...] }
let sessions  = loadJSON(LS_KEYS.sessions, []);   // [{id, objectId, date, note}]
let notes     = loadJSON(LS_KEYS.notes, {});      // { [id]: "texte libre" }

function persistFavorites(){ saveJSON(LS_KEYS.favorites, Array.from(favorites)); }
function persistObserved(){ saveJSON(LS_KEYS.observed, observed); }
function persistSessions(){ saveJSON(LS_KEYS.sessions, sessions); }
function persistNotes(){ saveJSON(LS_KEYS.notes, notes); }

function isFavorite(id){ return favorites.has(id); }
function toggleFavorite(id){
  if(favorites.has(id)) favorites.delete(id); else favorites.add(id);
  persistFavorites();
}
function isObserved(id){ return !!(observed[id] && observed[id].length); }
function observedCount(){ return Object.keys(observed).filter(id => observed[id] && observed[id].length).length; }
function lastObservedDate(id){
  const log = observed[id];
  if(!log || !log.length) return null;
  return log.slice().sort((a,b)=> b.date.localeCompare(a.date))[0].date;
}
function toggleObservedQuick(id){
  // Coche/décoche rapide depuis une carte : ajoute ou retire une entrée "aujourd'hui"
  if(isObserved(id)){
    observed[id] = [];
  } else {
    observed[id] = [{ date: todayISO(), note: "" }];
  }
  persistObserved();
}
function addObservationLog(id, date, note){
  if(!observed[id]) observed[id] = [];
  observed[id].push({ date: date || todayISO(), note: note || "" });
  observed[id].sort((a,b)=> b.date.localeCompare(a.date));
  persistObserved();
}
function removeObservationLog(id, index){
  if(!observed[id]) return;
  observed[id].splice(index,1);
  persistObserved();
}

function addSession(objectId, date, note){
  const id = "s" + Date.now() + Math.random().toString(36).slice(2,6);
  sessions.push({ id, objectId, date, note: note || "" });
  persistSessions();
  return id;
}
function removeSession(sessionId){
  sessions = sessions.filter(s => s.id !== sessionId);
  persistSessions();
}
function sessionsForDate(date){ return sessions.filter(s => s.date === date); }
function sessionsForObject(id){ return sessions.filter(s => s.objectId === id); }

function getNote(id){ return notes[id] || ""; }
function setNote(id, value){ notes[id] = value; persistNotes(); }

function todayISO(){ return new Date().toISOString().slice(0,10); }

/* ---------------- helpers de domaine ---------------- */
function difficultySlug(d){
  d = (d||"").toLowerCase();
  if(d.includes("très")) return "tresdifficile";
  if(d.includes("difficile")) return "difficile";
  if(d.includes("moyen")) return "moyen";
  if(d.includes("facile")) return "facile";
  return "";
}
function difficultyWeight(d){
  return { facile:0, moyen:1, difficile:2, tresdifficile:3 }[difficultySlug(d)] ?? 4;
}
function parseMagnitude(m){
  const v = parseFloat((m||"").replace(",", "."));
  return isNaN(v) ? 99 : v;
}
function parseHauteur(h){
  const v = parseFloat((h||"").replace("°",""));
  return isNaN(v) ? -1 : v;
}
function categorize(type){
  const t = (type||"").toLowerCase();
  if(t.includes("supernova")) return "remnant";
  if(t.includes("globulaire")) return "globular";
  if(t.includes("planétaire")) return "planetary";
  if(t.includes("obscure")) return "dark";
  if(t.includes("ouvert") || t.includes("astérisme") || t.includes("amas")) return "cluster";
  if(t.includes("nébul") || t.includes("région h") || t.includes("émission")) return "nebula";
  if(t.includes("galax")) return "galaxy";
  if(t.includes("étoile") || t.includes("stellaire")) return "star";
  return "other";
}

/* ---------------- icônes SVG (par catégorie d'objet) ---------------- */
const ICON_COLORS = {
  galaxy:"#4fd8c9", cluster:"#e8c170", globular:"#e8c170",
  nebula:"#ff7a5c", planetary:"#ff7a5c", dark:"#9aa1c7",
  remnant:"#ff6688", star:"#eef0fb", other:"#9aa1c7"
};
function iconSVG(cat){
  const c = ICON_COLORS[cat] || ICON_COLORS.other;
  switch(cat){
    case "galaxy":
      return `<svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="9" ry="4" stroke="${c}" stroke-width="1.3"/><path d="M4 12c1.5-2.4 4.6-4 8-4s6.5 1.6 8 4c-1.5 2.4-4.6 4-8 4s-6.5-1.6-8-4z" stroke="${c}" stroke-width="1.1" opacity="0.6"/><circle cx="12" cy="12" r="1.6" fill="${c}"/></svg>`;
    case "cluster":
      return `<svg viewBox="0 0 24 24" fill="${c}"><circle cx="7" cy="8" r="1.4"/><circle cx="13" cy="6" r="1.1"/><circle cx="17" cy="10" r="1.3"/><circle cx="9" cy="13" r="1.6"/><circle cx="15" cy="15" r="1.2"/><circle cx="6" cy="16" r="1"/><circle cx="12" cy="18" r="1.3"/></svg>`;
    case "globular":
      return `<svg viewBox="0 0 24 24" fill="${c}"><circle cx="12" cy="12" r="1.8"/><circle cx="8.5" cy="9" r="1"/><circle cx="15.5" cy="9.5" r="1"/><circle cx="9" cy="15" r="0.9"/><circle cx="15" cy="15.5" r="0.9"/><circle cx="12" cy="7.2" r="0.8"/><circle cx="12" cy="16.8" r="0.8"/><circle cx="7" cy="12" r="0.7"/><circle cx="17" cy="12.5" r="0.7"/></svg>`;
    case "nebula":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.2"><path d="M4 14c0-3 2.5-5 5-4.6C9.6 6.8 12 5 14.5 6.2c2 1 2.3 3 1.8 4.4 2 .2 3.7 1.8 3.7 3.8 0 2.3-2.3 4.1-5 4.1H7.8C5.7 18.5 4 16.6 4 14z"/></svg>`;
    case "planetary":
      return `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="${c}" stroke-width="1.3"/><circle cx="12" cy="12" r="1.6" fill="${c}"/></svg>`;
    case "dark":
      return `<svg viewBox="0 0 24 24" fill="${c}" opacity="0.85"><path d="M6 15c-1.6-1.3-2-3.7-.6-5.4C6.6 8 9 7.7 10.7 8.8c.6-2 2.7-3.3 4.8-2.7 2 .6 3.2 2.6 2.9 4.6 1.8.5 3 2.2 2.7 4.1-.3 2-2.3 3.4-4.5 3.1H9.2C7.3 18 6 16.8 6 15z"/></svg>`;
    case "remnant":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"><path d="M12 3l1.6 5.4L19 7l-3 4.6L20 15l-5.6.4L13 21l-1.6-5.4L6 17l3-4.6L4 9l5.6-.4z"/></svg>`;
    case "star":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.3"><path d="M6 18L11 13M18 6L13 11" stroke-linecap="round"/><circle cx="6" cy="18" r="1.3" fill="${c}" stroke="none"/><circle cx="18" cy="6" r="1.3" fill="${c}" stroke="none"/><circle cx="12.5" cy="12" r="1" fill="${c}" stroke="none"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" fill="${c}"><path d="M12 3l1.2 6.8L20 11l-6.8 1.2L12 19l-1.2-6.8L4 11l6.8-1.2z"/></svg>`;
  }
}

/* ---------------- parsing "meilleure période" pour le mois courant ---------------- */
function isVisibleInMonth(obj, monthNumber){
  return Array.isArray(obj.bestMonths) && obj.bestMonths.includes(monthNumber);
}

/* ============================================================
   FILTRES & TRI
   ============================================================ */
const state = {
  search: "",
  type: "",
  constellation: "",
  difficulte: "",
  collection: "",
  sort: "fiche",
  monthOnly: false,
  favOnly: false,
  unseenOnly: false,
  renderLimit: 60
};

function normalize(str){
  return (str||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function applyFilters(){
  const q = normalize(state.search);
  const currentMonth = new Date().getMonth() + 1;
  let list = CATALOG.filter(o => {
    if(q){
      const hay = normalize(o.title + " " + o.designation + " " + o.constellation + " " + o.type);
      if(!hay.includes(q)) return false;
    }
    if(state.type && o.type !== state.type) return false;
    if(state.constellation && o.constellation !== state.constellation) return false;
    if(state.difficulte && difficultySlug(o.difficulte) !== state.difficulte) return false;
    if(state.collection && o.collectionLabel !== state.collection) return false;
    if(state.monthOnly && !isVisibleInMonth(o, currentMonth)) return false;
    if(state.favOnly && !isFavorite(o.id)) return false;
    if(state.unseenOnly && isObserved(o.id)) return false;
    return true;
  });

  switch(state.sort){
    case "magnitude":
      list.sort((a,b)=> parseMagnitude(a.magnitude) - parseMagnitude(b.magnitude)); break;
    case "difficulte":
      list.sort((a,b)=> difficultyWeight(a.difficulte) - difficultyWeight(b.difficulte)); break;
    case "hauteur":
      list.sort((a,b)=> parseHauteur(b.hauteurMax) - parseHauteur(a.hauteurMax)); break;
    case "nom":
      list.sort((a,b)=> a.title.localeCompare(b.title, "fr")); break;
    default:
      list.sort((a,b)=> (a.volume - b.volume) || (a.fiche - b.fiche));
  }
  return list;
}

/* ============================================================
   RENDU : cartes
   ============================================================ */
function cardHTML(o){
  const cat = categorize(o.type);
  const dSlug = difficultySlug(o.difficulte);
  const fav = isFavorite(o.id);
  const seen = isObserved(o.id);
  return `
  <article class="card" data-id="${o.id}" tabindex="0">
    <div class="card-top">
      <div class="card-icon-wrap">${iconSVG(cat)}</div>
      <button class="fav-btn ${fav?'is-fav':''}" data-action="fav" data-id="${o.id}" aria-label="Basculer favori" type="button">
        <svg viewBox="0 0 24 24" fill="${fav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.4"><path d="M12 4l2.2 5.6 6 .4-4.6 3.9 1.5 5.8L12 16.8 6.9 19.7l1.5-5.8L3.8 10l6-.4z" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="card-name">${o.title}</div>
    <div class="card-meta">${o.designation || ""} · ${o.constellation}</div>
    <div class="card-badges">
      ${dSlug ? `<span class="badge badge-diff" data-d="${dSlug}">${o.difficulte}</span>` : ""}
      ${o.magnitude ? `<span class="badge">m ${o.magnitude}</span>` : ""}
    </div>
    <div class="card-foot">
      <span class="observed-toggle ${seen?'is-done':''}" data-action="observed" data-id="${o.id}">
        <span class="observed-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12l5 5L20 6"/></svg></span>
        ${seen ? "Observé" : "Observer"}
      </span>
    </div>
  </article>`;
}

function renderGridInto(container, list, opts){
  opts = opts || {};
  container.innerHTML = "";
  const limit = opts.incremental ? Math.min(state.renderLimit, list.length) : list.length;
  const slice = list.slice(0, limit);
  container.insertAdjacentHTML("beforeend", slice.map(cardHTML).join(""));
  return list.length;
}

let currentCatalogList = [];
function renderCatalog(reset){
  if(reset) state.renderLimit = 60;
  currentCatalogList = applyFilters();
  const grid = document.getElementById("catalogGrid");
  const empty = document.getElementById("emptyState");
  const count = document.getElementById("resultCount");
  renderGridInto(grid, currentCatalogList, { incremental:true });
  empty.hidden = currentCatalogList.length !== 0;
  count.textContent = currentCatalogList.length + (currentCatalogList.length>1 ? " objets trouvés" : " objet trouvé");
}
function maybeLoadMore(){
  if(state.renderLimit >= currentCatalogList.length) return;
  state.renderLimit += 60;
  const grid = document.getElementById("catalogGrid");
  renderGridInto(grid, currentCatalogList, { incremental:true });
}

function renderFavoris(){
  const grid = document.getElementById("favGrid");
  const empty = document.getElementById("favEmpty");
  const list = CATALOG.filter(o => isFavorite(o.id));
  renderGridInto(grid, list);
  empty.hidden = list.length !== 0;
}

function updateProgress(){
  const n = observedCount();
  document.getElementById("progressCount").textContent = n;
  document.getElementById("progressFill").style.width = Math.min(100, (n/954)*100) + "%";
}

/* ---------------- "bien placés ce mois-ci" ---------------- */
function capFirst(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function renderTonight(){
  const monthNumber = new Date().getMonth() + 1;
  document.getElementById("tonightMonthLabel").textContent = "Sélection pour " + MONTHS_FR[monthNumber-1];
  let list = CATALOG.filter(o => isVisibleInMonth(o, monthNumber));
  list.sort((a,b)=> (b.interetPhoto||"").length - (a.interetPhoto||"").length || parseMagnitude(a.magnitude)-parseMagnitude(b.magnitude));
  list = list.slice(0, 14);
  const row = document.getElementById("tonightRow");
  row.innerHTML = list.map(o => `
    <div class="tonight-card" data-id="${o.id}">
      <div class="t-icon">${iconSVG(categorize(o.type))}</div>
      <span class="t-name">${o.title}</span>
      <span class="t-meta">${o.constellation}${o.magnitude ? " · m "+o.magnitude : ""}</span>
    </div>`).join("");
}

/* ============================================================
   FILTRES : peuplement des menus déroulants
   ============================================================ */
function populateFilters(){
  const typeSel = document.getElementById("filterType");
  const constSel = document.getElementById("filterConstellation");
  const diffSel = document.getElementById("filterDifficulte");
  const collSel = document.getElementById("filterCollection");

  const types = Array.from(new Set(CATALOG.map(o=>o.type))).filter(Boolean).sort((a,b)=>a.localeCompare(b,"fr"));
  types.forEach(t => typeSel.insertAdjacentHTML("beforeend", `<option value="${t}">${t}</option>`));

  const consts = Array.from(new Set(CATALOG.map(o=>o.constellation))).filter(Boolean).sort((a,b)=>a.localeCompare(b,"fr"));
  consts.forEach(c => constSel.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));

  [["facile","Facile"],["moyen","Moyen"],["difficile","Difficile"],["tresdifficile","Très difficile"]]
    .forEach(([v,l]) => diffSel.insertAdjacentHTML("beforeend", `<option value="${v}">${l}</option>`));

  const colls = Array.from(new Set(CATALOG.map(o=>o.collectionLabel))).filter(Boolean);
  colls.forEach(c => collSel.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
}

/* ============================================================
   MODALE — fiche détaillée d'un objet
   ============================================================ */
const modalBackdrop = document.getElementById("modalBackdrop");
const modalBody = document.getElementById("modalBody");
let currentObjectId = null;

function fieldRow(label, value, extraClass){
  if(!value) return "";
  return `<div class="md-row"><span class="k">${label}</span><span class="v ${extraClass||''}">${value}</span></div>`;
}

function renderModal(o){
  currentObjectId = o.id;
  const cat = categorize(o.type);
  const fav = isFavorite(o.id);
  const log = (observed[o.id] || []).slice().sort((a,b)=> b.date.localeCompare(a.date));
  const planned = sessionsForObject(o.id).slice().sort((a,b)=> a.date.localeCompare(b.date));

  modalBody.innerHTML = `
    <div class="md-head">
      <div class="md-type-row">
        <div class="md-icon-wrap">${iconSVG(cat)}</div>
        <span class="md-type">${o.type}${o.catalogue ? " · "+o.catalogue : ""}</span>
      </div>
      <h3 class="md-title" id="modalTitle">${o.title}</h3>
      <p class="md-sub">${o.designation || ""} · ${o.constellation}</p>
      <p class="md-fiche">${o.collectionLabel} · fiche ${String(o.fiche).padStart(3,"0")}/${o.ficheTotal}</p>
    </div>

    <div class="md-actions">
      <button class="btn btn-gold ${fav?'is-on':''}" id="mdFavBtn" type="button">
        <svg viewBox="0 0 24 24" fill="${fav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.4"><path d="M12 4l2.2 5.6 6 .4-4.6 3.9 1.5 5.8L12 16.8 6.9 19.7l1.5-5.8L3.8 10l6-.4z" stroke-linejoin="round"/></svg>
        ${fav ? "Favori" : "Ajouter aux favoris"}
      </button>
      <button class="btn btn-teal ${isObserved(o.id)?'is-on':''}" id="mdObsBtn" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 12l5 5L20 6"/></svg>
        ${isObserved(o.id) ? "Déjà observé" : "Marquer observé"}
      </button>
    </div>

    <p class="md-desc">${o.description}</p>

    <div class="md-table">
      ${fieldRow("Taille angulaire", o.tailleAngulaire)}
      ${fieldRow("Taille sur capteur", o.tailleCapteur)}
      ${fieldRow("Coordonnées J2000", o.coordonnees)}
      ${fieldRow("Champ occupé", o.champOccupe)}
      ${fieldRow("Hauteur maximale", o.hauteurMax)}
      ${fieldRow("Magnitude", o.magnitude)}
      ${fieldRow("Opacité (Barnard)", o.opaciteBarnard)}
      ${fieldRow("Meilleure période", o.meilleurePeriode)}
      ${fieldRow("Difficulté", o.difficulte)}
      ${fieldRow("Signal dominant", o.signalDominant)}
      ${fieldRow("Intérêt photo", o.interetPhoto, "md-stars")}
      ${fieldRow("Pose conseillée", o.poseConseillee)}
      ${fieldRow("Cadrage conseillé", o.cadrage)}
      ${fieldRow("Créneau / observation", o.creneau)}
    </div>

    <p class="md-section-label">Notes personnelles</p>
    <textarea class="md-textarea" id="mdNotes" placeholder="Réglages, conditions de ciel, retours d'expérience…">${getNote(o.id)}</textarea>

    <p class="md-section-label">Journal d'observation</p>
    <div id="mdLog">
      ${log.length ? log.map((entry,i)=>`
        <div class="md-log-item">
          <span><span class="md-log-date">${formatDateFR(entry.date)}</span>${entry.note ? " — "+entry.note : ""}</span>
          <button class="md-log-remove" data-i="${i}" type="button" aria-label="Supprimer">✕</button>
        </div>`).join("") : `<p class="panel-sub" style="margin-bottom:8px;">Aucune observation enregistrée.</p>`}
    </div>
    <div class="md-add-row">
      <input type="date" id="mdLogDate" value="${todayISO()}">
      <button class="btn" id="mdLogAdd" type="button">+ Ajouter</button>
    </div>

    <p class="md-section-label">Planifier une nuit d'observation</p>
    <div id="mdSessions">
      ${planned.length ? planned.map(s=>`
        <div class="md-session-item">
          <span class="md-session-date">${formatDateFR(s.date)}</span>
          <button class="md-log-remove" data-sid="${s.id}" type="button" aria-label="Supprimer">✕</button>
        </div>`).join("") : `<p class="panel-sub" style="margin-bottom:8px;">Aucune séance planifiée.</p>`}
    </div>
    <div class="md-add-row">
      <input type="date" id="mdPlanDate" value="${todayISO()}">
      <button class="btn" id="mdPlanAdd" type="button">+ Planifier</button>
    </div>
  `;

  document.getElementById("mdFavBtn").onclick = () => {
    toggleFavorite(o.id);
    renderModal(o);
    refreshAfterMutation();
  };
  document.getElementById("mdObsBtn").onclick = () => {
    if(isObserved(o.id)){
      showToast("Déjà marqué observé — ajoutez ou retirez des dates dans le journal ci-dessous.");
    } else {
      addObservationLog(o.id, todayISO(), "");
      renderModal(o);
      refreshAfterMutation();
      showToast("Ajouté à votre journal d'observation.");
    }
  };
  document.getElementById("mdNotes").addEventListener("change", (e)=> setNote(o.id, e.target.value));
  document.getElementById("mdLogAdd").onclick = () => {
    const date = document.getElementById("mdLogDate").value || todayISO();
    addObservationLog(o.id, date, "");
    renderModal(o);
    refreshAfterMutation();
  };
  modalBody.querySelectorAll("[data-i]").forEach(btn=>{
    btn.onclick = () => { removeObservationLog(o.id, parseInt(btn.dataset.i,10)); renderModal(o); refreshAfterMutation(); };
  });
  document.getElementById("mdPlanAdd").onclick = () => {
    const date = document.getElementById("mdPlanDate").value || todayISO();
    addSession(o.id, date, "");
    renderModal(o);
    if(document.getElementById("panel-calendrier").classList.contains("is-active")) renderCalendar();
    showToast("Séance ajoutée au calendrier.");
  };
  modalBody.querySelectorAll("[data-sid]").forEach(btn=>{
    btn.onclick = () => { removeSession(btn.dataset.sid); renderModal(o); if(document.getElementById("panel-calendrier").classList.contains("is-active")) renderCalendar(); };
  });
}

function openModal(id){
  const o = BY_ID.get(id);
  if(!o) return;
  renderModal(o);
  modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal(){
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  currentObjectId = null;
}
document.getElementById("modalClose").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e)=>{ if(e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", (e)=>{ if(e.key === "Escape"){ closeModal(); closePicker(); } });

function formatDateFR(iso){
  if(!iso) return "";
  const [y,m,d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_FR[m-1].slice(0,3)}. ${y}`;
}

function refreshAfterMutation(){
  updateProgress();
  const activeTab = document.querySelector(".tab-btn.is-active").dataset.tab;
  if(activeTab === "catalogue") renderCatalog(false);
  if(activeTab === "favoris") renderFavoris();
  if(activeTab === "journal") renderJournal();
  if(activeTab === "calendrier") renderCalendar();
  renderTonight();
}

/* ============================================================
   CALENDRIER
   ============================================================ */
let calViewDate = new Date();
let selectedDay = null;

function renderCalendar(){
  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  document.getElementById("calLabel").textContent = capFirst(`${MONTHS_FR[month]} ${year}`);

  const firstOfMonth = new Date(year, month, 1);
  let startWeekday = firstOfMonth.getDay(); // 0=dim
  startWeekday = (startWeekday === 0) ? 6 : startWeekday - 1; // lundi=0
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for(let i=0;i<startWeekday;i++){
    const d = daysInPrevMonth - startWeekday + 1 + i;
    cells.push({ day:d, outside:true, iso:null });
  }
  for(let d=1; d<=daysInMonth; d++){
    const iso = isoDate(year, month, d);
    cells.push({ day:d, outside:false, iso });
  }
  while(cells.length % 7 !== 0){
    const d = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ day:d, outside:true, iso:null });
  }

  const todayIso = todayISO();
  const grid = document.getElementById("calGrid");
  grid.innerHTML = cells.map(c => {
    if(c.outside) return `<div class="cal-cell is-outside"><span class="cal-daynum">${c.day}</span></div>`;
    const sess = sessionsForDate(c.iso);
    const isToday = c.iso === todayIso;
    const dots = sess.slice(0,4).map(s => {
      const done = observed[s.objectId] && observed[s.objectId].some(l=>l.date===s.date);
      return `<span class="cal-dot ${done?'done':''}"></span>`;
    }).join("");
    return `<div class="cal-cell ${isToday?'is-today':''}" data-iso="${c.iso}">
      <span class="cal-daynum">${c.day}</span>
      <span class="cal-dots">${dots}</span>
    </div>`;
  }).join("");

  grid.querySelectorAll("[data-iso]").forEach(cell => {
    cell.addEventListener("click", () => openDayPanel(cell.dataset.iso));
  });

  if(selectedDay && cells.some(c=>c.iso===selectedDay)){
    openDayPanel(selectedDay);
  }
}
function isoDate(y,m,d){
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function openDayPanel(iso){
  selectedDay = iso;
  const panel = document.getElementById("calDayPanel");
  panel.hidden = false;
  const dateObj = new Date(iso + "T00:00:00");
  const weekday = DAYS_FR[(dateObj.getDay()+6)%7];
  document.getElementById("calDayTitle").textContent = capFirst(`${weekday} ${dateObj.getDate()} ${MONTHS_FR[dateObj.getMonth()]}`);
  const list = sessionsForDate(iso);
  const container = document.getElementById("calDaySessions");
  container.innerHTML = list.length ? list.map(s=>{
    const o = BY_ID.get(s.objectId);
    if(!o) return "";
    const done = observed[o.id] && observed[o.id].some(l=>l.date===s.date);
    return `<div class="md-session-item" data-open="${o.id}">
      <span style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <span class="journal-icon" style="width:22px;height:22px;">${iconSVG(categorize(o.type))}</span>
        ${o.title}${done ? " · <span style='color:var(--oiii)'>observé</span>" : ""}
      </span>
      <button class="md-log-remove" data-sid="${s.id}" type="button" aria-label="Retirer">✕</button>
    </div>`;
  }).join("") : `<p class="panel-sub" style="margin-bottom:10px;">Aucun objet planifié cette nuit-là.</p>`;

  container.querySelectorAll("[data-open]").forEach(el=>{
    el.querySelector("span").addEventListener("click", ()=> openModal(parseInt(el.dataset.open,10)));
  });
  container.querySelectorAll("[data-sid]").forEach(btn=>{
    btn.addEventListener("click", ()=>{ removeSession(btn.dataset.sid); renderCalendar(); });
  });
}

document.getElementById("calPrev").addEventListener("click", ()=>{ calViewDate.setMonth(calViewDate.getMonth()-1); renderCalendar(); });
document.getElementById("calNext").addEventListener("click", ()=>{ calViewDate.setMonth(calViewDate.getMonth()+1); renderCalendar(); });
document.getElementById("calToday").addEventListener("click", ()=>{ calViewDate = new Date(); renderCalendar(); openDayPanel(todayISO()); });
document.getElementById("calDayClose").addEventListener("click", ()=>{ document.getElementById("calDayPanel").hidden = true; selectedDay = null; });
document.getElementById("calAddSession").addEventListener("click", ()=> openPicker(selectedDay));

/* ============================================================
   PICKER — mini recherche d'objet pour le calendrier
   ============================================================ */
const pickerBackdrop = document.getElementById("pickerBackdrop");
let pickerTargetDate = null;

function openPicker(dateIso){
  pickerTargetDate = dateIso;
  pickerBackdrop.hidden = false;
  document.getElementById("pickerSearch").value = "";
  renderPickerResults("");
  setTimeout(()=> document.getElementById("pickerSearch").focus(), 30);
}
function closePicker(){ pickerBackdrop.hidden = true; }
document.getElementById("pickerClose").addEventListener("click", closePicker);
pickerBackdrop.addEventListener("click",(e)=>{ if(e.target===pickerBackdrop) closePicker(); });

function renderPickerResults(q){
  q = normalize(q);
  const results = document.getElementById("pickerResults");
  let list = CATALOG;
  if(q) list = list.filter(o => normalize(o.title+" "+o.designation+" "+o.constellation).includes(q));
  list = list.slice(0, 40);
  results.innerHTML = list.map(o => `
    <div class="picker-row" data-id="${o.id}">
      <span class="pr-icon">${iconSVG(categorize(o.type))}</span>
      <span>${o.title}</span>
      <span class="pr-meta">${o.constellation}</span>
    </div>`).join("") || `<p class="panel-sub">Aucun résultat.</p>`;
  results.querySelectorAll(".picker-row").forEach(row=>{
    row.addEventListener("click", ()=>{
      const id = parseInt(row.dataset.id,10);
      addSession(id, pickerTargetDate, "");
      closePicker();
      renderCalendar();
      showToast("Ajouté à la nuit du " + formatDateFR(pickerTargetDate) + ".");
    });
  });
}
document.getElementById("pickerSearch").addEventListener("input", (e)=> renderPickerResults(e.target.value));

/* ============================================================
   JOURNAL
   ============================================================ */
function renderJournal(){
  const entries = [];
  Object.keys(observed).forEach(id=>{
    (observed[id]||[]).forEach(log=>{
      entries.push({ id: parseInt(id,10), date: log.date, note: log.note });
    });
  });
  entries.sort((a,b)=> b.date.localeCompare(a.date));
  const container = document.getElementById("journalList");
  const empty = document.getElementById("journalEmpty");
  empty.hidden = entries.length !== 0;
  container.innerHTML = entries.map(e => {
    const o = BY_ID.get(e.id);
    if(!o) return "";
    return `<div class="journal-item" data-id="${o.id}">
      <span class="journal-date">${formatDateFR(e.date)}</span>
      <span class="journal-icon">${iconSVG(categorize(o.type))}</span>
      <span class="journal-name">${o.title}</span>
      <span class="journal-note">${e.note || ""}</span>
    </div>`;
  }).join("");
  container.querySelectorAll(".journal-item").forEach(el=>{
    el.addEventListener("click", ()=> openModal(parseInt(el.dataset.id,10)));
  });
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function showToast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.hidden = true, 2600);
}

/* ============================================================
   NAVIGATION PAR ONGLETS
   ============================================================ */
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.getElementById("panel-"+btn.dataset.tab).classList.add("is-active");
    if(btn.dataset.tab === "favoris") renderFavoris();
    if(btn.dataset.tab === "journal") renderJournal();
    if(btn.dataset.tab === "calendrier") renderCalendar();
  });
});

/* ============================================================
   DÉLÉGATION DE CLICS — cartes (catalogue + favoris + ce soir)
   ============================================================ */
document.addEventListener("click", (e)=>{
  const favBtn = e.target.closest("[data-action='fav']");
  if(favBtn){
    e.stopPropagation();
    const id = parseInt(favBtn.dataset.id,10);
    toggleFavorite(id);
    favBtn.classList.toggle("is-fav");
    const svg = favBtn.querySelector("svg");
    const on = favBtn.classList.contains("is-fav");
    svg.setAttribute("fill", on ? "currentColor" : "none");
    if(state.favOnly || document.getElementById("panel-favoris").classList.contains("is-active")) refreshAfterMutation();
    return;
  }
  const obsBtn = e.target.closest("[data-action='observed']");
  if(obsBtn){
    e.stopPropagation();
    const id = parseInt(obsBtn.dataset.id,10);
    toggleObservedQuick(id);
    obsBtn.classList.toggle("is-done");
    obsBtn.lastChild.textContent = obsBtn.classList.contains("is-done") ? " Observé" : " Observer";
    updateProgress();
    if(state.unseenOnly) refreshAfterMutation();
    return;
  }
  const card = e.target.closest(".card, .tonight-card");
  if(card && card.dataset.id){
    openModal(parseInt(card.dataset.id,10));
  }
});
document.addEventListener("keydown", (e)=>{
  if(e.key === "Enter"){
    const card = document.activeElement.closest?.(".card");
    if(card) openModal(parseInt(card.dataset.id,10));
  }
});

/* ============================================================
   FILTRES — écouteurs
   ============================================================ */
let searchDebounce = null;
document.getElementById("searchInput").addEventListener("input", (e)=>{
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(()=>{ state.search = e.target.value; renderCatalog(true); }, 160);
});
document.getElementById("filterType").addEventListener("change", (e)=>{ state.type = e.target.value; renderCatalog(true); });
document.getElementById("filterConstellation").addEventListener("change", (e)=>{ state.constellation = e.target.value; renderCatalog(true); });
document.getElementById("filterDifficulte").addEventListener("change", (e)=>{ state.difficulte = e.target.value; renderCatalog(true); });
document.getElementById("filterCollection").addEventListener("change", (e)=>{ state.collection = e.target.value; renderCatalog(true); });
document.getElementById("sortField").addEventListener("change", (e)=>{ state.sort = e.target.value; renderCatalog(true); });

function bindChip(id, key){
  const el = document.getElementById(id);
  el.addEventListener("click", ()=>{
    state[key] = !state[key];
    el.classList.toggle("is-active", state[key]);
    renderCatalog(true);
  });
}
bindChip("chipMonth", "monthOnly");
bindChip("chipFav", "favOnly");
bindChip("chipUnseen", "unseenOnly");

document.getElementById("chipReset").addEventListener("click", ()=>{
  state.search=""; state.type=""; state.constellation=""; state.difficulte=""; state.collection="";
  state.sort="fiche"; state.monthOnly=false; state.favOnly=false; state.unseenOnly=false;
  document.getElementById("searchInput").value = "";
  document.getElementById("filterType").value = "";
  document.getElementById("filterConstellation").value = "";
  document.getElementById("filterDifficulte").value = "";
  document.getElementById("filterCollection").value = "";
  document.getElementById("sortField").value = "fiche";
  ["chipMonth","chipFav","chipUnseen"].forEach(id=>document.getElementById(id).classList.remove("is-active"));
  renderCatalog(true);
});

/* ---------------- scroll infini (chargement progressif) ---------------- */
const sentinel = document.getElementById("loadSentinel");
if("IntersectionObserver" in window){
  new IntersectionObserver((entries)=>{
    entries.forEach(entry => { if(entry.isIntersecting) maybeLoadMore(); });
  }, { rootMargin: "600px" }).observe(sentinel);
}

/* ============================================================
   INITIALISATION
   ============================================================ */
function init(){
  populateFilters();
  renderTonight();
  renderCatalog(true);
  updateProgress();
  renderCalendar();
}
init();

})();
