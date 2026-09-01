// Mode Réalité Augmentée : superpose la position calculée des objets du ciel
// (catalogue + Soleil + Lune) sur le flux de la caméra arrière, en utilisant
// les capteurs d'orientation du téléphone (boussole + inclinaison).
//
// Principe :
//  - On calcule le "cap" (azimut, 0-360° depuis le Nord) et la "hauteur"
//    (altitude, -90 à +90°) vers lesquels pointe l'arrière du téléphone,
//    à partir des angles alpha/beta/gamma de l'API DeviceOrientation.
//  - On calcule périodiquement l'azimut/altitude réels de chaque objet
//    (RA/Dec -> alt/az via Astro, déjà utilisé dans le reste de l'app).
//  - À chaque image, on compare : un objet dont l'écart de cap et de hauteur
//    par rapport au centre de visée est inférieur au champ de vision estimé
//    est projeté à l'écran en coordonnées x/y proportionnelles à cet écart.
//
// Limites connues (indiquées à l'utilisateur) :
//  - Nécessite HTTPS, un téléphone avec boussole/gyroscope, et l'autorisation
//    d'accès à la caméra + aux capteurs de mouvement (demandée sur iOS).
//  - La précision dépend de la calibration de la boussole du téléphone.
//  - Fonctionne mieux tenu à la verticale (portrait), comme pour viser avec
//    l'appareil photo.

