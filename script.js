// Вставте сюди URL вашого Apps Script Web App (той самий, що для Telegram-бота), без змін наприкінці
const API_URL = "https://script.google.com/macros/s/AKfycbxK3ZZ6DvnI5i0uw0I-v0KR61Ox74FWqjhDXHkV8fi8Sk3hzdarrVotBnluW6fyp-3cwg/exec";

const PERSON_CLASS = {
  "Діма": "p-dima",
  "Таня": "p-tanya",
  "Рома": "p-roma",
  "Гена": "p-hena",
  "Свєта": "p-sveta"
};

const DAY_NAMES_FULL = {
  "Нд": "Неділя", "Пн": "Понеділок", "Вт": "Вівторок", "Ср": "Середа",
  "Чт": "Четвер", "Пт": "П'ятниця", "Сб": "Субота"
};

// Захардкоджено, щоб не витрачати час на запит до таблиці лише для списку імен
const KIDS = [
  { name: "Рома", emoji: "👦" },
  { name: "Таня", emoji: "👧" },
  { name: "Діма", emoji: "👦" }
];

const contentEl = document.getElementById('content');
const childMenuEl = document.getElementById('child-menu');
const heroWeekdayEl = document.getElementById('hero-weekday');
const heroDateEl = document.getElementById('hero-date');
const menuButtons = document.querySelectorAll('.menu-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const applyThemeBtn = document.getElementById('apply-theme-btn');
const refreshBtn = document.getElementById('refresh-btn');
const pullIndicatorEl = document.getElementById('pull-indicator');
const toastEl = document.getElementById('toast');

// Що зараз показано на екрані — потрібно, щоб кнопка/жест "Оновити" знали, що саме перезавантажити
let currentView = { type: 'today' };

function showToast(message, isError) {
  toastEl.textContent = message;
  toastEl.classList.toggle('toast-error', !!isError);
  toastEl.classList.add('show');
  clearTimeout(toastEl._hideTimer);
  toastEl._hideTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// ---- Стиль оформлення: збереження вибору в localStorage ----
const THEME_KEY = 'rozklad_theme';

function getSavedTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'ai-generic'; } catch (e) { return 'ai-generic'; }
}

function applyTheme(theme) {
  if (theme === 'ai-generic') {
    document.documentElement.removeAttribute('data-app-theme');
  } else {
    document.documentElement.setAttribute('data-app-theme', theme);
  }
}

function initTheme() {
  const saved = getSavedTheme();
  applyTheme(saved);
  const radio = document.querySelector(`input[name="theme"][value="${saved}"]`);
  if (radio) radio.checked = true;
}

settingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});
applyThemeBtn.addEventListener('click', () => {
  const selected = document.querySelector('input[name="theme"]:checked');
  const theme = selected ? selected.value : 'ai-generic';
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  settingsOverlay.classList.add('hidden');
});

menuButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveButton(btn);
    const action = btn.dataset.action;

    if (action === 'child') {
      showChildMenu();
    } else {
      childMenuEl.classList.add('hidden');
      loadAndRender(action);
    }
  });
});

function setActiveButton(activeBtn) {
  menuButtons.forEach(b => b.classList.toggle('active', b === activeBtn));
}

function showLoading() {
  contentEl.innerHTML = '<p class="loading">Завантаження...</p>';
}

