(function () {
  "use strict";

  const STORAGE_STATS = "studyflow_stats_v1";
  const STORAGE_TASKS = "studyflow_tasks_v1";
  const STORAGE_GOALS = "studyflow_goals_v1";

  const RING_CIRC = 2 * Math.PI * 54;

  /** @returns {string} YYYY-MM-DD in local time */
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
  }

  /** Monday 00:00 local week id */
  function weekId() {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return dateKey(monday);
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_STATS);
      if (!raw) {
        return { minutesByDay: {}, sessions: 0 };
      }
      const data = JSON.parse(raw);
      if (!data.minutesByDay || typeof data.minutesByDay !== "object") {
        data.minutesByDay = {};
      }
      if (typeof data.sessions !== "number") data.sessions = 0;
      return data;
    } catch {
      return { minutesByDay: {}, sessions: 0 };
    }
  }

  function saveStats(data) {
    localStorage.setItem(STORAGE_STATS, JSON.stringify(data));
  }

  function minutesToday(stats) {
    return stats.minutesByDay[todayKey()] || 0;
  }

  function minutesThisWeek(stats) {
    let sum = 0;
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = dateKey(d);
      if (stats.minutesByDay[k]) sum += stats.minutesByDay[k];
    }
    return sum;
  }

  /** Consecutive days with ≥1 min, ending today or yesterday if today empty */
  function computeStreak(stats) {
    let streak = 0;
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const k = dateKey(d);
      const m = stats.minutesByDay[k] || 0;
      if (m >= 1) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        if (i === 0) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return streak;
  }

  function addFocusMinutes(minutes) {
    const stats = loadStats();
    const key = todayKey();
    stats.minutesByDay[key] = (stats.minutesByDay[key] || 0) + minutes;
    stats.sessions = (stats.sessions || 0) + 1;
    saveStats(stats);
    renderStats();
  }

  function renderStats() {
    const stats = loadStats();
    const today = minutesToday(stats);
    const week = minutesThisWeek(stats);
    const streak = computeStreak(stats);
    const el = (id) => document.getElementById(id);
    if (el("statToday")) el("statToday").textContent = String(today);
    if (el("statSessions")) el("statSessions").textContent = String(stats.sessions || 0);
    if (el("statWeek")) el("statWeek").textContent = String(week);
    if (el("statStreak")) el("statStreak").textContent = String(streak);
    if (el("sidebarTodayMinutes")) el("sidebarTodayMinutes").textContent = String(today);
  }

  /* ——— Tasks ——— */
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_TASKS);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveTasks(tasks) {
    localStorage.setItem(STORAGE_TASKS, JSON.stringify(tasks));
  }

  function renderTasks() {
    const list = document.getElementById("taskList");
    const empty = document.getElementById("taskEmpty");
    const tasks = loadTasks();
    list.innerHTML = "";
    tasks.forEach((t) => {
      const li = document.createElement("li");
      li.className = "task-item" + (t.done ? " task-item--done" : "");
      li.dataset.id = t.id;
      li.innerHTML =
        '<input type="checkbox" class="task-item__check" ' +
        (t.done ? "checked " : "") +
        'aria-label="Marcar tarefa como concluída" />' +
        '<span class="task-item__label"></span>' +
        '<button type="button" class="task-item__del" aria-label="Excluir tarefa">Remover</button>';
      li.querySelector(".task-item__label").textContent = t.text;
      const cb = li.querySelector(".task-item__check");
      cb.addEventListener("change", () => {
        t.done = cb.checked;
        saveTasks(tasks);
        li.classList.toggle("task-item--done", t.done);
      });
      li.querySelector(".task-item__del").addEventListener("click", () => {
        const next = loadTasks().filter((x) => x.id !== t.id);
        saveTasks(next);
        renderTasks();
      });
      list.appendChild(li);
    });
    empty.classList.toggle("is-visible", tasks.length === 0);
  }

  /* ——— Goals (weekly, Monday bucket) ——— */
  function loadGoalsState() {
    try {
      const raw = localStorage.getItem(STORAGE_GOALS);
      if (!raw) return { weekId: weekId(), items: [] };
      const data = JSON.parse(raw);
      const wid = weekId();
      if (data.weekId !== wid) {
        return { weekId: wid, items: [] };
      }
      if (!Array.isArray(data.items)) data.items = [];
      return data;
    } catch {
      return { weekId: weekId(), items: [] };
    }
  }

  function saveGoalsState(state) {
    localStorage.setItem(STORAGE_GOALS, JSON.stringify(state));
  }

  function renderGoals() {
    const list = document.getElementById("goalsList");
    const ringFg = document.getElementById("goalsRingFg");
    const pctEl = document.getElementById("goalsPct");
    const state = loadGoalsState();
    const items = state.items;
    const done = items.filter((g) => g.done).length;
    const total = items.length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    if (ringFg) ringFg.setAttribute("stroke-dasharray", `${pct}, 100`);
    if (pctEl) pctEl.textContent = `${pct}%`;

    list.innerHTML = "";
    items.forEach((g) => {
      const li = document.createElement("li");
      li.className = "goal-item" + (g.done ? " goal-item--done" : "");
      li.innerHTML =
        '<input type="checkbox" class="goal-item__check" ' +
        (g.done ? "checked " : "") +
        'aria-label="Marcar meta como concluída" />' +
        '<span class="goal-item__text"></span>' +
        '<button type="button" class="goal-item__del" aria-label="Remover meta">×</button>';
      li.querySelector(".goal-item__text").textContent = g.text;
      const cb = li.querySelector(".goal-item__check");
      cb.addEventListener("change", () => {
        g.done = cb.checked;
        saveGoalsState(state);
        renderGoals();
      });
      li.querySelector(".goal-item__del").addEventListener("click", () => {
        state.items = state.items.filter((x) => x.id !== g.id);
        saveGoalsState(state);
        renderGoals();
      });
      list.appendChild(li);
    });
  }

  /* ——— Pomodoro ——— */
  let totalSeconds = 25 * 60;
  let remaining = totalSeconds;
  let intervalId = null;
  let running = false;
  let currentMode = "focus";
  let focusDurationSec = 25 * 60;

  const ringProgress = document.getElementById("ringProgress");
  const timerDisplay = document.getElementById("timerDisplay");
  const timerMode = document.getElementById("timerMode");
  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnReset = document.getElementById("btnReset");
  const chips = document.querySelectorAll(".chip[data-duration]");

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateRing() {
    if (!ringProgress) return;
    const p = 1 - remaining / totalSeconds;
    const offset = RING_CIRC * (1 - p);
    ringProgress.style.strokeDashoffset = String(offset);
  }

  function setDisplay() {
    if (timerDisplay) timerDisplay.textContent = formatTime(remaining);
    updateRing();
  }

  function setModeFromChip(chip) {
    chips.forEach((c) => c.classList.remove("chip--active"));
    chip.classList.add("chip--active");
    const sec = parseInt(chip.getAttribute("data-duration"), 10);
    currentMode = chip.getAttribute("data-mode") || "focus";
    totalSeconds = sec;
    remaining = sec;
    if (currentMode === "focus") focusDurationSec = sec;
    const labels = { focus: "Foco", short: "Pausa curta", long: "Pausa longa" };
    if (timerMode) timerMode.textContent = labels[currentMode] || "Foco";
    stopTimer();
    setDisplay();
  }

  function stopTimer(resetButtons) {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    running = false;
    if (resetButtons !== false) {
      if (btnStart) {
        btnStart.disabled = false;
        btnStart.textContent = "Iniciar";
      }
      if (btnPause) {
        btnPause.disabled = true;
      }
    }
  }

  function onComplete() {
    stopTimer();
    if (currentMode === "focus") {
      const mins = Math.round(focusDurationSec / 60);
      addFocusMinutes(mins);
    }
    if (typeof Audio !== "undefined") {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.08, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.26);
      } catch (_) {}
    }
    remaining = totalSeconds;
    setDisplay();
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(intervalId);
      intervalId = null;
      remaining = 0;
      setDisplay();
      onComplete();
      return;
    }
    setDisplay();
  }

  function startTimer() {
    if (running) return;
    running = true;
    if (btnStart) {
      btnStart.disabled = true;
      btnStart.textContent = "Em andamento";
    }
    if (btnPause) btnPause.disabled = false;
    intervalId = setInterval(tick, 1000);
  }

  function pauseTimer() {
    if (!running) return;
    running = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.textContent = "Continuar";
    }
    if (btnPause) btnPause.disabled = true;
  }

  function resetTimer() {
    stopTimer();
    remaining = totalSeconds;
    if (btnStart) btnStart.textContent = "Iniciar";
    setDisplay();
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => setModeFromChip(chip));
  });

  if (btnStart) btnStart.addEventListener("click", () => (running ? null : startTimer()));
  if (btnPause) btnPause.addEventListener("click", pauseTimer);
  if (btnReset) btnReset.addEventListener("click", resetTimer);

  if (ringProgress) {
    ringProgress.style.strokeDasharray = String(RING_CIRC);
    ringProgress.style.strokeDashoffset = String(RING_CIRC);
  }
  setDisplay();

  /* ——— Forms ——— */
  document.getElementById("taskForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("taskInput");
    const text = (input && input.value.trim()) || "";
    if (!text) return;
    const tasks = loadTasks();
    tasks.unshift({ id: newId(), text, done: false });
    saveTasks(tasks);
    input.value = "";
    renderTasks();
  });

  document.getElementById("goalForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("goalInput");
    const text = (input && input.value.trim()) || "";
    if (!text) return;
    const state = loadGoalsState();
    state.weekId = weekId();
    state.items.push({ id: newId(), text, done: false });
    saveGoalsState(state);
    input.value = "";
    renderGoals();
  });

  /* ——— Sidebar & nav ——— */
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggle = document.getElementById("sidebarToggle");
  const titles = {
    dashboard: ["Painel", "Seu centro de comando dos estudos"],
    timer: ["Pomodoro", "Blocos de foco para estudar com constância"],
    tasks: ["Tarefas", "Organize o que importa nesta sessão"],
    goals: ["Metas da semana", "Planeje a semana — tudo reinicia na segunda"],
  };

  function closeSidebar() {
    sidebar?.classList.remove("is-open");
    overlay?.classList.remove("is-open");
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function openSidebar() {
    sidebar?.classList.add("is-open");
    overlay?.classList.add("is-open");
    if (overlay) overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  toggle?.addEventListener("click", () => {
    if (sidebar?.classList.contains("is-open")) closeSidebar();
    else openSidebar();
  });
  overlay?.addEventListener("click", closeSidebar);

  document.querySelectorAll(".sidebar__link").forEach((link) => {
    link.addEventListener("click", () => {
      const section = link.getAttribute("data-section");
      if (section && titles[section]) {
        document.querySelectorAll(".sidebar__link").forEach((l) => l.classList.remove("sidebar__link--active"));
        link.classList.add("sidebar__link--active");
        const h = document.getElementById("pageTitle");
        const s = document.getElementById("pageSub");
        if (h) h.textContent = titles[section][0];
        if (s) s.textContent = titles[section][1];
        const panel = document.getElementById(section);
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (window.matchMedia("(max-width: 768px)").matches) closeSidebar();
    });
  });

  window.addEventListener("hashchange", () => {
    const hash = (location.hash || "#dashboard").slice(1);
    const link = document.querySelector('.sidebar__link[data-section="' + hash + '"]');
    if (link) link.click();
  });

  /* Init */
  renderStats();
  renderTasks();
  renderGoals();

  const initial = (location.hash || "#dashboard").replace("#", "");
  if (titles[initial]) {
    const link = document.querySelector('.sidebar__link[data-section="' + initial + '"]');
    if (link) link.click();
  }
})();
