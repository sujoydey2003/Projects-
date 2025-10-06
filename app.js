(function() {
  const STORAGE_KEY = "health-tracker-v1";

  function todayKey() {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - tzOffset * 60000);
    return local.toISOString().slice(0, 10);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 11);
  }

  const defaultState = () => ({
    activeDate: todayKey(),
    theme: "dark",
    goals: { waterMl: 2000, steps: 10000, calories: 2000 },
    schedule: [], // {id, name, durationMin, weekday(0-6)}
    days: {} // dateKey: { waterMl, steps, foods[], workouts[] }
  });

  class HealthTracker {
    constructor() {
      this.state = this.load() || defaultState();
      this.ensureDay(this.state.activeDate);
      this.save();
    }

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.days) parsed.days = {};
        if (!parsed.schedule) parsed.schedule = [];
        if (!parsed.goals) parsed.goals = { waterMl: 2000, steps: 10000, calories: 2000 };
        if (!parsed.activeDate) parsed.activeDate = todayKey();
        if (!parsed.theme) parsed.theme = "dark";
        return parsed;
      } catch (e) {
        console.error("Failed to load state", e);
        return null;
      }
    }

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    }

    ensureDay(dateKey) {
      if (!this.state.days[dateKey]) {
        this.state.days[dateKey] = {
          waterMl: 0,
          steps: 0,
          foods: [], // {id, name, calories}
          workouts: [] // {id, name, durationMin, completedAt}
        };
      }
    }

    setActiveDate(dateKey) {
      this.state.activeDate = dateKey;
      this.ensureDay(dateKey);
      this.save();
    }

    // Goals and settings
    setTheme(theme) {
      this.state.theme = theme;
      this.save();
    }

    setDefaultGoals({ waterMl, steps, calories }) {
      if (Number.isFinite(waterMl)) this.state.goals.waterMl = Math.max(0, Math.floor(waterMl));
      if (Number.isFinite(steps)) this.state.goals.steps = Math.max(0, Math.floor(steps));
      if (Number.isFinite(calories)) this.state.goals.calories = Math.max(0, Math.floor(calories));
      this.save();
    }

    // Daily water
    getWater(dateKey) { return this.state.days[dateKey].waterMl; }
    addWater(dateKey, ml) {
      const v = Math.max(0, Math.floor(ml || 0));
      this.state.days[dateKey].waterMl += v;
      this.save();
    }
    setWaterGoal(ml) { this.state.goals.waterMl = Math.max(0, Math.floor(ml || 0)); this.save(); }

    // Daily steps
    getSteps(dateKey) { return this.state.days[dateKey].steps; }
    addSteps(dateKey, steps) {
      const v = Math.max(0, Math.floor(steps || 0));
      this.state.days[dateKey].steps += v;
      this.save();
    }
    setStepsGoal(steps) { this.state.goals.steps = Math.max(0, Math.floor(steps || 0)); this.save(); }

    // Food diary
    getFoods(dateKey) { return this.state.days[dateKey].foods; }
    addFood(dateKey, name, calories) {
      const cals = Math.max(0, Math.floor(Number(calories) || 0));
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      this.state.days[dateKey].foods.push({ id: uid(), name: trimmed, calories: cals });
      this.save();
    }
    removeFood(dateKey, id) {
      const foods = this.state.days[dateKey].foods;
      this.state.days[dateKey].foods = foods.filter(f => f.id !== id);
      this.save();
    }

    // Workouts
    getWorkouts(dateKey) { return this.state.days[dateKey].workouts; }
    addWorkout(dateKey, name, durationMin) {
      const mins = Math.max(0, Math.floor(Number(durationMin) || 0));
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      this.state.days[dateKey].workouts.push({ id: uid(), name: trimmed, durationMin: mins, completedAt: new Date().toISOString() });
      this.save();
    }
    removeWorkout(dateKey, id) {
      const workouts = this.state.days[dateKey].workouts;
      this.state.days[dateKey].workouts = workouts.filter(w => w.id !== id);
      this.save();
    }

    // Workout schedule (weekly)
    getSchedule() { return this.state.schedule; }
    addScheduleItem(name, durationMin, weekday) {
      const mins = Math.max(0, Math.floor(Number(durationMin) || 0));
      const wd = Math.max(0, Math.min(6, Number(weekday) || 0));
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      this.state.schedule.push({ id: uid(), name: trimmed, durationMin: mins, weekday: wd });
      this.save();
    }
    removeScheduleItem(id) {
      this.state.schedule = this.state.schedule.filter(s => s.id !== id);
      this.save();
    }

    getTotals(dateKey) {
      const day = this.state.days[dateKey];
      const calories = day.foods.reduce((sum, f) => sum + (Number(f.calories) || 0), 0);
      return { waterMl: day.waterMl, steps: day.steps, calories };
    }

    getLastNDates(n, endDateKey) {
      const dates = [];
      const end = new Date(endDateKey + "T00:00:00");
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        dates.push(local.toISOString().slice(0, 10));
      }
      return dates;
    }

    getSeries(dateKeys) {
      return dateKeys.map(k => {
        this.ensureDay(k);
        const t = this.getTotals(k);
        return { dateKey: k, ...t };
      });
    }

    clearAll() {
      this.state = defaultState();
      this.save();
    }
  }

  // UI Helpers
  const $ = (id) => document.getElementById(id);
  function setThemeAttr(theme) {
    document.documentElement.classList.toggle("light", theme === "light");
  }
  function toShortDayName(dateKey) {
    const d = new Date(dateKey + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }

  const tracker = new HealthTracker();
  setThemeAttr(tracker.state.theme);

  // Initialize date picker
  (function initDatePicker() {
    const input = $("datePicker");
    input.value = tracker.state.activeDate;
    input.addEventListener("change", () => {
      const value = input.value || todayKey();
      tracker.setActiveDate(value);
      renderAll();
    });
  })();

  // Theme toggle
  $("themeToggle").addEventListener("click", () => {
    const next = tracker.state.theme === "dark" ? "light" : "dark";
    tracker.setTheme(next);
    setThemeAttr(next);
  });

  // Tabs
  (function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(btn => btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-view");
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.getElementById(target).classList.add("active");
    }));
  })();

  // Food
  (function initFood() {
    const form = $("foodForm");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("foodName").value;
      const calories = Number($("foodCalories").value);
      tracker.addFood(tracker.state.activeDate, name, calories);
      $("foodName").value = "";
      $("foodCalories").value = "";
      renderFood();
      renderDashboard();
      renderCharts();
    });
  })();

  function renderFood() {
    const list = $("foodList");
    const foods = tracker.getFoods(tracker.state.activeDate);
    list.innerHTML = "";
    for (const f of foods) {
      const item = document.createElement("div");
      item.className = "list-item";
      const left = document.createElement("div");
      left.innerHTML = `<div>${f.name}</div><div class="meta">${f.calories} kcal</div>`;
      const actions = document.createElement("div");
      actions.className = "actions";
      const del = document.createElement("button");
      del.className = "btn btn-secondary";
      del.textContent = "Delete";
      del.addEventListener("click", () => { tracker.removeFood(tracker.state.activeDate, f.id); renderFood(); renderDashboard(); renderCharts(); });
      actions.appendChild(del);
      item.appendChild(left);
      item.appendChild(actions);
      list.appendChild(item);
    }
    const totals = tracker.getTotals(tracker.state.activeDate);
    $("foodTotal").textContent = String(totals.calories);
  }

  // Water
  (function initWater() {
    $("saveWaterGoal").addEventListener("click", () => {
      const v = Number($("waterGoalInput").value);
      if (Number.isFinite(v)) tracker.setWaterGoal(v);
      renderWater();
      renderDashboard();
      renderCharts();
    });
    $("addWater250").addEventListener("click", () => { tracker.addWater(tracker.state.activeDate, 250); renderWater(); renderDashboard(); renderCharts(); });
    $("addWater500").addEventListener("click", () => { tracker.addWater(tracker.state.activeDate, 500); renderWater(); renderDashboard(); renderCharts(); });
    $("addWaterCustom").addEventListener("click", () => {
      const v = Number($("waterCustom").value);
      if (Number.isFinite(v) && v > 0) tracker.addWater(tracker.state.activeDate, v);
      $("waterCustom").value = "";
      renderWater();
      renderDashboard();
      renderCharts();
    });
  })();

  function renderWater() {
    $("waterGoalInput").value = String(tracker.state.goals.waterMl);
    $("waterGoal").textContent = String(tracker.state.goals.waterMl);
    const current = tracker.getWater(tracker.state.activeDate);
    $("waterTotal").textContent = String(current);
    const pct = tracker.state.goals.waterMl > 0 ? clamp((current / tracker.state.goals.waterMl) * 100, 0, 100) : 0;
    $("waterProgressBar").style.width = pct + "%";
  }

  // Steps
  (function initSteps() {
    $("saveStepsGoal").addEventListener("click", () => {
      const v = Number($("stepsGoalInput").value);
      if (Number.isFinite(v)) tracker.setStepsGoal(v);
      renderSteps();
      renderDashboard();
      renderCharts();
    });
    $("addSteps").addEventListener("click", () => {
      const v = Number($("stepsToAdd").value);
      if (Number.isFinite(v) && v > 0) tracker.addSteps(tracker.state.activeDate, v);
      $("stepsToAdd").value = "";
      renderSteps();
      renderDashboard();
      renderCharts();
    });
  })();

  function renderSteps() {
    $("stepsGoalInput").value = String(tracker.state.goals.steps);
    $("stepsGoal").textContent = String(tracker.state.goals.steps);
    const current = tracker.getSteps(tracker.state.activeDate);
    $("stepsTotal").textContent = String(current);
    const pct = tracker.state.goals.steps > 0 ? clamp((current / tracker.state.goals.steps) * 100, 0, 100) : 0;
    $("stepsProgressBar").style.width = pct + "%";
  }

  // Workouts
  (function initWorkouts() {
    $("workoutForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("workoutName").value;
      const mins = Number($("workoutDuration").value);
      tracker.addWorkout(tracker.state.activeDate, name, mins);
      $("workoutName").value = "";
      $("workoutDuration").value = "";
      renderWorkouts();
    });

    $("scheduleForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("scheduleName").value;
      const mins = Number($("scheduleDuration").value);
      const weekday = Number($("scheduleWeekday").value);
      tracker.addScheduleItem(name, mins, weekday);
      $("scheduleName").value = "";
      $("scheduleDuration").value = "";
      $("scheduleWeekday").value = "0";
      renderSchedule();
      renderTodaySchedule();
    });
  })();

  function renderWorkouts() {
    const list = $("workoutList");
    const items = tracker.getWorkouts(tracker.state.activeDate);
    list.innerHTML = "";
    for (const w of items) {
      const item = document.createElement("div");
      item.className = "list-item";
      const left = document.createElement("div");
      const date = new Date(w.completedAt);
      const when = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      left.innerHTML = `<div>${w.name}</div><div class="meta">${w.durationMin} min • ${when}</div>`;
      const actions = document.createElement("div");
      actions.className = "actions";
      const del = document.createElement("button");
      del.className = "btn btn-secondary";
      del.textContent = "Delete";
      del.addEventListener("click", () => { tracker.removeWorkout(tracker.state.activeDate, w.id); renderWorkouts(); });
      actions.appendChild(del);
      item.appendChild(left);
      item.appendChild(actions);
      list.appendChild(item);
    }
    renderTodaySchedule();
    renderSchedule();
  }

  function renderSchedule() {
    const list = $("scheduleList");
    list.innerHTML = "";
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    for (const s of tracker.getSchedule()) {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `<div>${s.name}<div class="meta">${s.durationMin} min • ${days[s.weekday]}</div></div>`;
      const actions = document.createElement("div");
      actions.className = "actions";
      const del = document.createElement("button");
      del.className = "btn btn-secondary";
      del.textContent = "Delete";
      del.addEventListener("click", () => { tracker.removeScheduleItem(s.id); renderSchedule(); renderTodaySchedule(); });
      actions.appendChild(del);
      item.appendChild(actions);
      list.appendChild(item);
    }
  }

  function renderTodaySchedule() {
    const list = $("todaySchedule");
    list.innerHTML = "";
    const weekday = new Date(tracker.state.activeDate + "T00:00:00").getDay();
    const todays = tracker.getSchedule().filter(s => s.weekday === weekday);
    if (todays.length === 0) {
      const empty = document.createElement("div");
      empty.className = "list-item";
      empty.innerHTML = `<div>No planned workout for today</div>`;
      list.appendChild(empty);
      return;
    }
    for (const s of todays) {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `<div>${s.name}<div class=\"meta\">${s.durationMin} min</div></div>`;
      const actions = document.createElement("div");
      actions.className = "actions";
      const complete = document.createElement("button");
      complete.className = "btn";
      complete.textContent = "Log as done";
      complete.addEventListener("click", () => { tracker.addWorkout(tracker.state.activeDate, s.name, s.durationMin); renderWorkouts(); });
      actions.appendChild(complete);
      item.appendChild(actions);
      list.appendChild(item);
    }
  }

  // Dashboard
  function renderDashboard() {
    const totals = tracker.getTotals(tracker.state.activeDate);
    $("summaryWater").textContent = String(totals.waterMl);
    $("summaryWaterGoal").textContent = String(tracker.state.goals.waterMl);
    $("summarySteps").textContent = String(totals.steps);
    $("summaryStepsGoal").textContent = String(tracker.state.goals.steps);
    $("summaryCalories").textContent = String(totals.calories);

    const waterPct = tracker.state.goals.waterMl > 0 ? clamp((totals.waterMl / tracker.state.goals.waterMl) * 100, 0, 100) : 0;
    const stepsPct = tracker.state.goals.steps > 0 ? clamp((totals.steps / tracker.state.goals.steps) * 100, 0, 100) : 0;
    $("summaryWaterProgress").style.width = waterPct + "%";
    $("summaryStepsProgress").style.width = stepsPct + "%";
  }

  function renderCharts() {
    renderBarChart("chartWater", (series) => series.map(x => x.waterMl), tracker.state.goals.waterMl, (v) => `${v}`);
    renderBarChart("chartSteps", (series) => series.map(x => x.steps), tracker.state.goals.steps, (v) => `${v}`);
    renderBarChart("chartCalories", (series) => series.map(x => x.calories), tracker.state.goals.calories || 2000, (v) => `${v}`);
  }

  function renderBarChart(containerId, valueSelector, goalForScale, valueLabelFmt) {
    const container = $(containerId);
    const dates = tracker.getLastNDates(7, tracker.state.activeDate);
    const series = tracker.getSeries(dates);
    const values = valueSelector(series);
    const maxScale = Math.max(goalForScale || 0, ...values, 1);
    container.innerHTML = "";
    for (let i = 0; i < series.length; i++) {
      const v = values[i];
      const pct = clamp((v / maxScale) * 100, 0, 100);
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.height = pct + "%";
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = toShortDayName(series[i].dateKey);
      const value = document.createElement("div");
      value.className = "value";
      value.textContent = valueLabelFmt(v);
      bar.appendChild(fill);
      bar.appendChild(label);
      bar.appendChild(value);
      container.appendChild(bar);
    }
  }

  function renderAll() {
    renderDashboard();
    renderCharts();
    renderFood();
    renderWater();
    renderSteps();
    renderWorkouts();
  }

  // Settings
  (function initSettings() {
    const defaults = tracker.state.goals;
    $("defaultWaterGoal").value = String(defaults.waterMl);
    $("defaultStepsGoal").value = String(defaults.steps);
    $("defaultCaloriesGoal").value = String(defaults.calories);

    $("saveDefaults").addEventListener("click", () => {
      const water = Number($("defaultWaterGoal").value);
      const steps = Number($("defaultStepsGoal").value);
      const calories = Number($("defaultCaloriesGoal").value);
      tracker.setDefaultGoals({ waterMl: water, steps, calories });
      renderAll();
    });

    $("clearData").addEventListener("click", () => {
      if (confirm("This will erase all data. Continue?")) {
        tracker.clearAll();
        setThemeAttr(tracker.state.theme);
        $("datePicker").value = tracker.state.activeDate;
        renderAll();
      }
    });
  })();

  // Initial render
  renderAll();
})();