const AR = (() => {
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const FOV_H = 62; // champ de vision horizontal approximatif (degrés), caméra grand-angle de smartphone

  const state = {
    active: false,
    stream: null,
    heading: 0,   // azimut visé, degrés depuis le Nord
    altitude: 0,  // hauteur visée, degrés au-dessus de l'horizon
    hasOrientation: false,
    orientationEventName: null,
    orientationHandler: null,
    posInterval: null,
    renderInterval: null,
    markers: [], // { el, kind: 'object'|'sun'|'moon', obj?, ra, dec, alt, az }
  };

  let els = {};

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function norm360(x) { return ((x % 360) + 360) % 360; }

  // Écart d'azimut signé le plus court entre deux angles (-180..180)
  function deltaAz(az, center) {
    let d = az - center;
    d = ((d + 180) % 360 + 360) % 360 - 180;
    return d;
  }

  // Cap "boussole" à partir de alpha/beta/gamma (formule standard DeviceOrientation),
  // correspond à la direction pointée par le haut du téléphone tenu à la verticale.
  function compassHeadingFromEuler(alpha, beta, gamma) {
    const _x = beta * DEG;
    const _y = gamma * DEG;
    const _z = alpha * DEG;
    const cX = Math.cos(_x), cY = Math.cos(_y), cZ = Math.cos(_z);
    const sX = Math.sin(_x), sY = Math.sin(_y), sZ = Math.sin(_z);

    const Vx = -cZ * sY - sZ * sX * cY;
    const Vy = -sZ * sY + cZ * sX * cY;

    let heading = Math.atan(Vx / Vy);
    if (Vy < 0) heading += Math.PI;
    else if (Vx < 0) heading += 2 * Math.PI;
    return norm360(heading * RAD);
  }

  // Hauteur (altitude) visée, indépendante du cap : dérivée de la même matrice
  // de rotation (composante verticale de l'axe visé par l'arrière du téléphone).
  function pointingAltitudeFromEuler(beta, gamma) {
    const m33 = Math.cos(beta * DEG) * Math.cos(gamma * DEG);
    return Math.asin(clamp(-m33, -1, 1)) * RAD;
  }

  function showStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  function iconForSunMoon(kind) {
    return kind === 'sun'
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 8.9 10.4A7 7 0 0 1 12 3Z"/></svg>';
  }

  function buildMarkers() {
    els.overlay.innerHTML = '';
    state.markers = [];

    const activeCats = Object.keys(settings.categories).filter(c => settings.categories[c]);

    for (const obj of CATALOG) {
      if (!activeCats.includes(obj.type)) continue;
      const el = document.createElement('div');
      el.className = `ar-marker badge--${obj.type}`;
      const isFav = settings.favorites.includes(obj.cat);
      el.innerHTML = `
        <span class="ar-marker__dot ${isFav ? 'is-fav' : ''}">${CATEGORY_ICONS[obj.type]}</span>
        <span class="ar-marker__label">${obj.name}</span>
      `;
      el.dataset.cat = obj.cat;
      el.addEventListener('click', () => toggleFavoriteFromAR(obj.cat, el));
      els.overlay.appendChild(el);
      state.markers.push({ el, kind: 'object', obj, ra: obj.ra, dec: obj.dec, alt: -90, az: 0 });
    }

    const sunEl = document.createElement('div');
    sunEl.className = 'ar-marker ar-marker--sun';
    sunEl.innerHTML = `<span class="ar-marker__dot">${iconForSunMoon('sun')}</span><span class="ar-marker__label">Soleil</span>`;
    els.overlay.appendChild(sunEl);
    state.markers.push({ el: sunEl, kind: 'sun', alt: -90, az: 0 });

    const moonEl = document.createElement('div');
    moonEl.className = 'ar-marker ar-marker--moon';
    moonEl.innerHTML = `<span class="ar-marker__dot">${iconForSunMoon('moon')}</span><span class="ar-marker__label">Lune</span>`;
    els.overlay.appendChild(moonEl);
    state.markers.push({ el: moonEl, kind: 'moon', alt: -90, az: 0 });
  }

  function toggleFavoriteFromAR(cat, el) {
    const idx = settings.favorites.indexOf(cat);
    if (idx >= 0) settings.favorites.splice(idx, 1);
    else settings.favorites.push(cat);
    persistSettings();
    el.querySelector('.ar-marker__dot').classList.toggle('is-fav');
  }

  function updatePositions() {
    if (settings.lat == null || settings.lon == null) return;
    const now = new Date();
    for (const m of state.markers) {
      if (m.kind === 'object') {
        const { alt, az } = Astro.raDecToAltAz(m.ra, m.dec, settings.lat, settings.lon, now);
        m.alt = alt; m.az = az;
      } else if (m.kind === 'sun') {
        const pos = SunCalc.getPosition(now, settings.lat, settings.lon);
        m.alt = pos.altitude * RAD;
        m.az = norm360(pos.azimuth * RAD + 180);
      } else if (m.kind === 'moon') {
        const pos = SunCalc.getMoonPosition(now, settings.lat, settings.lon);
        m.alt = pos.altitude * RAD;
        m.az = norm360(pos.azimuth * RAD + 180);
      }
    }
  }

  function render() {
    if (!state.active) return;
    const w = els.overlay.clientWidth;
    const h = els.overlay.clientHeight;
    if (!w || !h) return;
    const fovH = FOV_H;
    const fovV = fovH * (h / w);

    for (const m of state.markers) {
      const dAz = deltaAz(m.az, state.heading);
      const dAlt = m.alt - state.altitude;
      if (m.alt < -2 || Math.abs(dAz) > fovH / 2 + 3 || Math.abs(dAlt) > fovV / 2 + 3) {
        m.el.style.display = 'none';
        continue;
      }
      const x = w / 2 + (dAz / (fovH / 2)) * (w / 2);
      const y = h / 2 - (dAlt / (fovV / 2)) * (h / 2);
      m.el.style.display = 'flex';
      m.el.style.left = `${x}px`;
      m.el.style.top = `${y}px`;
    }

    if (els.headingReadout) {
      const dirIdx = Math.round(norm360(state.heading) / 45) % 8;
      const dirLabel = Astro.DIRECTIONS[dirIdx];
      els.headingReadout.textContent = `Cap ${Math.round(state.heading)}° (${dirLabel}) · Hauteur ${Math.round(state.altitude)}°`;
    }
  }

  function onOrientation(e) {
    const beta = e.beta || 0;
    const gamma = e.gamma || 0;
    let heading;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      heading = e.webkitCompassHeading; // iOS : déjà calibré, cap vrai/magnétique
    } else if (typeof e.alpha === 'number') {
      heading = compassHeadingFromEuler(e.alpha, beta, gamma);
    } else {
      return;
    }
    state.heading = heading;
    state.altitude = pointingAltitudeFromEuler(beta, gamma);
    state.hasOrientation = true;
  }

  function attachOrientation() {
    const name = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
    state.orientationEventName = name;
    state.orientationHandler = onOrientation;
    window.addEventListener(name, state.orientationHandler);
  }

  function detachOrientation() {
    if (state.orientationEventName && state.orientationHandler) {
      window.removeEventListener(state.orientationEventName, state.orientationHandler);
    }
    state.orientationEventName = null;
    state.orientationHandler = null;
  }

  async function start() {
    if (state.active) return;

    if (settings.lat == null || settings.lon == null) {
      showStatus("Définissez d'abord votre position dans l'onglet Réglages.");
      return;
    }

    if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
      showStatus("Caméra non disponible sur ce navigateur/appareil.");
      return;
    }
    if (typeof DeviceOrientationEvent === 'undefined') {
      showStatus("Capteurs d'orientation non disponibles sur cet appareil.");
      return;
    }

    showStatus('Démarrage…');

    // iOS 13+ exige une autorisation explicite, demandée depuis un geste utilisateur.
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') {
          showStatus("Autorisation refusée pour les capteurs de mouvement — impossible d'activer la RA.");
          return;
        }
      } catch (e) {
        showStatus("Impossible de demander l'autorisation des capteurs de mouvement.");
        return;
      }
    }

    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (e) {
      showStatus("Accès à la caméra refusé ou indisponible.");
      return;
    }

    els.video.srcObject = state.stream;
    els.intro.style.display = 'none';
    els.view.style.display = 'block';

    buildMarkers();
    updatePositions();
    state.posInterval = setInterval(updatePositions, 5000);
    attachOrientation();
    state.renderInterval = setInterval(render, 100);
    state.active = true;
  }

  function stop() {
    if (!state.active) {
      // Peut être appelé aussi pour nettoyer un flux resté ouvert après une erreur
      if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
      return;
    }
    state.active = false;
    if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
    if (els.video) els.video.srcObject = null;
    detachOrientation();
    if (state.posInterval) clearInterval(state.posInterval);
    if (state.renderInterval) clearInterval(state.renderInterval);
    state.posInterval = null;
    state.renderInterval = null;
    if (els.view) els.view.style.display = 'none';
    if (els.intro) els.intro.style.display = 'block';
    showStatus('');
  }

  function init() {
    els = {
      intro: document.getElementById('ar-intro'),
      view: document.getElementById('ar-view'),
      video: document.getElementById('ar-video'),
      overlay: document.getElementById('ar-overlay'),
      status: document.getElementById('ar-status'),
      headingReadout: document.getElementById('ar-heading-readout'),
      startBtn: document.getElementById('ar-start-btn'),
      stopBtn: document.getElementById('ar-stop-btn'),
    };
    if (!els.startBtn) return; // panneau AR absent de cette page

    els.startBtn.addEventListener('click', start);
    els.stopBtn.addEventListener('click', stop);

    // Coupe la caméra si l'utilisateur quitte l'onglet AR pour un autre onglet
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab !== 'ar') stop();
      });
    });

    // Coupe la caméra si l'app passe en arrière-plan
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { start, stop };
})();
