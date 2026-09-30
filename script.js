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
  const params = new URLSearchParams({ action, ...extraParams });
  const response = await fetch(`${API_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
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
async function loadAndRender(action) {
  showLoading();
  scrollToContent();
  try {
    if (action === 'today' || action === 'tomorrow') {
      const data = await fetchJson(action);
      contentEl.innerHTML = renderDay(data);
    } else if (action === 'week') {
      const days = await fetchJson('week');
      contentEl.innerHTML = days.map((d, i) => renderDay(d) + (i < days.length - 1 ? '<hr class="day-separator">' : '')).join('');
    }
  } catch (err) {
    showError(err.message);
  }
  scrollToContent();
}

function showChildMenu() {
  childMenuEl.innerHTML = '';
  KIDS.forEach(kid => {
    const btn = document.createElement('button');
    btn.className = 'child-btn';
    btn.innerHTML = `<span class="ico">${kid.emoji}</span><span>${escapeHtml(kid.name)}</span>`;
    btn.addEventListener('click', () => loadPersonWeek(kid.name));
    childMenuEl.appendChild(btn);
  });
  childMenuEl.classList.remove('hidden');
}

async function loadPersonWeek(name) {
  showLoading();
  scrollToContent();
  try {
    const data = await fetchJson('person', { name });
    if (data.error) {
      showError(data.error);
      return;
    }
    contentEl.innerHTML = renderPersonWeek(data);
  } catch (err) {
    showError(err.message);
  }
  scrollToContent();
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

function renderTimeline(entries) {
  let html = '<div class="timeline">';
  entries.forEach(e => {
    html += `
      <div class="t-row">
        <div class="t-time">${escapeHtml(e.start)}</div>
        <div class="t-block ${e.personClass}">
          <div class="t-person">${e.personEmoji} ${escapeHtml(e.personName)}</div>
          <div class="t-lesson">${e.lessonEmoji} ${escapeHtml(e.lesson)}</div>
          <div class="t-range">${escapeHtml(e.start)}–${escapeHtml(e.end)}</div>
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
              <div class="t-lesson">${l.emoji} ${escapeHtml(l.lesson)}</div>
              <div class="t-range">${escapeHtml(l.start)}–${escapeHtml(l.end)}</div>
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

initHome();
