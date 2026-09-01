// Moteur de calculs astronomiques (basse précision, suffisant pour la planification visuelle).
// Le Soleil et la Lune sont calculés via la librairie SunCalc (chargée en CDN).
// Les objets du ciel profond (RA/Dec fixes) sont calculés ici via le temps sidéral local.

const Astro = (() => {
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  function toRad(deg) { return deg * DEG; }
  function toDeg(rad) { return rad * RAD; }
  function norm360(x) { return ((x % 360) + 360) % 360; }

  // Jour julien à partir d'une date JS (UTC)
  function julianDate(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  // Temps sidéral de Greenwich, en degrés, à partir du jour julien
  function gst(jd) {
    const T = (jd - 2451545.0) / 36525;
    let theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
      + 0.000387933 * T * T - (T * T * T) / 38710000;
    return norm360(theta);
  }

  // Temps sidéral local (degrés), lon en degrés (Est positif)
  function lst(jd, lonDeg) {
    return norm360(gst(jd) + lonDeg);
  }

  // Convertit RA (heures décimales) / Dec (degrés) -> altitude/azimut (degrés)
  // pour une date (objet Date, UTC) et une position lat/lon (degrés).
  function raDecToAltAz(raHours, decDeg, latDeg, lonDeg, date) {
    const jd = julianDate(date);
    const lstDeg = lst(jd, lonDeg);
    const raDeg = raHours * 15;
    let H = norm360(lstDeg - raDeg);
    if (H > 180) H -= 360;
    const Hr = toRad(H);
    const decR = toRad(decDeg);
    const latR = toRad(latDeg);

    const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(Hr);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    const y = Math.sin(Hr);
    const x = Math.cos(Hr) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR);
    let A = Math.atan2(y, x); // azimut mesuré depuis le Sud, vers l'Ouest
    let azNorth = norm360(toDeg(A) + 180); // 0 = Nord, 90 = Est, 180 = Sud, 270 = Ouest

    return { alt: toDeg(alt), az: azNorth };
  }

  // Bucket 16 directions (rose des vents) à partir d'un azimut (0-360, 0=Nord)
  const DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  const DIRECTION_LABELS = {
    N: 'Nord', NNE: 'Nord-Nord-Est', NE: 'Nord-Est', ENE: 'Est-Nord-Est',
    E: 'Est', ESE: 'Est-Sud-Est', SE: 'Sud-Est', SSE: 'Sud-Sud-Est',
    S: 'Sud', SSO: 'Sud-Sud-Ouest', SO: 'Sud-Ouest', OSO: 'Ouest-Sud-Ouest',
    O: 'Ouest', ONO: 'Ouest-Nord-Ouest', NO: 'Nord-Ouest', NNO: 'Nord-Nord-Ouest',
  };
  function azToDirection(az) {
    const idx = Math.round(norm360(az) / 22.5) % 16;
    return DIRECTIONS[idx];
  }

  // Calcule la fenêtre de visibilité d'un objet (RA/Dec) pendant la nuit noire
  // qui suit `dateNoonLocal` (un Date représentant midi local du jour choisi).
  // darkStart / darkEnd : Date bornant la période de nuit noire (ex: crépuscule
  // astronomique / nautique du soir -> matin), fournies par SunCalc.
  // Retourne { visible, start, end, peakAlt, peakAz, direction, circumpolar }
  function visibilityWindow(obj, latDeg, lonDeg, darkStart, darkEnd, minAlt) {
    if (!darkStart || !darkEnd || darkEnd <= darkStart) return { visible: false };

    const stepMin = 8;
    const totalMs = darkEnd.getTime() - darkStart.getTime();
    const steps = Math.max(2, Math.round(totalMs / (stepMin * 60000)));

    let samples = [];
    for (let i = 0; i <= steps; i++) {
      const t = new Date(darkStart.getTime() + (totalMs * i) / steps);
      const { alt, az } = raDecToAltAz(obj.ra, obj.dec, latDeg, lonDeg, t);
      samples.push({ t, alt, az });
    }

    const above = samples.filter(s => s.alt >= minAlt);
    if (above.length === 0) return { visible: false };

    // Circumpolaire si visible sur toute la plage échantillonnée
    const circumpolar = above.length === samples.length;

    // Trouve le premier et dernier point au-dessus du seuil (fenêtre continue
    // approximative ; suffisant pour la plupart des cas où l'objet ne se lève/couche
    // qu'une fois pendant la nuit)
    let start = above[0].t;
    let end = above[above.length - 1].t;

    // Affine le début/fin par interpolation linéaire simple avec l'échantillon précédent/suivant
    const firstIdx = samples.indexOf(above[0]);
    if (firstIdx > 0) {
      const prev = samples[firstIdx - 1];
      const cur = samples[firstIdx];
      const frac = (minAlt - prev.alt) / (cur.alt - prev.alt);
      start = new Date(prev.t.getTime() + frac * (cur.t.getTime() - prev.t.getTime()));
    }
    const lastIdx = samples.indexOf(above[above.length - 1]);
    if (lastIdx < samples.length - 1) {
      const cur = samples[lastIdx];
      const next = samples[lastIdx + 1];
      const frac = (minAlt - cur.alt) / (next.alt - cur.alt);
      end = new Date(cur.t.getTime() + frac * (next.t.getTime() - cur.t.getTime()));
    }

    // Point culminant (altitude max) pour déterminer la direction
    let peak = above[0];
    for (const s of above) if (s.alt > peak.alt) peak = s;

    return {
      visible: true,
      start,
      end,
      peakAlt: peak.alt,
      peakAz: peak.az,
      direction: azToDirection(peak.az),
      circumpolar,
    };
  }

  return { raDecToAltAz, azToDirection, visibilityWindow, julianDate, DIRECTIONS, DIRECTION_LABELS };
})();
