/* ================================================
   ALIF — Main Application JS
   ================================================ */

(() => {

  // ---- Config ----
  const PRAYERS_META = [
    { key: 'Fajr',    fr: 'Fajr',     ar: 'الفجر',   icon: '🌙' },
    { key: 'Sunrise', fr: 'Chourouk', ar: 'الشروق',  icon: '🌅' },
    { key: 'Dhuhr',   fr: 'Dhuhr',    ar: 'الظهر',   icon: '☀️'  },
    { key: 'Asr',     fr: 'Asr',      ar: 'العصر',   icon: '🌤'  },
    { key: 'Maghrib', fr: 'Maghrib',  ar: 'المغرب',  icon: '🌇'  },
    { key: 'Isha',    fr: 'Isha',     ar: 'العشاء',  icon: '🌑'  },
  ];

  const HIJRI_MONTHS_FR = [
    'Mouharram','Safar','Rabi al-Awwal','Rabi al-Thani',
    'Joumada al-Oula','Joumada al-Thania','Rajab','Chaabane',
    'Ramadan','Chawwal','Dhou al-Qidah','Dhou al-Hijjah'
  ];

  const DHIKRS = [
    { label: 'Subhan Allah', ar: 'سُبْحَانَ اللَّهِ', fr: 'Gloire à Allah', target: 33 },
    { label: 'Alhamdulillah', ar: 'الحَمْدُ لِلَّهِ', fr: 'Louange à Allah', target: 33 },
    { label: 'Allahu Akbar', ar: 'اللَّهُ أَكْبَرُ', fr: 'Allah est le plus Grand', target: 34 },
    { label: 'Astaghfirullah', ar: 'أَسْتَغْفِرُ اللَّهَ', fr: 'Je demande pardon à Allah', target: 100 },
    { label: 'La ilaha illallah', ar: 'لَا إِلَهَ إِلَّا اللَّهُ', fr: 'Pas de divinité sauf Allah', target: 100 },
  ];

  // ---- State ----
  let state = {
    prayerTimes: {},
    cityName: '',
    notifEnabled: {},
    countdownInterval: null,
    notifTimeouts: [],
    prevPrayerDate: null,
    nextPrayerDate: null,
  };

  // ---- DOM helpers ----
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  // ---- Stars background ----
  function generateStars() {
    const container = $('bg-stars');
    for (let i = 0; i < 80; i++) {
      const star = document.createElement('div');
      star.className = 'bg-star';
      const size = Math.random() * 2 + 0.5;
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const dur = (Math.random() * 3 + 2).toFixed(1);
      const delay = (Math.random() * 4).toFixed(1);
      const minOp = (Math.random() * 0.2 + 0.1).toFixed(2);
      const maxOp = (Math.random() * 0.5 + 0.4).toFixed(2);
      const isGold = Math.random() > 0.7;
      star.style.cssText = `
        width:${size}px; height:${size}px;
        left:${x}%; top:${y}%;
        background:${isGold ? '#c9a84c' : 'white'};
        --dur:${dur}s; --min-op:${minOp}; --max-op:${maxOp};
        animation-delay:${delay}s;
        opacity:${minOp};
      `;
      container.appendChild(star);
    }
  }

  // Inject SVG gradient defs
  function injectSVGDefs() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.className = 'svg-defs';
    svg.innerHTML = `
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#c9a84c"/>
          <stop offset="100%" stop-color="#f5e4aa"/>
        </linearGradient>
      </defs>`;
    document.body.prepend(svg);
  }

  // ---- Service Worker ----
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // ---- Tab switching ----
  function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const content = $(`tab-${tabName}`);
    if (content) content.classList.add('active');
    const btn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
  }

  // ---- Geolocation & API ----
  async function init() {
    showLoader(true);
    showError(false);

    if (!navigator.geolocation) {
      showError(true, "Géolocalisation non supportée par ce navigateur.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      onPosition,
      onGeoError,
      { timeout: 15000, enableHighAccuracy: false }
    );
  }

  function onGeoError(err) {
    showLoader(false);
    let msg = "Impossible d'obtenir votre position.";
    if (err.code === 1) msg = "Accès à la localisation refusé. Autorisez-le dans vos Réglages.";
    if (err.code === 3) msg = "La localisation a pris trop de temps. Réessayez.";
    showError(true, msg);
  }

  async function onPosition(pos) {
    const { latitude, longitude } = pos.coords;
    try {
      // Reverse geocode
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=fr`
      );
      const geoData = await geoRes.json();
      state.cityName = geoData.address?.city
        || geoData.address?.town
        || geoData.address?.village
        || geoData.address?.municipality
        || 'Ma ville';

      const cityEl = $('city-name');
      if (cityEl) cityEl.textContent = state.cityName;

      // Prayer times
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();

      const prayerRes = await fetch(
        `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${latitude}&longitude=${longitude}&method=2`
      );
      const prayerData = await prayerRes.json();

      if (prayerData.code !== 200) throw new Error('API error');

      state.prayerTimes = prayerData.data.timings;
      const hijri = prayerData.data.date.hijri;

      // Hijri date
      const hijriArEl = $('hijri-ar');
      const hijriFrEl = $('hijri-fr');
      if (hijriArEl) hijriArEl.textContent = `${hijri.day} ${hijri.month.ar} ${hijri.year}`;
      if (hijriFrEl) hijriFrEl.textContent =
        `${hijri.day} ${HIJRI_MONTHS_FR[parseInt(hijri.month.number) - 1] || hijri.month.en} ${hijri.year}`;

      showLoader(false);
      renderPrayerCards();
      startCountdown();
      checkNotifBanner();
      scheduleAllNotifications();

    } catch (e) {
      showLoader(false);
      showError(true, "Erreur lors du chargement. Vérifiez votre connexion et réessayez.");
    }
  }

  // ---- Prayer rendering ----
  function getPrayerDate(key) {
    const raw = state.prayerTimes[key];
    if (!raw) return null;
    const [h, m] = raw.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  function formatTime(key) {
    const raw = state.prayerTimes[key];
    if (!raw) return '--:--';
    const [h, m] = raw.split(':');
    return `${h}:${m}`;
  }

  function isPrayerPassed(key) {
    const d = getPrayerDate(key);
    return d && d < new Date();
  }

  function getNextPrayerIndex() {
    const now = new Date();
    for (let i = 0; i < PRAYERS_META.length; i++) {
      const d = getPrayerDate(PRAYERS_META[i].key);
      if (d && d > now) return i;
    }
    return 0;
  }

  function renderPrayerCards() {
    const container = $('prayer-cards');
    if (!container) return;
    const nextIdx = getNextPrayerIndex();
    container.innerHTML = '';

    PRAYERS_META.forEach((p, i) => {
      const passed = isPrayerPassed(p.key) && i !== nextIdx;
      const active = i === nextIdx;
      const card = el('div', `prayer-card${active ? ' active' : ''}${passed ? ' passed' : ''}`);
      card.id = `prayer-card-${i}`;
      card.style.animationDelay = `${0.05 * i + 0.2}s`;

      const notifOn = state.notifEnabled[p.key] !== false;
      card.innerHTML = `
        <div class="prayer-left">
          <div class="prayer-name">
            <span class="prayer-icon">${p.icon}</span>${p.fr}
          </div>
          <div class="prayer-name-ar">${p.ar}</div>
        </div>
        <div class="prayer-right">
          <div class="prayer-time">${formatTime(p.key)}</div>
          <button class="notif-toggle ${notifOn ? 'on' : ''}" id="notif-btn-${i}" onclick="window.AlifApp.toggleNotif('${p.key}', ${i})" title="Notification">
            <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          </button>
        </div>`;
      container.appendChild(card);
    });
  }

  // ---- Countdown ----
  function startCountdown() {
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    updateCountdown();
    state.countdownInterval = setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    const nextIdx = getNextPrayerIndex();
    const nextPrayer = PRAYERS_META[nextIdx];
    const nextTime = getPrayerDate(nextPrayer.key);
    if (!nextTime) return;

    const now = new Date();
    let diff = nextTime - now;
    if (diff < 0) diff += 86400000;

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    const cdH = $('cd-h'), cdM = $('cd-m'), cdS = $('cd-s');
    if (cdH) cdH.textContent = String(h).padStart(2, '0');
    if (cdM) cdM.textContent = String(m).padStart(2, '0');
    if (cdS) cdS.textContent = String(s).padStart(2, '0');

    // Update next prayer name
    const nameEl = $('next-name-fr'), arEl = $('next-name-ar');
    if (nameEl) nameEl.textContent = nextPrayer.fr;
    if (arEl)   arEl.textContent   = nextPrayer.ar;

    // Progress bar between prev and next prayer
    const prevIdx = (nextIdx - 1 + PRAYERS_META.length) % PRAYERS_META.length;
    const prevTime = getPrayerDate(PRAYERS_META[prevIdx].key);
    const barEl = $('progress-bar');
    if (barEl && prevTime) {
      let totalSpan = nextTime - prevTime;
      if (totalSpan < 0) totalSpan += 86400000;
      let elapsed = now - prevTime;
      if (elapsed < 0) elapsed += 86400000;
      const pct = Math.min(100, (elapsed / totalSpan) * 100);
      barEl.style.width = pct + '%';
    }

    // Update card states
    PRAYERS_META.forEach((p, i) => {
      const card = $(`prayer-card-${i}`);
      if (!card) return;
      const passed = isPrayerPassed(p.key) && i !== nextIdx;
      const active = i === nextIdx;
      card.className = `prayer-card${active ? ' active' : ''}${passed ? ' passed' : ''}`;
    });
  }

  // ---- Notifications ----
  function checkNotifBanner() {
    const banner = $('notif-banner');
    if (!banner) return;
    if (Notification.permission === 'granted') {
      banner.style.display = 'none';
      // Init all notifs on by default
      PRAYERS_META.forEach(p => {
        if (state.notifEnabled[p.key] === undefined) state.notifEnabled[p.key] = true;
      });
    } else {
      banner.style.display = 'flex';
    }
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      const banner = $('notif-banner');
      if (banner) banner.style.display = 'none';
      PRAYERS_META.forEach(p => { state.notifEnabled[p.key] = true; });
      renderPrayerCards();
      scheduleAllNotifications();
    }
  }

  function toggleNotif(key, idx) {
    if (Notification.permission !== 'granted') {
      requestNotifPermission();
      return;
    }
    state.notifEnabled[key] = !state.notifEnabled[key];
    const btn = $(`notif-btn-${idx}`);
    if (btn) btn.classList.toggle('on', state.notifEnabled[key]);
    scheduleAllNotifications();
  }

  function scheduleAllNotifications() {
    state.notifTimeouts.forEach(t => clearTimeout(t));
    state.notifTimeouts = [];
    if (Notification.permission !== 'granted') return;

    PRAYERS_META.forEach(p => {
      if (!state.notifEnabled[p.key]) return;
      const d = getPrayerDate(p.key);
      if (!d) return;
      const delay = d - Date.now();
      if (delay <= 0) return;

      const t = setTimeout(() => {
        try {
          new Notification(`🕌 ${p.fr} — ${p.ar}`, {
            body: `C'est l'heure de la prière de ${p.fr} à ${state.cityName}. سبحان الله`,
            icon: './icon-192.png',
            tag: p.key,
            renotify: true,
          });
        } catch(e) {}
      }, delay);
      state.notifTimeouts.push(t);
    });
  }

  // ---- UI helpers ----
  function showLoader(show) {
    const l = $('loader');
    if (l) l.style.display = show ? 'flex' : 'none';
  }

  function showError(show, msg) {
    const box = $('error-box');
    if (!box) return;
    box.style.display = show ? 'flex' : 'none';
    if (msg) { const p = $('error-msg'); if (p) p.textContent = msg; }
    if (show) showLoader(false);
  }

  // ================================================
  // RAMADAN MODULE
  // ================================================
  const ramadan = (() => {
    let year = new Date().getFullYear();
    const STORAGE_KEY_PREFIX = 'alif_ramadan_';

    function getKey() { return STORAGE_KEY_PREFIX + year; }

    function getData() {
      try {
        return JSON.parse(localStorage.getItem(getKey()) || '{}');
      } catch { return {}; }
    }

    function saveData(data) {
      try { localStorage.setItem(getKey(), JSON.stringify(data)); } catch {}
    }

    function toggleDay(day) {
      const data = getData();
      data[day] = !data[day];
      saveData(data);
      render();
    }

    function changeYear(delta) {
      year += delta;
      render();
    }

    function render() {
      const data = getData();
      const prayedCount = Object.values(data).filter(Boolean).length;

      const countEl = $('ram-count');
      const barEl   = $('ram-bar');
      const barLbl  = $('ram-bar-label');
      const yearEl  = $('ram-year');
      const grid    = $('ramadan-grid');

      if (countEl) countEl.textContent = prayedCount;
      if (barEl)   barEl.style.width = Math.round((prayedCount / 30) * 100) + '%';
      if (barLbl)  barLbl.textContent = `${prayedCount} / 30`;
      if (yearEl)  yearEl.textContent = year;
      if (!grid)   return;

      grid.innerHTML = '';
      for (let d = 1; d <= 30; d++) {
        const cell = document.createElement('div');
        cell.className = 'ram-day' + (data[d] ? ' prayed' : '');
        cell.onclick = () => toggleDay(d);
        cell.innerHTML = `<span class="ram-day-num">${d}</span><span class="ram-day-ar">يوم</span>`;
        grid.appendChild(cell);
      }
    }

    return { render, toggleDay, changeYear };
  })();

  // ================================================
  // TASBIH MODULE
  // ================================================
  const tasbih = (() => {
    let currentDhikrIdx = 0;
    let count = 0;
    let totalSession = 0;
    let rounds = [];
    const CIRCUMFERENCE = 2 * Math.PI * 88; // r=88

    function getDhikr() { return DHIKRS[currentDhikrIdx]; }

    function selectDhikr(idx) {
      currentDhikrIdx = idx;
      count = 0;
      document.querySelectorAll('.dhikr-chip').forEach((c, i) => c.classList.toggle('active', i === idx));
      updateDisplay();
      updateRing();
    }

    function countBead() {
      const dhikr = getDhikr();
      count++;
      totalSession++;

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(30);

      if (count >= dhikr.target) {
        rounds.push({ label: dhikr.label, count: dhikr.target });
        count = 0;
        if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
        renderRounds();
      }

      updateDisplay();
      updateRing();
    }

    function reset() {
      count = 0;
      totalSession = 0;
      rounds = [];
      updateDisplay();
      updateRing();
      renderRounds();
    }

    function updateDisplay() {
      const dhikr = getDhikr();
      const countEl = $('tasbih-count');
      const targetEl = $('tasbih-target');
      const totalEl  = $('tasbih-total');
      const arEl     = $('dhikr-ar');
      const frEl     = $('dhikr-fr');

      if (countEl)  countEl.textContent  = count;
      if (targetEl) targetEl.textContent = `/ ${dhikr.target}`;
      if (totalEl)  totalEl.textContent  = totalSession;
      if (arEl)     arEl.textContent     = dhikr.ar;
      if (frEl)     frEl.textContent     = dhikr.fr;
    }

    function updateRing() {
      const dhikr = getDhikr();
      const fill = $('ring-fill');
      if (!fill) return;
      const pct = count / dhikr.target;
      fill.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);
    }

    function renderSelector() {
      const container = $('dhikr-selector');
      if (!container) return;
      container.innerHTML = '';
      DHIKRS.forEach((d, i) => {
        const chip = document.createElement('button');
        chip.className = 'dhikr-chip' + (i === 0 ? ' active' : '');
        chip.textContent = d.label;
        chip.onclick = () => selectDhikr(i);
        container.appendChild(chip);
      });
    }

    function renderRounds() {
      const el = $('rounds-row');
      if (!el) return;
      el.innerHTML = '';
      rounds.forEach((r, i) => {
        const badge = document.createElement('div');
        badge.className = 'round-badge';
        badge.textContent = `Tour ${i + 1} · ${r.label}`;
        el.appendChild(badge);
      });
    }

    function init() {
      renderSelector();
      updateDisplay();
      updateRing();
    }

    return { init, count: countBead, reset, selectDhikr };
  })();

  // ================================================
  // BOOTSTRAP
  // ================================================
  function boot() {
    generateStars();
    injectSVGDefs();
    registerSW();
    init();
    ramadan.render();
    tasbih.init();
  }

  // Public API
  window.AlifApp = {
    init,
    switchTab,
    toggleNotif,
    requestNotifPermission: async function() { await requestNotifPermission(); },
    ramadan,
    tasbih,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();