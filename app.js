// Application principale : orchestration UI + calculs.

const DEFAULT_SETTINGS = {
  lat: null,
  lon: null,
  locationLabel: 'Position non définie',
  minAlt: 20,
  categories: { nebuleuse: true, galaxie: true, amas: true, autre: false },
  favorites: [],
  nightMode: false,
};

let settings = loadSettings();
let selectedDate = new Date();
selectedDate.setHours(12, 0, 0, 0);

function loadSettings() {
  try {
    const raw = localStorage.getItem('telescopeAppSettings');
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT_SETTINGS), parsed, {
      categories: Object.assign({}, DEFAULT_SETTINGS.categories, parsed.categories || {}),
    });
  } catch (e) {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function persistSettings() {
  localStorage.setItem('telescopeAppSettings', JSON.stringify(settings));
}

// ---------- Onglets ----------
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ---------- Géolocalisation ----------
function requestGeolocation() {
  const statusEl = document.getElementById('location-status');
  if (!navigator.geolocation) {
    statusEl.textContent = "Géolocalisation non disponible sur cet appareil — utilisez la saisie manuelle dans Réglages.";
    return;
  }
  statusEl.textContent = 'Localisation en cours…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      settings.lat = pos.coords.latitude;
      settings.lon = pos.coords.longitude;
      settings.locationLabel = `${settings.lat.toFixed(3)}°, ${settings.lon.toFixed(3)}°`;
      persistSettings();
      updateLocationUI();
      renderCalendar();
    },
    err => {
      statusEl.textContent = "Position refusée ou indisponible — vous pouvez la saisir manuellement dans Réglages.";
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
}

function updateLocationUI() {
  const statusEl = document.getElementById('location-status');
  const settingsLat = document.getElementById('manual-lat');
  const settingsLon = document.getElementById('manual-lon');
  if (settings.lat != null && settings.lon != null) {
    statusEl.textContent = `Position : ${settings.locationLabel}`;
    settingsLat.value = settings.lat.toFixed(4);
    settingsLon.value = settings.lon.toFixed(4);
  } else {
    statusEl.textContent = 'Position non définie';
  }
}

// ---------- Fenêtre de nuit noire ----------
function getNightWindow(date, lat, lon) {
  const t1 = SunCalc.getTimes(date, lat, lon);
  const nextDay = new Date(date.getTime() + 24 * 3600 * 1000);
  const t2 = SunCalc.getTimes(nextDay, lat, lon);

  const darkStart = t1.night || t1.nauticalDusk || t1.dusk || null;
  const darkEnd = t2.nightEnd || t2.nauticalDawn || t2.dawn || null;
  return { darkStart, darkEnd, sunTimesEvening: t1, sunTimesMorning: t2 };
}

function fmtTime(date) {
  if (!date) return '--:--';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const CATEGORY_LABELS = {
  nebuleuse: 'Nébuleuse',
  galaxie: 'Galaxie',
  amas: 'Amas',
  autre: 'Autre',
};

// Icônes illustrées par catégorie (pictogrammes, pas des photos réelles)
const CATEGORY_ICONS = {
  galaxie: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
    <ellipse cx="12" cy="12" rx="9" ry="4.2"/>
    <path d="M4 12c1-2.5 4-3.5 8-3.5s7 1 8 3.5c-1 2.5-4 3.5-8 3.5s-7-1-8-3.5Z" opacity="0.5"/>
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
  </svg>`,
  nebuleuse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M3 15c2-4 5-7 9-7s7 2 9 5c-2 3-5 5-9 5s-7-1-9-3Z"/>
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="14" r="0.8" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="10" r="0.6" fill="currentColor" stroke="none"/>
  </svg>`,
  amas: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="12" cy="12" r="1.6"/>
    <circle cx="7" cy="8" r="1.1"/>
    <circle cx="17" cy="8" r="1.1"/>
    <circle cx="6" cy="16" r="1"/>
    <circle cx="18" cy="16" r="1"/>
    <circle cx="12" cy="6" r="0.9"/>
    <circle cx="12" cy="18" r="0.9"/>
  </svg>`,
  autre: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8Z"/>
  </svg>`,
};

// ---------- Rendu du Soleil et de la Lune ----------
function renderSunMoon(date, lat, lon) {
  const container = document.getElementById('sun-moon-row');
  container.innerHTML = '';

  const sunTimes = SunCalc.getTimes(date, lat, lon);
  const sunCard = document.createElement('div');
  sunCard.className = 'sky-card sky-card--sun';
  sunCard.innerHTML = `
    <div class="sky-card__title">Soleil</div>
    <div class="sky-card__times">Lever ${fmtTime(sunTimes.sunrise)} · Coucher ${fmtTime(sunTimes.sunset)}</div>
    <div class="sky-card__note">⚠ Filtre solaire obligatoire pour toute observation ou photo diurne</div>
  `;
  container.appendChild(sunCard);

  const moonTimes = SunCalc.getMoonTimes(date, lat, lon, true);
  const illum = SunCalc.getMoonIllumination(date);
  const pct = Math.round(illum.fraction * 100);
  let phaseName = 'Nouvelle Lune';
  const p = illum.phase;
  if (p < 0.03 || p > 0.97) phaseName = 'Nouvelle Lune';
  else if (p < 0.22) phaseName = 'Premier croissant';
  else if (p < 0.28) phaseName = 'Premier quartier';
  else if (p < 0.47) phaseName = 'Gibbeuse croissante';
  else if (p < 0.53) phaseName = 'Pleine Lune';
  else if (p < 0.72) phaseName = 'Gibbeuse décroissante';
  else if (p < 0.78) phaseName = 'Dernier quartier';
  else phaseName = 'Dernier croissant';

  const moonCard = document.createElement('div');
  moonCard.className = 'sky-card sky-card--moon';
  const riseTxt = moonTimes.rise ? fmtTime(moonTimes.rise) : (moonTimes.alwaysUp ? 'toujours levée' : '—');
  const setTxt = moonTimes.set ? fmtTime(moonTimes.set) : (moonTimes.alwaysDown ? 'toujours couchée' : '—');
  moonCard.innerHTML = `
    <div class="sky-card__title">Lune</div>
    <div class="sky-card__times">Lever ${riseTxt} · Coucher ${setTxt}</div>
    <div class="sky-card__note">${phaseName} — ${pct}% illuminée</div>
  `;
  container.appendChild(moonCard);
}

// ---------- Rendu du calendrier par direction ----------
function renderCalendar() {
  const grid = document.getElementById('direction-grid');
  const emptyMsg = document.getElementById('no-location-msg');
  grid.innerHTML = '';

  if (settings.lat == null || settings.lon == null) {
    emptyMsg.style.display = 'block';
    document.getElementById('sun-moon-row').innerHTML = '';
    return;
  }
  emptyMsg.style.display = 'none';

  renderSunMoon(selectedDate, settings.lat, settings.lon);

  const { darkStart, darkEnd } = getNightWindow(selectedDate, settings.lat, settings.lon);

  if (!darkStart || !darkEnd) {
    grid.innerHTML = '<p class="hint">Nuit noire indisponible à cette latitude/date (soleil de minuit ou jour polaire proche).</p>';
    return;
  }

  const activeCats = Object.keys(settings.categories).filter(c => settings.categories[c]);
  const visibleObjects = [];

  for (const obj of CATALOG) {
    if (!activeCats.includes(obj.type)) continue;
    const vis = Astro.visibilityWindow(obj, settings.lat, settings.lon, darkStart, darkEnd, settings.minAlt);
    if (vis.visible) visibleObjects.push({ obj, vis });
  }

  if (visibleObjects.length === 0) {
    grid.innerHTML = '<p class="hint">Aucun objet des catégories sélectionnées n\'est observable cette nuit avec ces réglages.</p>';
    return;
  }

  // Regroupement par constellation, chaque groupe trié par heure de lever ;
  // les groupes sont ordonnés par l'heure de lever la plus précoce de leurs objets.
  const byConstellation = new Map();
  for (const item of visibleObjects) {
    const c = item.obj.constellation;
    if (!byConstellation.has(c)) byConstellation.set(c, []);
    byConstellation.get(c).push(item);
  }
  const groups = [...byConstellation.entries()];
  for (const [, items] of groups) items.sort((a, b) => a.vis.start - b.vis.start);
  groups.sort((a, b) => a[1][0].vis.start - b[1][0].vis.start);

  for (const [constellation, items] of groups) {
    const pill = document.createElement('div');
    pill.className = 'constellation-pill';
    pill.textContent = constellation;
    grid.appendChild(pill);

    const list = document.createElement('div');
    list.className = 'object-list';

    for (const { obj, vis } of items) {
      const card = document.createElement('div');
      card.className = 'object-card';
      const isFav = settings.favorites.includes(obj.cat);
      card.innerHTML = `
        <div class="object-card__icon badge--${obj.type}">${CATEGORY_ICONS[obj.type]}</div>
        <div class="object-card__body">
          <div class="object-card__head">
            <span class="object-card__name">${obj.name}</span>
            <button class="fav-btn ${isFav ? 'is-fav' : ''}" data-cat="${obj.cat}" title="Favori">★</button>
          </div>
          <div class="object-card__desc">${obj.desc} · ${obj.cat}</div>
          <div class="object-card__stats">
            <span class="stat" title="Magnitude">☉ ${obj.mag}</span>
            <span class="stat" title="Altitude maximale">⌒ ${Math.round(vis.peakAlt)}°</span>
            <span class="stat" title="Direction">➤ ${vis.direction}</span>
          </div>
          <div class="object-card__times">${fmtTime(vis.start)} → ${fmtTime(vis.end)}${vis.circumpolar ? ' (circumpolaire)' : ''}</div>
        </div>
      `;
      list.appendChild(card);
    }
    grid.appendChild(list);
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.fav-btn');
  if (!btn) return;
  const cat = btn.dataset.cat;
  const idx = settings.favorites.indexOf(cat);
  if (idx >= 0) settings.favorites.splice(idx, 1);
  else settings.favorites.push(cat);
  persistSettings();
  btn.classList.toggle('is-fav');
});

// ---------- Filtres de catégories ----------
function initCategoryFilters() {
  document.querySelectorAll('.cat-filter').forEach(chip => {
    const cat = chip.dataset.cat;
    const iconSlot = chip.querySelector('.cat-visual__icon');
    if (iconSlot && CATEGORY_ICONS[cat]) iconSlot.innerHTML = CATEGORY_ICONS[cat];
    chip.classList.toggle('active', !!settings.categories[cat]);
    chip.addEventListener('click', () => {
      settings.categories[cat] = !settings.categories[cat];
      chip.classList.toggle('active', settings.categories[cat]);
      persistSettings();
      renderCalendar();
    });
  });
}

// ---------- Date ----------
function initDatePicker() {
  const input = document.getElementById('date-input');
  const iso = selectedDate.toISOString().slice(0, 10);
  input.value = iso;
  input.addEventListener('change', () => {
    if (!input.value) return;
    const [y, m, d] = input.value.split('-').map(Number);
    selectedDate = new Date(y, m - 1, d, 12, 0, 0, 0);
    renderCalendar();
  });
  document.getElementById('date-today').addEventListener('click', () => {
    selectedDate = new Date();
    selectedDate.setHours(12, 0, 0, 0);
    input.value = selectedDate.toISOString().slice(0, 10);
    renderCalendar();
  });
}

// ---------- Réglages : altitude min ----------
function initAltitudeSlider() {
  const slider = document.getElementById('min-alt-slider');
  const label = document.getElementById('min-alt-value');
  slider.value = settings.minAlt;
  label.textContent = `${settings.minAlt}°`;
  slider.addEventListener('input', () => {
    settings.minAlt = Number(slider.value);
    label.textContent = `${settings.minAlt}°`;
  });
  slider.addEventListener('change', () => {
    persistSettings();
    renderCalendar();
  });
}

// ---------- Réglages : position manuelle ----------
function initManualLocation() {
  document.getElementById('manual-location-save').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('manual-lat').value);
    const lon = parseFloat(document.getElementById('manual-lon').value);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      document.getElementById('manual-location-status').textContent = 'Coordonnées invalides.';
      return;
    }
    settings.lat = lat;
    settings.lon = lon;
    settings.locationLabel = `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
    persistSettings();
    updateLocationUI();
    document.getElementById('manual-location-status').textContent = 'Position enregistrée.';
    renderCalendar();
  });
}

// ---------- Mode nuit ----------
function initNightMode() {
  const btn = document.getElementById('night-mode-btn');
  function apply() {
    document.documentElement.dataset.theme = settings.nightMode ? 'night' : '';
    btn.textContent = settings.nightMode ? '☾ Mode nuit activé' : '☾ Mode nuit';
    btn.classList.toggle('active', settings.nightMode);
  }
  apply();
  btn.addEventListener('click', () => {
    settings.nightMode = !settings.nightMode;
    persistSettings();
    apply();
  });
}

// ---------- Initialisation ----------
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDatePicker();
  initCategoryFilters();
  initAltitudeSlider();
  initManualLocation();
  initNightMode();
  updateLocationUI();

  document.getElementById('locate-btn').addEventListener('click', requestGeolocation);

  if (settings.lat == null) {
    requestGeolocation();
  } else {
    renderCalendar();
  }
});