function scrollToContent() {
  contentEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showError(message) {
  contentEl.innerHTML = `<p class="error">Помилка: ${escapeHtml(message)}</p>`;
}

async function fetchJson(action, extraParams) {
  const params = new URLSearchParams({ action, ...extraParams, _t: Date.now() });
  const url = `${API_URL}?${params.toString()}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

// ---- Кеш "показуємо миттєво, оновлюємо у фоні лише якщо таблиця дійсно змінилась" ----
function cacheKeyFor(action, extraParams) {
  return 'rozklad_cache_' + action + (extraParams ? '_' + JSON.stringify(extraParams) : '');
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeCache(key, lastModified, payload) {
  try { localStorage.setItem(key, JSON.stringify({ lastModified, payload })); } catch (e) {}
}

function extractLastModified(payload) {
  if (Array.isArray(payload)) return payload[0] ? payload[0].lastModified : null;
  return payload ? payload.lastModified : null;
}

// Показує кеш миттєво (якщо є), а тим часом перевіряє свіжість і перемальовує лише при реальній зміні.
// force = true (кнопка/жест "Оновити"): завжди перемальовує і явно повідомляє про результат.
async function loadWithCache(action, extraParams, render, force) {
  const key = cacheKeyFor(action, extraParams);
  const cached = readCache(key);

  if (!force) {
    scrollToContent();
    if (cached) {
      render(cached.payload);
    } else {
      showLoading();
    }
  }

  try {
    const fresh = await fetchJson(action, extraParams);
    const freshLm = extractLastModified(fresh);
    if (force || !cached || cached.lastModified !== freshLm) {
      render(fresh);
    }
    writeCache(key, freshLm, fresh);
    if (force) showToast('Оновлено ✓');
  } catch (err) {
    if (!cached) {
      showError(err.message);
    } else {
      // Кеш лишається на екрані, але тепер явно повідомляємо, що оновлення не вдалося —
      // замість того, щоб мовчки показувати застарілі дані без жодного сигналу.
      showToast('Не вдалося оновити дані. Показано попередню версію.', true);
    }
  }

  if (!force) scrollToContent();
}

// ---- Головний екран: день тижня + дата ----
function initHome() {
  const now = new Date();
  heroWeekdayEl.textContent = DAY_NAMES_FULL[weekdayShort(now)] || '';
  heroDateEl.textContent = formatDate(now);
}

function weekdayShort(date) {
  const days = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return days[date.getDay()];
}

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

// ---- Кнопки меню ----
async function loadAndRender(action, force) {
  if (!force) currentView = { type: action };

  if (action === 'today' || action === 'tomorrow') {
    await loadWithCache(action, undefined, (data) => {
      contentEl.innerHTML = renderDay(data);
    }, force);
  } else if (action === 'week') {
    await loadWithCache('week', undefined, (days) => {
      contentEl.innerHTML = days.map((d, i) => renderDay(d) + (i < days.length - 1 ? '<hr class="day-separator">' : '')).join('');
    }, force);
  }
}

function showChildMenu() {
  childMenuEl.innerHTML = '';
  KIDS.forEach(kid => {
    const btn = document.createElement('button');
    btn.className = 'child-btn';
    btn.innerHTML = `<span class="ico">${kid.emoji}</span><span>${escapeHtml(kid.name)}</span>`;
    btn.addEventListener('click', () => {
      childMenuEl.querySelectorAll('.child-btn').forEach(b => b.classList.toggle('active', b === btn));
      loadPersonWeek(kid.name);
    });
    childMenuEl.appendChild(btn);
  });
  childMenuEl.classList.remove('hidden');
}

async function loadPersonWeek(name, force) {
  if (!force) currentView = { type: 'person', name };

  await loadWithCache('person', { name }, (data) => {
    if (data.error) {
      showError(data.error);
      return;
    }
    contentEl.innerHTML = renderPersonWeek(data);
  }, force);
}

// Викликається кнопкою "Оновити" та жестом "потягнути вниз" — завжди перевіряє мережу,
// навіть якщо локальний кеш виглядає свіжим, і явно показує результат.
async function refreshCurrent() {
  if (currentView.type === 'person') {
    await loadPersonWeek(currentView.name, true);
  } else {
    await loadAndRender(currentView.type, true);
  }
}

// ---- Рендер одного дня: хронологічна шкала всіх людей разом ----
function renderDay(data) {
  let html = `<div class="day-title">${escapeHtml(data.dayUa)}, ${escapeHtml(data.date)}</div>`;

  const notes = data.specialNotes || { noGadgets: [], pe: [] };
  if (notes.noGadgets.length > 0 || notes.pe.length > 0) {
    html += '<div class="notes-row">';
    notes.noGadgets.forEach(p => {
      html += `<div class="note-chip gadgets">${p.emoji} ${escapeHtml(p.name)} — День без гаджетів 📵</div>`;
    });
    notes.pe.forEach(p => {
      html += `<div class="note-chip pe">${p.emoji} ${escapeHtml(p.name)} — Фізкультура 🏃</div>`;
    });
    html += '</div>';
  }

  const entries = mergeAndSortLessons(data);

  if (entries.length === 0) {
    html += '<p class="hint">Немає запланованих занять. Відпочиваємо! 🎉</p>';
  } else {
    html += renderTimeline(entries);
  }

  return html;
}

// Об'єднує дітей і дорослих в один список, сортує за часом початку
function mergeAndSortLessons(data) {
  const people = (data.kids || []).concat(data.adults || []);
  const entries = [];

  people.forEach(person => {
    person.lessons.forEach(l => {
      entries.push({
        personName: person.name,
        personEmoji: person.emoji,
        personClass: PERSON_CLASS[person.name] || 'p-default',
        start: l.start,
        end: l.end,
        lesson: l.lesson,
        lessonEmoji: l.emoji
      });
    });
  });

  entries.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return entries;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Букви імені одна під одною (вертикально, без повороту) — для стилю "Посадковий талон"
function verticalLetters(name) {
  return escapeHtml(name).toUpperCase().split('').join('<br>');
}

function renderTimeline(entries) {
  let html = '<div class="timeline">';
  entries.forEach(e => {
    html += `
      <div class="t-row">
        <div class="t-time">${escapeHtml(e.start)}</div>
        <div class="t-block ${e.personClass}">
          <div class="t-stub">${verticalLetters(e.personName)}</div>
          <div class="t-body">
            <div class="t-person">${e.personEmoji} ${escapeHtml(e.personName)}</div>
            <div class="t-lesson">${e.lessonEmoji} ${escapeHtml(e.lesson)}</div>
            <div class="t-range">${escapeHtml(e.start)}–${escapeHtml(e.end)}</div>
          </div>
        </div>
      </div>`;
  });
  html += '</div>';
  return html;
}

// ---- Рендер тижневого розкладу однієї дитини ----
function renderPersonWeek(data) {
  const personClass = PERSON_CLASS[data.name] || 'p-default';
  let html = `<div class="day-title">${data.emoji} ${escapeHtml(data.name)} — тиждень</div>`;

  const relevantDays = data.days.filter(d => d.lessons.length > 0 || d.noGadgets || d.pe);

  if (relevantDays.length === 0) {
    html += '<p class="hint">На цьому тижні занять немає. 🎉</p>';
    return html;
  }

  relevantDays.forEach(d => {
    html += `<div class="day-title" style="font-size:13px;opacity:0.8;">${escapeHtml(DAY_NAMES_FULL[d.dayUa] || d.dayUa)}</div>`;

    if (d.noGadgets || d.pe) {
      html += '<div class="notes-row">';
      if (d.noGadgets) {
        html += `<div class="note-chip gadgets">${data.emoji} День без гаджетів 📵</div>`;
      }
      if (d.pe) {
        html += `<div class="note-chip pe">${data.emoji} Фізкультура 🏃</div>`;
      }
      html += '</div>';
    }

    if (d.lessons.length > 0) {
      html += '<div class="timeline">';
      d.lessons.forEach(l => {
        html += `
          <div class="t-row">
            <div class="t-time">${escapeHtml(l.start)}</div>
            <div class="t-block ${personClass}">
              <div class="t-stub">${verticalLetters(data.name)}</div>
              <div class="t-body">
                <div class="t-lesson">${l.emoji} ${escapeHtml(l.lesson)}</div>
                <div class="t-range">${escapeHtml(l.start)}–${escapeHtml(l.end)}</div>
              </div>
            </div>
          </div>`;
      });
      html += '</div>';
    }
  });

  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- Кнопка "Оновити" ----
refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spinning');
  await refreshCurrent();
  refreshBtn.classList.remove('spinning');
});

// ---- Pull-to-refresh: потягнути екран вниз, коли він уже прогорнутий до самого верху ----
const PULL_THRESHOLD = 70;
const PULL_MAX = 100;
let pullStartY = null;
let isPulling = false;

document.addEventListener('touchstart', (e) => {
  const scrollTop = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
  if (scrollTop > 0) return;
  pullStartY = e.touches[0].clientY;
  isPulling = true;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!isPulling || pullStartY === null) return;
  const dy = e.touches[0].clientY - pullStartY;
  if (dy <= 0) {
    resetPull();
    return;
  }
  const dist = Math.min(dy, PULL_MAX);
  pullIndicatorEl.style.height = dist + 'px';
  pullIndicatorEl.textContent = dist > PULL_THRESHOLD ? '↑ Відпустіть, щоб оновити' : '↓ Потягніть, щоб оновити';
}, { passive: true });

document.addEventListener('touchend', async () => {
  if (!isPulling) return;
  const dist = parseInt(pullIndicatorEl.style.height, 10) || 0;
  isPulling = false;
  pullStartY = null;

  if (dist > PULL_THRESHOLD) {
    pullIndicatorEl.textContent = '⏳ Оновлення...';
    pullIndicatorEl.style.height = '50px';
    await refreshCurrent();
  }
  pullIndicatorEl.style.height = '0px';
});

function resetPull() {
  isPulling = false;
  pullStartY = null;
  pullIndicatorEl.style.height = '0px';
}

initTheme();
initHome();
