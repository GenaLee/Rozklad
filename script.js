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

const WEEK_ORDER = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

// Усі члени родини — для випадаючого списку "Кого стосується" у формі події
const ALL_PEOPLE = KIDS.concat([
  { name: "Гена", emoji: "👨" },
  { name: "Свєта", emoji: "👩" }
]);

const contentEl = document.getElementById('content');
const childMenuEl = document.getElementById('child-menu');
const weekdayMenuEl = document.getElementById('weekday-menu');
const eventsPanelEl = document.getElementById('events-panel');
const eventsStartInput = document.getElementById('events-start');
const eventsEndInput = document.getElementById('events-end');
const eventsShowBtn = document.getElementById('events-show-btn');
const eventsListEl = document.getElementById('events-list');
const toggleAddEventBtn = document.getElementById('toggle-add-event-btn');
const addEventFormEl = document.getElementById('add-event-form');
const eventWhoSelect = document.getElementById('event-who');
const eventDateInput = document.getElementById('event-date');
const eventBeginInput = document.getElementById('event-begin');
const eventEndInput = document.getElementById('event-end');
const eventDescriptionInput = document.getElementById('event-description');
const eventFormTitleEl = document.getElementById('event-form-title');
const cancelEventBtn = document.getElementById('cancel-event-btn');
const eventFormOverlayEl = document.getElementById('event-form-overlay');
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

// Кнопки-перемикачі (toggle): повторне натискання ховає свою панель/кнопки
const TOGGLE_PANELS = {
  child: childMenuEl,
  weekday: weekdayMenuEl,
  events: eventsPanelEl
};

// Кожен розділ пам'ятає свій останній екран: при перемиканні він ховається,
// а при поверненні миттєво відновлюється (дані потім лише звіряються з кешем).
let currentSection = null;
const sectionSnapshots = {};
let renderToken = 0;

function saveSectionSnapshot() {
  renderToken++;
  if (currentSection) {
    sectionSnapshots[currentSection] = { html: contentEl.innerHTML, view: currentView };
  }
}

function restoreSectionSnapshot(action) {
  const snap = sectionSnapshots[action];
  contentEl.innerHTML = snap ? snap.html : '';
  if (snap) currentView = snap.view;
  return snap;
}

menuButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const panelEl = TOGGLE_PANELS[action];

    if (panelEl) {
      const isOpen = !panelEl.classList.contains('hidden');

      // Ховаємо всі інші панелі-перемикачі
      Object.keys(TOGGLE_PANELS).forEach(key => {
        if (key !== action) TOGGLE_PANELS[key].classList.add('hidden');
      });

      saveSectionSnapshot();

      if (isOpen) {
        // Повторне натискання — сховати кнопки/панель і розклад (toggle вимкнути)
        panelEl.classList.add('hidden');
        contentEl.innerHTML = '';
        btn.classList.remove('active');
        currentSection = null;
        return;
      }

      currentSection = action;
      setActiveButton(btn);
      const snap = restoreSectionSnapshot(action);
      const view = snap ? snap.view : null;

      if (action === 'weekday') {
        showWeekdayMenu(view && view.type === 'day' ? view.weekday : null);
        if (!snap) currentView = { type: 'none' };
        else loadWeekday(view.weekday);
      } else if (action === 'child') {
        showChildMenu(view && view.type === 'person' ? view.name : null);
        if (!snap) currentView = { type: 'none' };
        else loadPersonWeek(view.name);
      } else {
        eventsPanelEl.classList.remove('hidden');
        if (!snap) currentView = { type: 'eventsRange', start: eventsStartInput.value, end: eventsEndInput.value };
      }
      return;
    }

    saveSectionSnapshot();
    currentSection = action;
    setActiveButton(btn);
    Object.values(TOGGLE_PANELS).forEach(el => el.classList.add('hidden'));
    restoreSectionSnapshot(action);
    loadAndRender(action);
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
  const myToken = ++renderToken;

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
    // Якщо користувач за цей час перемкнувся на інший розділ — не перезаписуємо екран
    if (myToken === renderToken && (force || !cached || cached.lastModified !== freshLm)) {
      render(fresh);
    }
    writeCache(key, freshLm, fresh);
    if (force) showToast('Оновлено ✓');
  } catch (err) {
    if (myToken !== renderToken) {
      // застаріла відповідь — ігноруємо
    } else if (!cached) {
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

function showWeekdayMenu(activeWeekday) {
  weekdayMenuEl.innerHTML = '';
  WEEK_ORDER.forEach(weekday => {
    const btn = document.createElement('button');
    btn.className = 'child-btn' + (weekday === activeWeekday ? ' active' : '');
    btn.innerHTML = `<span>${escapeHtml(weekday)}</span>`;
    btn.addEventListener('click', () => {
      weekdayMenuEl.querySelectorAll('.child-btn').forEach(b => b.classList.toggle('active', b === btn));
      loadWeekday(weekday);
    });
    weekdayMenuEl.appendChild(btn);
  });
  weekdayMenuEl.classList.remove('hidden');
}

async function loadWeekday(weekday, force) {
  if (!force) currentView = { type: 'day', weekday };

  await loadWithCache('day', { weekday }, (data) => {
    if (data.error) {
      showError(data.error);
      return;
    }
    contentEl.innerHTML = renderDay(data);
  }, force);
}

function showChildMenu(activeName) {
  childMenuEl.innerHTML = '';
  KIDS.forEach(kid => {
    const btn = document.createElement('button');
    btn.className = 'child-btn' + (kid.name === activeName ? ' active' : '');
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
  } else if (currentView.type === 'day') {
    await loadWeekday(currentView.weekday, true);
  } else if (currentView.type === 'eventsRange') {
    await loadEventsRange(currentView.start, currentView.end, true);
  } else {
    await loadAndRender(currentView.type, true);
  }
}

// ---- Панель "Події": перегляд за період ----
async function loadEventsRange(start, end, force) {
  if (!force) currentView = { type: 'eventsRange', start, end };

  const key = cacheKeyFor('eventsRange', { start, end });
  const cached = readCache(key);

  if (!force) {
    if (cached) {
      renderEventsList(cached.payload);
    } else {
      eventsListEl.innerHTML = '<p class="loading">Завантаження...</p>';
    }
  }

  try {
    const fresh = await fetchJson('eventsRange', { start, end });
    const freshLm = extractLastModified(fresh);
    if (force || !cached || cached.lastModified !== freshLm) {
      renderEventsList(fresh);
    }
    writeCache(key, freshLm, fresh);
    if (force) showToast('Оновлено ✓');
  } catch (err) {
    if (!cached) {
      eventsListEl.innerHTML = `<p class="error">Помилка: ${escapeHtml(err.message)}</p>`;
    } else {
      showToast('Не вдалося оновити дані. Показано попередню версію.', true);
    }
  }
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function renderEventsList(data) {
  if (data.error) {
    eventsListEl.innerHTML = `<p class="error">Помилка: ${escapeHtml(data.error)}</p>`;
    return;
  }

  const events = data.events || [];
  if (events.length === 0) {
    eventsListEl.innerHTML = '<p class="hint">Немає подій за цей період.</p>';
    return;
  }

  let html = '';
  events.forEach(ev => {
    const timeLabel = ev.beginTime ? (ev.endTime ? `${ev.beginTime}–${ev.endTime}` : ev.beginTime) : '';
    const dateTimeLabel = timeLabel ? `${ev.date} · ${timeLabel}` : ev.date;
    html += `
      <div class="event-card">
        <div class="event-card-main">
          <div class="event-card-top">${ev.emoji} <strong>${escapeHtml(ev.who)}</strong> — ${escapeHtml(dateTimeLabel)}</div>
          <div class="event-card-desc">${escapeHtml(ev.description)}</div>
        </div>
        <div class="event-card-actions">
          <button type="button" class="icon-btn event-edit-btn"
            data-row="${ev.rowNumber}" data-who="${escapeAttr(ev.who)}" data-date="${escapeAttr(ev.rawDate)}"
            data-begin="${escapeAttr(ev.beginTime)}" data-end="${escapeAttr(ev.endTime)}" data-desc="${escapeAttr(ev.description)}"
            aria-label="Редагувати">✏️</button>
          <button type="button" class="icon-btn event-delete-btn" data-row="${ev.rowNumber}" aria-label="Видалити">🗑️</button>
        </div>
      </div>`;
  });
  eventsListEl.innerHTML = html;
}

eventsShowBtn.addEventListener('click', () => {
  const start = eventsStartInput.value;
  const end = eventsEndInput.value;
  if (!start || !end) {
    showToast('Оберіть обидві дати', true);
    return;
  }
  loadEventsRange(start, end, false);
});

// Після додавання/зміни/видалення події всі збережені екрани розкладу застаріли:
// забуваємо їх і їхній кеш, щоб наступний клік завантажив свіжі дані.
function invalidateScheduleViews() {
  Object.keys(sectionSnapshots).forEach(key => {
    if (key !== 'events') delete sectionSnapshots[key];
  });
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('rozklad_cache_') && !k.startsWith('rozklad_cache_eventsRange'))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

function refreshEventsListIfShown() {
  invalidateScheduleViews();
  if (currentView.type === 'eventsRange') {
    loadEventsRange(currentView.start, currentView.end, true);
  }
}

eventsListEl.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('.event-edit-btn');
  if (editBtn) {
    openEventFormForEdit({
      rowNumber: editBtn.dataset.row,
      who: editBtn.dataset.who,
      date: editBtn.dataset.date,
      beginTime: editBtn.dataset.begin,
      endTime: editBtn.dataset.end,
      description: editBtn.dataset.desc
    });
    return;
  }

  const deleteBtn = e.target.closest('.event-delete-btn');
  if (deleteBtn) {
    const rowNumber = deleteBtn.dataset.row;
    if (!confirm('Видалити цю подію? Цю дію не можна скасувати.')) return;

    deleteBtn.disabled = true;
    try {
      const body = new URLSearchParams({ action: 'deleteEvent', rowNumber });
      const response = await fetch(API_URL, { method: 'POST', body });
      const result = await response.json();
      if (result.error) {
        showToast('Помилка: ' + result.error, true);
      } else {
        showToast('Подію видалено ✓');
        refreshEventsListIfShown();
      }
    } catch (err) {
      showToast('Не вдалося видалити подію: ' + err.message, true);
    }
    deleteBtn.disabled = false;
  }
});

// ---- Панель "Події": форма додавання/редагування події ----
let editingRowNumber = null;

function populateEventWhoSelect() {
  eventWhoSelect.innerHTML = ALL_PEOPLE.map(p => `<option value="${escapeHtml(p.name)}">${p.emoji} ${escapeHtml(p.name)}</option>`).join('');
}

function openEventFormForAdd() {
  addEventFormEl.reset();
  editingRowNumber = null;
  eventFormTitleEl.textContent = 'Нова подія';
  eventFormOverlayEl.classList.remove('hidden');
}

function openEventFormForEdit(ev) {
  editingRowNumber = ev.rowNumber;
  eventWhoSelect.value = ev.who;
  eventDateInput.value = ev.date;
  eventBeginInput.value = ev.beginTime || '';
  eventEndInput.value = ev.endTime || '';
  eventDescriptionInput.value = ev.description || '';
  eventFormTitleEl.textContent = 'Редагування події';
  eventFormOverlayEl.classList.remove('hidden');
}

function closeEventForm() {
  addEventFormEl.reset();
  eventFormOverlayEl.classList.add('hidden');
  editingRowNumber = null;
  eventFormTitleEl.textContent = 'Нова подія';
}

toggleAddEventBtn.addEventListener('click', () => {
  openEventFormForAdd();
});

cancelEventBtn.addEventListener('click', () => {
  closeEventForm();
});

eventFormOverlayEl.addEventListener('click', (e) => {
  if (e.target === eventFormOverlayEl) closeEventForm();
});

addEventFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();

  const who = eventWhoSelect.value;
  const date = eventDateInput.value;
  const begin = eventBeginInput.value;
  const end = eventEndInput.value;
  const description = eventDescriptionInput.value.trim();

  if (!who || !date || !description) {
    showToast('Заповніть кого стосується, дату і опис', true);
    return;
  }

  const submitBtn = addEventFormEl.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const isEditing = !!editingRowNumber;
  const params = { action: isEditing ? 'updateEvent' : 'addEvent', who, date, beginTime: begin, endTime: end, description };
  if (isEditing) params.rowNumber = editingRowNumber;

  try {
    const body = new URLSearchParams(params);
    const response = await fetch(API_URL, { method: 'POST', body });
    const result = await response.json();

    if (result.error) {
      showToast('Помилка: ' + result.error, true);
    } else {
      showToast(isEditing ? 'Подію оновлено ✓' : 'Подію додано ✓');
      closeEventForm();
      refreshEventsListIfShown();
    }
  } catch (err) {
    showToast('Не вдалося зберегти подію: ' + err.message, true);
  }

  submitBtn.disabled = false;
});

