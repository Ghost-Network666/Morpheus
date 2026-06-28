import API from "../api.js";
import { toast, showModal, closeModal } from "../app.js";

let _events = [];
let _currentDate = new Date();

export async function initCalendar() {
  await loadEvents();
  document.getElementById("cal-prev-btn")?.addEventListener("click", () => { _currentDate.setMonth(_currentDate.getMonth() - 1); renderCalendar(); });
  document.getElementById("cal-next-btn")?.addEventListener("click", () => { _currentDate.setMonth(_currentDate.getMonth() + 1); renderCalendar(); });
  document.getElementById("cal-new-btn")?.addEventListener("click", () => showEventModal());
  document.getElementById("cal-export-btn")?.addEventListener("click", () => API.calendar.exportIcs());
}

async function loadEvents() {
  try {
    _events = await API.calendar.list();
    renderCalendar();
  } catch (e) { toast(e.message, "error"); }
}

function renderCalendar() {
  const container = document.getElementById("calendar-grid");
  const titleEl = document.getElementById("cal-month-title");
  if (!container) return;

  const year = _currentDate.getFullYear();
  const month = _currentDate.getMonth();
  const monthName = _currentDate.toLocaleString("default", { month: "long" });
  if (titleEl) titleEl.textContent = `${monthName} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = days.map(d => `<div class="cal-header-cell">${d}</div>`).join("");

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell other-month"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = date.toDateString() === today.toDateString();
    const dayEvents = _events.filter(e => {
      const evDate = new Date(e.start);
      return evDate.getFullYear() === year && evDate.getMonth() === month && evDate.getDate() === day;
    });
    html += `<div class="cal-cell ${isToday ? 'today' : ''}" data-date="${date.toISOString().slice(0, 10)}">
      <div class="cal-day-num">${day}</div>
      ${dayEvents.map(e => `<div class="cal-event">${e.summary}</div>`).join("")}
    </div>`;
  }

  container.innerHTML = html;
  container.querySelectorAll(".cal-cell[data-date]").forEach(el =>
    el.addEventListener("click", () => showEventModal(el.dataset.date))
  );
}

function showEventModal(prefilledDate = "") {
  showModal("event-modal");
  if (prefilledDate) {
    const startEl = document.getElementById("event-start-input");
    if (startEl) startEl.value = prefilledDate + "T09:00";
    const endEl = document.getElementById("event-end-input");
    if (endEl) endEl.value = prefilledDate + "T10:00";
  }

  document.getElementById("event-modal-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const summary = document.getElementById("event-summary-input")?.value.trim();
    const start = document.getElementById("event-start-input")?.value;
    const end = document.getElementById("event-end-input")?.value;
    if (!summary || !start || !end) return;
    try {
      const ev = await API.calendar.create({ summary, start, end });
      _events.push(ev);
      renderCalendar();
      closeModal("event-modal");
    } catch (e) { toast(e.message, "error"); }
  }, { once: true });
}