// ---- Рендер одного дня: хронологічна шкала всіх людей разом ----
function renderDay(data) {
  let html = `<div class="day-title">${escapeHtml(data.dayUa)}, ${escapeHtml(data.date)}</div>`;

  const notes = data.specialNotes || { noGadgets: [], pe: [], events: [] };
  const notesEvents = notes.events || [];
  if (notes.noGadgets.length > 0 || notes.pe.length > 0 || notesEvents.length > 0) {
    html += '<div class="notes-row">';
    notes.noGadgets.forEach(p => {
      html += `<div class="note-chip gadgets">${p.emoji} ${escapeHtml(p.name)} — День без гаджетів 📵</div>`;
    });
    notes.pe.forEach(p => {
      html += `<div class="note-chip pe">${p.emoji} ${escapeHtml(p.name)} — Фізкультура 🏃</div>`;
    });
    notesEvents.forEach(ev => {
      html += `<div class="note-chip event">${ev.emoji} ${escapeHtml(ev.name)} — ${escapeHtml(ev.description)} 🎉</div>`;
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

function formatTimeRange(start, end) {
  return end ? `${start}–${end}` : start;
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
            <div class="t-range">${escapeHtml(formatTimeRange(e.start, e.end))}</div>
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

  const relevantDays = data.days.filter(d => d.lessons.length > 0 || d.noGadgets || d.pe || (d.events && d.events.length > 0));

  if (relevantDays.length === 0) {
    html += '<p class="hint">На цьому тижні занять немає. 🎉</p>';
    return html;
  }

  relevantDays.forEach(d => {
    html += `<div class="day-title" style="font-size:13px;opacity:0.8;">${escapeHtml(DAY_NAMES_FULL[d.dayUa] || d.dayUa)}</div>`;

    const dayEvents = d.events || [];
    if (d.noGadgets || d.pe || dayEvents.length > 0) {
      html += '<div class="notes-row">';
      if (d.noGadgets) {
        html += `<div class="note-chip gadgets">${data.emoji} День без гаджетів 📵</div>`;
      }
      if (d.pe) {
        html += `<div class="note-chip pe">${data.emoji} Фізкультура 🏃</div>`;
      }
      dayEvents.forEach(desc => {
        html += `<div class="note-chip event">${data.emoji} ${escapeHtml(desc)} 🎉</div>`;
      });
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
                <div class="t-range">${escapeHtml(formatTimeRange(l.start, l.end))}</div>
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

// Дати "Від"/"До" за замовчанням — понеділок і неділя поточного тижня
function formatDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function setDefaultEventsRange() {
  const today = new Date();
  const daysSinceMonday = (today.getDay() + 6) % 7; // Пн=0
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  eventsStartInput.value = formatDateKey(monday);
  eventsEndInput.value = formatDateKey(sunday);
}

initTheme();
initHome();
populateEventWhoSelect();
setDefaultEventsRange();
