"use strict";

/* ========== CONSTANTS ========== */
const STORAGE_KEY = "taskflow.tasks";
const CATEGORY_KEY = "taskflow.categories.v2";
const THEME_KEY = "taskflow.theme";
const STARTER_CATEGORIES = ["Personal", "Work", "Study", "Shopping"]; // used only the first time
const FALLBACK_CATEGORY = "Other"; // always last, cannot be removed
const MAX_CATEGORIES = 20;
const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "today", label: "Due Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "high", label: "High Priority" }
];

/* ========== STATE ========== */
let tasks = [];
let categories = [...STARTER_CATEGORIES];
let currentFilter = "all";
let editingId = null;
let confirmAction = null;
let lastFocused = null;
let currentDay = "";
let currentCategory = ""; // "" = all lists
let selectedDay = "";     // calendar filter (YYYY-MM-DD)
let calMonth = new Date();
let calOpen = false;

/* ========== DOM ========== */
const $ = (id) => document.getElementById(id);
const form = $("taskForm");
const els = {
  title: $("title"), desc: $("desc"), priority: $("priority"), category: $("category"),
  dueDate: $("dueDate"), tags: $("tags"), titleError: $("titleError"),
  formTitle: $("formTitle"), submitBtn: $("submitBtn"), cancelBtn: $("cancelBtn"),
  search: $("search"), sort: $("sort"), filters: $("filters"), list: $("taskList"),
  status: $("status"), clearDone: $("clearDone"), themeBtn: $("themeBtn"),
  empty: $("empty"), emptyIcon: $("emptyIcon"), emptyTitle: $("emptyTitle"), emptyText: $("emptyText"),
  catInput: $("catInput"), catError: $("catError"), catList: $("catList"), catEmpty: $("catEmpty"),
  toasts: $("toasts"), modal: $("modal"), modalText: $("modalText"),
  modalOk: $("modalOk"), modalCancel: $("modalCancel"),
  sideNav: $("sideNav"), quickForm: $("quickForm"), quick: $("quick"), calendar: $("calendar"),
  calToggle: $("calToggle"), calGrid: $("calGrid"), calNote: $("calNote"),
  dueTime: $("dueTime"), repeat: $("repeat"), subtasks: $("subtasks")
};

/* ========== SMALL HELPERS ========== */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Lucide-style SVG paths. Static, trusted markup only (never built from user input).
const ICON_PATHS = {
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  list: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"/>'
};

const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICON_PATHS[name];
  return svg;
};

// Pill with an SVG icon (hidden from screen readers) and a text label
const badge = (className, iconName, text) => {
  const node = el("span", `badge ${className}`.trim());
  node.append(icon(iconName), el("span", "", text));
  return node;
};

// Icon-only button; the accessible name comes from aria-label
const iconButton = (action, iconName, label, extraClass) => {
  const btn = el("button", `icon-act ${extraClass || ""}`.trim());
  btn.type = "button";
  btn.dataset.action = action;
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.append(icon(iconName));
  return btn;
};

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ========== DATE HELPERS ========== */
const pad = (n) => String(n).padStart(2, "0");
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toStr(new Date());
const fromStr = (str) => { const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (str, n) => { const d = fromStr(str); d.setDate(d.getDate() + n); return toStr(d); };

// Next occurrence of a repeating task (never in the past)
const nextDue = (str, repeat) => {
  let next = str || todayStr();
  const step = (from) => {
    if (repeat === "daily") return addDays(from, 1);
    if (repeat === "weekly") return addDays(from, 7);
    const d = fromStr(from);
    const target = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (target.getDate() !== d.getDate()) target.setDate(0); // e.g. 31 Jan -> 28 Feb
    return toStr(target);
  };
  next = step(next);
  for (let i = 0; i < 400 && next < todayStr(); i++) next = step(next);
  return next;
};

// Strict check: correct format AND a real calendar date (rejects 2025-02-31)
const isValidDate = (str) => {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

// "none" | "done" | "overdue" | "today" | "upcoming"  (completed tasks are never overdue)
const dueStatus = (task) => {
  if (!task.dueDate) return "none";
  if (task.completed) return "done";
  const today = todayStr();
  if (task.dueDate < today) return "overdue";
  return task.dueDate === today ? "today" : "upcoming";
};

const formatDate = (str) => {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/* ========== STORAGE ========== */
const readJSON = (key) => {
  try { return JSON.parse(localStorage.getItem(key)); } catch (err) { return null; }
};
const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (err) { return false; }
};

// "html css, javascript" -> ["html", "css", "javascript"] (split on commas and/or spaces)
const normalizeTags = (list) => {
  const clean = list
    .filter((t) => typeof t === "string")
    .flatMap((t) => t.split(/[\s,]+/))
    .map((t) => t.replace(/^#+/, "").toLowerCase().slice(0, 20))
    .filter(Boolean);
  return [...new Set(clean)].slice(0, 8);
};

// Rebuild every task from untrusted stored data so the rest of the app can rely on its shape
const sanitizeTask = (raw, usedIds) => {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 80) : "";
  if (!title) return null;
  const id = typeof raw.id === "string" && raw.id && !usedIds.has(raw.id) ? raw.id : makeId();
  usedIds.add(id);
  const category = typeof raw.category === "string" ? raw.category.trim().slice(0, 20) : "";
  const stamp = (v) => (Number.isFinite(v) ? v : Date.now());
  return {
    id,
    title,
    description: typeof raw.description === "string" ? raw.description.slice(0, 300) : "",
    completed: raw.completed === true,
    priority: PRIORITY_RANK[raw.priority] ? raw.priority : "medium",
    category: category || FALLBACK_CATEGORY,
    tags: Array.isArray(raw.tags) ? normalizeTags(raw.tags) : [],
    dueDate: isValidDate(raw.dueDate) ? raw.dueDate : "",
    createdAt: stamp(raw.createdAt),
    updatedAt: stamp(raw.updatedAt),
    dueTime: typeof raw.dueTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.dueTime) ? raw.dueTime : "",
    repeat: ["daily", "weekly", "monthly"].includes(raw.repeat) ? raw.repeat : "none",
    reminded: raw.reminded === true,
    nextId: typeof raw.nextId === "string" ? raw.nextId : "",
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks
          .filter((x) => x && typeof x.text === "string" && x.text.trim())
          .slice(0, 20)
          .map((x) => ({ id: typeof x.id === "string" && x.id ? x.id : makeId(), text: x.text.trim().slice(0, 80), done: x.done === true }))
      : []
  };
};

const loadTasks = () => {
  const data = readJSON(STORAGE_KEY);
  if (!Array.isArray(data)) return [];
  const usedIds = new Set();
  return data.map((t) => sanitizeTask(t, usedIds)).filter(Boolean);
};

const loadCategories = () => {
  const data = readJSON(CATEGORY_KEY);
  if (!Array.isArray(data)) return [...STARTER_CATEGORIES];
  const result = [];
  data.forEach((name) => {
    if (typeof name !== "string") return;
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
    const taken = [...result, FALLBACK_CATEGORY].some((c) => c.toLowerCase() === clean.toLowerCase());
    if (clean && !taken && result.length < MAX_CATEGORIES) result.push(clean);
  });
  return result;
};

const saveTasks = () => {
  if (!writeJSON(STORAGE_KEY, tasks)) showToast("Could not save – browser storage is unavailable or full.");
};
const saveCategories = () => writeJSON(CATEGORY_KEY, categories);

/* ========== CATEGORIES ========== */
const getCategories = () => [...categories, FALLBACK_CATEGORY];
const defaultCategory = () => categories[0] || FALLBACK_CATEGORY;

const renderCategorySelect = (selected) => {
  const options = getCategories();
  if (selected && !options.includes(selected)) options.push(selected); // keep unknown value while editing
  els.category.replaceChildren(...options.map((c) => new Option(c, c)));
  els.category.value = selected || defaultCategory();
};

const renderCategoryManager = () => {
  els.catList.replaceChildren(...categories.map((name) => {
    const li = el("li", "", name);
    const btn = el("button", "", "×");
    btn.type = "button";
    btn.dataset.category = name;
    btn.setAttribute("aria-label", `Remove category ${name}`);
    li.append(btn);
    return li;
  }));
  els.catEmpty.hidden = categories.length > 0;
};

const showCategoryError = (message) => {
  els.catError.textContent = message;
  els.catError.hidden = !message;
};

const addCategory = () => {
  const name = els.catInput.value.trim().replace(/\s+/g, " ");
  if (!name) return showCategoryError("Enter a category name.");
  if (getCategories().some((c) => c.toLowerCase() === name.toLowerCase())) return showCategoryError("That category already exists.");
  if (categories.length >= MAX_CATEGORIES) return showCategoryError(`You can have up to ${MAX_CATEGORIES} categories.`);
  categories.push(name);
  saveCategories();
  showCategoryError("");
  els.catInput.value = "";
  renderCategorySelect(name);
  renderCategoryManager();
  render();
  showToast(`Category "${name}" added`);
};

const removeCategory = (name) => {
  const used = tasks.filter((t) => t.category === name).length;
  const note = used ? ` ${used} task(s) will be moved to "${FALLBACK_CATEGORY}".` : "";
  openConfirm(`Remove category "${name}"?${note}`, () => {
    categories = categories.filter((c) => c !== name);
    if (currentCategory === name) currentCategory = "";
    tasks.forEach((t) => {
      if (t.category === name) { t.category = FALLBACK_CATEGORY; t.updatedAt = Date.now(); }
    });
    const current = els.category.value === name ? FALLBACK_CATEGORY : els.category.value;
    saveCategories();
    renderCategorySelect(current);
    renderCategoryManager();
    commit();
    showToast(`Category "${name}" removed`);
  });
};

/* ========== TASK ACTIONS ========== */
// One subtask per line; keeps the done-state of lines that did not change
const parseSubtasks = (text, existing = []) =>
  text.split("\n").map((l) => l.trim().slice(0, 80)).filter(Boolean).slice(0, 20).map((line) => {
    const old = existing.find((x) => x.text === line);
    return { id: old ? old.id : makeId(), text: line, done: old ? old.done : false };
  });

const readForm = () => {
  const editing = tasks.find((t) => t.id === editingId);
  return {
    title: els.title.value.trim(),
    description: els.desc.value.trim(),
    priority: els.priority.value,
    category: els.category.value,
    dueDate: isValidDate(els.dueDate.value) ? els.dueDate.value : "",
    dueTime: els.dueTime.value,
    repeat: els.repeat.value,
    tags: normalizeTags(els.tags.value.split(",")),
    subtasks: parseSubtasks(els.subtasks.value, editing ? editing.subtasks : [])
  };
};

const addTask = (data) => {
  const now = Date.now();
  tasks.unshift({
    id: makeId(), completed: false, reminded: false, nextId: "", dueDate: "", dueTime: "", repeat: "none",
    description: "", subtasks: [], tags: [], createdAt: now, updatedAt: now, ...data
  });
  showToast("Task added ✅");
};

const updateTask = (id, data) => {
  const i = tasks.findIndex((t) => t.id === id);
  if (i === -1) return showToast("That task no longer exists.");
  const old = tasks[i];
  const sameTime = old.dueDate === data.dueDate && old.dueTime === data.dueTime;
  tasks[i] = { ...old, ...data, reminded: sameTime ? old.reminded : false, updatedAt: Date.now() };
  showToast("Task updated ✏️");
};

const toggleTask = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;
  const task = tasks[index];
  task.completed = !task.completed;
  task.updatedAt = Date.now();
  let repeated = false;
  if (task.completed && task.repeat !== "none" && !task.nextId) {
    // Repeating task: schedule the next occurrence right above this one
    const now = Date.now();
    const next = {
      ...task, id: makeId(), completed: false, reminded: false, nextId: "", createdAt: now, updatedAt: now,
      dueDate: nextDue(task.dueDate, task.repeat),
      subtasks: task.subtasks.map((x) => ({ ...x, done: false }))
    };
    task.nextId = next.id;
    tasks.splice(index, 0, next);
    repeated = true;
  } else if (!task.completed && task.nextId) {
    tasks = tasks.filter((t) => t.id !== task.nextId); // undo: remove the scheduled copy
    task.nextId = "";
  }
  commit();
  const msg = task.completed ? (repeated ? "Done – next repeat scheduled 🔁" : "Task completed 🎉") : "Task marked active";
  showToast(msg, task.completed ? () => toggleTask(id) : null);
};

const toggleSubtask = (taskId, subId, done) => {
  const task = tasks.find((t) => t.id === taskId);
  const sub = task && task.subtasks.find((x) => x.id === subId);
  if (!sub) return;
  sub.done = done;
  task.updatedAt = Date.now();
  commit();
};

// Puts removed items back at their original positions (entries must be sorted by index, ascending)
const restoreTasks = (entries) => {
  entries.forEach(({ task, index }) => {
    if (!tasks.some((t) => t.id === task.id)) tasks.splice(Math.min(index, tasks.length), 0, task);
  });
  commit();
};

const deleteTask = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;
  const [task] = tasks.splice(index, 1);
  if (editingId === id) resetForm();
  commit();
  showToast("Task deleted 🗑️", () => restoreTasks([{ task, index }]));
};

const clearCompleted = () => {
  const removed = tasks.map((task, index) => ({ task, index })).filter((e) => e.task.completed);
  if (!removed.length) return;
  tasks = tasks.filter((t) => !t.completed);
  if (editingId && removed.some((e) => e.task.id === editingId)) resetForm();
  commit();
  showToast(`${removed.length} completed task(s) cleared`, () => restoreTasks(removed));
};

const startEdit = (id) => {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  editingId = id;
  els.title.value = t.title;
  els.desc.value = t.description;
  els.priority.value = t.priority;
  renderCategorySelect(t.category);
  els.dueDate.value = t.dueDate;
  els.tags.value = t.tags.join(", ");
  els.dueTime.value = t.dueTime;
  els.repeat.value = t.repeat;
  els.subtasks.value = t.subtasks.map((x) => x.text).join("\n");
  els.titleError.hidden = true;
  els.title.removeAttribute("aria-invalid");
  els.formTitle.textContent = "Edit task";
  els.submitBtn.textContent = "Save Changes";
  els.cancelBtn.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  els.title.focus({ preventScroll: true });
};

function resetForm() {
  editingId = null;
  form.reset();
  renderCategorySelect(defaultCategory());
  els.titleError.hidden = true;
  els.title.removeAttribute("aria-invalid");
  els.formTitle.textContent = "Add a new task";
  els.submitBtn.textContent = "Add Task";
  els.cancelBtn.hidden = true;
}

/* ========== FILTER / SEARCH / SORT ========== */
const matchesFilter = (t, filter = currentFilter) => {
  const status = dueStatus(t);
  switch (filter) {
    case "active": return !t.completed;
    case "completed": return t.completed;
    case "today": return status === "today";
    case "upcoming": return status === "upcoming";
    case "overdue": return status === "overdue";
    case "high": return t.priority === "high" && !t.completed;
    default: return true;
  }
};

const matchesSearch = (t, q) => {
  if (!q) return true;
  return [t.title, t.description, t.category, ...t.tags].join(" ").toLowerCase().includes(q);
};

const SORTERS = {
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  due: (a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99"),
  priority: (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
  alpha: (a, b) => a.title.localeCompare(b.title),
  manual: () => 0 // keep the saved array order
};

const getVisibleTasks = () => {
  const q = els.search.value.trim().toLowerCase();
  const visible = tasks.filter((t) =>
    matchesFilter(t) && matchesSearch(t, q) &&
    (!currentCategory || t.category === currentCategory) && (!selectedDay || t.dueDate === selectedDay));
  return visible.sort(SORTERS[els.sort.value] || SORTERS.newest); // filter() already made a copy
};

/* ========== RENDER ========== */
const renderStats = () => {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("stTotal").textContent = total;
  $("stActive").textContent = total - done;
  $("stDone").textContent = done;
  $("stOver").textContent = tasks.filter((t) => dueStatus(t) === "overdue").length;
  $("stHigh").textContent = tasks.filter((t) => matchesFilter(t, "high")).length;
  $("progressText").textContent = `Completed ${done} of ${total} task${total === 1 ? "" : "s"}`;
  $("progressPct").textContent = `${pct}%`;
  $("barFill").style.width = `${pct}%`;
  els.clearDone.disabled = done === 0;
};

const renderFilters = () => {
  els.filters.replaceChildren(...FILTERS.map((f) => {
    const active = f.id === currentFilter;
    const btn = el("button", "chip" + (active ? " active" : ""), f.label);
    btn.type = "button";
    btn.dataset.filter = f.id;
    btn.setAttribute("aria-pressed", String(active));
    btn.append(el("em", "", tasks.filter((t) => matchesFilter(t, f.id)).length));
    return btn;
  }));
};

const DUE_INFO = {
  overdue: ["alert", "Overdue • "],
  today: ["clock", "Due today • "],
  upcoming: ["calendar", "Due "],
  done: ["check", "Was due "]
};

const REPEAT_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

const buildSubtasks = (t) => {
  const done = t.subtasks.filter((x) => x.done).length;
  const box = el("div", "subtasks");
  const head = el("div", "sub-head", `${done}/${t.subtasks.length}`);
  const bar = el("div", "sub-bar");
  const fill = el("i");
  fill.style.width = `${Math.round((done / t.subtasks.length) * 100)}%`;
  bar.append(fill);
  head.append(bar);
  box.append(head);
  t.subtasks.forEach((x) => {
    const row = el("label", "sub" + (x.done ? " done" : ""));
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = x.done;
    cb.dataset.sub = x.id;
    row.append(cb, el("span", "", x.text));
    box.append(row);
  });
  return box;
};

const buildTask = (t) => {
  const li = el("li", `task p-${t.priority}${t.completed ? " done" : ""}`);
  li.dataset.id = t.id;

  const check = el("button", "check", t.completed ? "✓" : "");
  check.type = "button";
  check.dataset.action = "toggle";
  check.setAttribute("aria-label", t.completed ? `Mark "${t.title}" as active` : `Mark "${t.title}" as completed`);

  const head = el("div", "task-head");
  const actions = el("div", "actions");
  if (els.sort.value === "manual") actions.append(iconButton("drag", "grip", "Reorder: drag, or use arrow keys", "drag"));
  actions.append(
    iconButton("edit", "pencil", `Edit "${t.title}"`),
    iconButton("delete", "trash", `Delete "${t.title}"`, "del")
  );
  head.append(el("div", "task-title", t.title), actions);

  const body = el("div", "task-body");
  body.append(head);
  if (t.description) body.append(el("div", "task-desc", t.description));

  const meta = el("div", "meta");
  meta.append(badge(t.priority, "flag", `${t.priority[0].toUpperCase()}${t.priority.slice(1)} priority`));
  meta.append(badge("", "folder", t.category));
  if (t.dueDate) {
    const status = dueStatus(t);
    const [iconName, label] = DUE_INFO[status];
    meta.append(badge(status, iconName, label + formatDate(t.dueDate) + (t.dueTime ? ` · ${t.dueTime}` : "")));
  }
  if (t.repeat !== "none") meta.append(badge("", "repeat", REPEAT_LABEL[t.repeat]));
  body.append(meta);

  if (t.subtasks.length) body.append(buildSubtasks(t));

  if (t.tags.length) {
    const tags = el("div", "tags");
    t.tags.forEach((tag) => tags.append(el("span", "tag", `#${tag}`)));
    body.append(tags);
  }

  li.append(check, body);
  return li;
};

const EMPTY_BY_FILTER = {
  active: ["check", "No active tasks", "You're all caught up!"],
  completed: ["inbox", "No completed tasks", "Finish a task and it will show up here."],
  overdue: ["check", "No overdue tasks", "Nothing is late. Great job!"],
  today: ["sun", "Nothing due today", "Enjoy your free day."],
  upcoming: ["calendar", "No upcoming tasks", "Add a due date to plan ahead."],
  high: ["flag", "No high priority tasks", "Everything urgent is handled."]
};

const renderEmpty = (visibleCount) => {
  els.empty.hidden = visibleCount > 0;
  if (visibleCount > 0) return;
  let info = ["list", "No tasks yet", "Add your first task above to get started."];
  if (tasks.length) {
    info = els.search.value.trim()
      ? ["search", "No matching tasks found", "Try a different search or filter."]
      : EMPTY_BY_FILTER[currentFilter] || ["list", "No tasks here", "Nothing to show."];
  }
  els.emptyIcon.replaceChildren(icon(info[0]));
  els.emptyTitle.textContent = info[1];
  els.emptyText.textContent = info[2];
};

const render = () => {
  const visible = getVisibleTasks();
  els.list.replaceChildren(...visible.map(buildTask));
  els.status.textContent = `${visible.length} task${visible.length === 1 ? "" : "s"} shown`;
  renderEmpty(visible.length);
  renderFilters();
  renderStats();
  renderSidebar();
  renderCalendar();
};

const commit = () => { saveTasks(); render(); checkReminders(); };

/* ========== TOAST & MODAL ========== */
function showToast(message, undoFn) {
  const toast = el("div", "toast");
  toast.append(el("span", "", message));
  if (undoFn) {
    const btn = el("button", "", "Undo");
    btn.type = "button";
    btn.addEventListener("click", () => { toast.remove(); undoFn(); });
    toast.append(btn);
  }
  els.toasts.append(toast);
  while (els.toasts.children.length > 3) els.toasts.firstChild.remove();
  setTimeout(() => toast.remove(), undoFn ? 6000 : 2500);
}

function openConfirm(text, action) {
  lastFocused = document.activeElement;
  els.modalText.textContent = text;
  confirmAction = action;
  els.modal.hidden = false;
  document.body.classList.add("modal-open");
  els.modalCancel.focus(); // safest default action
}

function closeConfirm() {
  els.modal.hidden = true;
  confirmAction = null;
  document.body.classList.remove("modal-open");
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  if (!lastFocused || document.activeElement !== lastFocused) els.search.focus(); // element gone or disabled
  lastFocused = null;
}

// Keep Tab / Shift+Tab inside the dialog and close with Escape
els.modal.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); closeConfirm(); return; }
  if (e.key !== "Tab") return;
  const [first, last] = [els.modalCancel, els.modalOk];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ========== THEME ========== */
const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  els.themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  els.themeBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
};

const initTheme = () => {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (err) { /* storage blocked */ }
  const preferDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved === "dark" || saved === "light" ? saved : preferDark ? "dark" : "light");
};

/* ========== DAY CHANGE ========== */
const renderDateLabel = () => {
  $("todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
};

// If the app stays open past midnight, "today"/"overdue" must be recalculated
const refreshIfDayChanged = () => {
  const day = todayStr();
  if (day === currentDay) return;
  currentDay = day;
  renderDateLabel();
  render();
};

/* ========== EVENTS ========== */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = readForm();
  if (!data.title) {
    els.titleError.hidden = false;
    els.title.setAttribute("aria-invalid", "true");
    els.title.focus();
    return;
  }
  if (data.dueTime) askNotifyPermission();
  if (editingId) updateTask(editingId, data);
  else addTask(data);
  resetForm();
  commit();
});

form.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editingId) { resetForm(); showToast("Edit cancelled"); }
});

els.title.addEventListener("input", () => {
  if (!els.title.value.trim()) return;
  els.titleError.hidden = true;
  els.title.removeAttribute("aria-invalid");
});

els.cancelBtn.addEventListener("click", resetForm);
els.search.addEventListener("input", render);
els.sort.addEventListener("change", render);

els.filters.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  render();
  els.filters.querySelector(`[data-filter="${currentFilter}"]`).focus(); // keep keyboard focus after re-render
});

els.list.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  const li = e.target.closest(".task");
  if (!btn || !li) return;
  const actions = { toggle: toggleTask, edit: startEdit, delete: deleteTask };
  const run = actions[btn.dataset.action];
  if (run) run(li.dataset.id);
});

els.clearDone.addEventListener("click", () => {
  const count = tasks.filter((t) => t.completed).length;
  if (count) openConfirm(`Permanently remove ${count} completed task(s)? You can undo right after.`, clearCompleted);
});

// Category manager (Enter must not submit the task form)
$("catAddBtn").addEventListener("click", addCategory);
els.catInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addCategory(); }
});
els.catInput.addEventListener("input", () => showCategoryError(""));
els.catList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-category]");
  if (btn) removeCategory(btn.dataset.category);
});

els.modalOk.addEventListener("click", () => {
  const action = confirmAction;
  closeConfirm();
  if (action) action();
});
els.modalCancel.addEventListener("click", closeConfirm);
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeConfirm(); });

els.themeBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* storage blocked */ }
});

document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshIfDayChanged(); });
setInterval(refreshIfDayChanged, 60000);

/* ========== SIDEBAR ========== */
function renderSidebar() {
  const items = [{ id: "", label: "All tasks", count: tasks.length, icon: "list" }].concat(
    getCategories().map((c) => ({ id: c, label: c, icon: "folder", count: tasks.filter((t) => t.category === c).length }))
  );
  els.sideNav.replaceChildren(...items.map((i) => {
    const active = i.id === currentCategory;
    const btn = el("button", "side-item" + (active ? " active" : ""));
    btn.type = "button";
    btn.dataset.cat = i.id;
    btn.setAttribute("aria-pressed", String(active));
    btn.append(icon(i.icon), el("span", "", i.label), el("em", "", i.count));
    return btn;
  }));
}

els.sideNav.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  currentCategory = btn.dataset.cat;
  render();
});

/* ========== CALENDAR VIEW ========== */
function renderCalendar() {
  els.calendar.hidden = !calOpen;
  els.calToggle.setAttribute("aria-pressed", String(calOpen));
  if (!calOpen) return;
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  $("calTitle").textContent = calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const counts = {};
  tasks.forEach((t) => { if (t.dueDate && !t.completed) counts[t.dueDate] = (counts[t.dueDate] || 0) + 1; });
  const cells = ["S", "M", "T", "W", "T", "F", "S"].map((d) => el("div", "cal-dow", d));
  for (let i = 0; i < new Date(y, m, 1).getDay(); i++) cells.push(el("div"));
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const btn = el("button", "cal-day" + (key === todayStr() ? " today" : "") + (key === selectedDay ? " selected" : ""), String(d));
    btn.type = "button";
    btn.dataset.day = key;
    btn.setAttribute("aria-pressed", String(key === selectedDay));
    btn.setAttribute("aria-label", `${formatDate(key)}, ${counts[key] || 0} open tasks`);
    if (counts[key]) btn.append(el("small", "", counts[key]));
    cells.push(btn);
  }
  els.calGrid.replaceChildren(...cells);
  els.calNote.textContent = selectedDay ? `Showing tasks due ${formatDate(selectedDay)}. Tap the day again to clear.` : "Tap a day to see its tasks.";
}

els.calToggle.addEventListener("click", () => {
  calOpen = !calOpen;
  if (!calOpen) selectedDay = "";
  render();
});
$("calPrev").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
$("calNext").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });
els.calGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-day]");
  if (!btn) return;
  selectedDay = selectedDay === btn.dataset.day ? "" : btn.dataset.day;
  render();
});

/* ========== QUICK ADD ========== */
// "Buy milk tomorrow 5pm !high #home @Shopping every week"
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const parseQuick = (input) => {
  const out = { priority: "medium", tags: [], dueDate: "", dueTime: "", repeat: "none", category: defaultCategory() };
  let text = ` ${input} `;
  const take = (re, fn) => { text = text.replace(re, (...m) => { fn(...m); return " "; }); };

  take(/\s!(high|medium|low|h|m|l)(?=\s)/i, (_, p) => { out.priority = { h: "high", m: "medium", l: "low" }[p[0].toLowerCase()]; });
  take(/\s#([\w-]+)/g, (_, tag) => out.tags.push(tag));
  take(/\s@([\w-]+)/, (m, name) => {
    const found = getCategories().find((c) => c.toLowerCase() === name.toLowerCase());
    if (found) out.category = found;
  });
  take(/\severy (day|week|month)(?=\s)/i, (_, unit) => { out.repeat = { day: "daily", week: "weekly", month: "monthly" }[unit.toLowerCase()]; });
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (_, h, min, ap) => {
    let hour = Number(h) % 12;
    if (ap.toLowerCase() === "pm") hour += 12;
    out.dueTime = `${pad(hour)}:${min || "00"}`;
  });
  take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/i, (_, h, min) => { out.dueTime = `${pad(Number(h))}:${min}`; });

  const today = todayStr();
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (_, d) => { if (isValidDate(d)) out.dueDate = d; });
  take(/\stoday(?=\s)/i, () => { out.dueDate = today; });
  take(/\stomorrow(?=\s)/i, () => { out.dueDate = addDays(today, 1); });
  take(/\snext week(?=\s)/i, () => { out.dueDate = addDays(today, 7); });
  take(/\sin (\d{1,3}) days?(?=\s)/i, (_, n) => { out.dueDate = addDays(today, Number(n)); });
  take(/\s(?:on\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*(?=\s)/i, (m, day) => {
    const ahead = (WEEKDAYS.indexOf(day.toLowerCase()) - new Date().getDay() + 7) % 7 || 7;
    out.dueDate = addDays(today, ahead);
  });

  if (out.repeat !== "none" && !out.dueDate) out.dueDate = today;
  out.title = text.replace(/\s+/g, " ").trim().slice(0, 80);
  out.tags = normalizeTags(out.tags);
  return out.title ? out : null;
};

els.quickForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const parsed = parseQuick(els.quick.value);
  if (!parsed) { showToast("Type a task first, e.g. Call Ali tomorrow !high"); els.quick.focus(); return; }
  if (parsed.dueTime) askNotifyPermission();
  addTask(parsed);
  els.quick.value = "";
  commit();
});

/* ========== SUBTASKS (checkbox changes) ========== */
els.list.addEventListener("change", (e) => {
  const cb = e.target.closest("[data-sub]");
  const li = e.target.closest(".task");
  if (cb && li) toggleSubtask(li.dataset.id, cb.dataset.sub, cb.checked);
});

/* ========== DRAG & DROP REORDER (mouse, touch and keyboard) ========== */
let dragEl = null;

const reorderTasks = (visibleIds) => {
  const slots = visibleIds.map((id) => tasks.findIndex((t) => t.id === id)).filter((i) => i > -1).sort((a, b) => a - b);
  const ordered = visibleIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
  slots.forEach((slot, i) => { tasks[slot] = ordered[i]; });
  commit();
};

els.list.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest(".drag");
  if (!handle) return;
  dragEl = handle.closest(".task");
  dragEl.classList.add("dragging");
  handle.setPointerCapture(e.pointerId);
});

els.list.addEventListener("pointermove", (e) => {
  if (!dragEl) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const over = target && target.closest ? target.closest(".task") : null;
  if (!over || over === dragEl || over.parentNode !== els.list) return;
  const box = over.getBoundingClientRect();
  els.list.insertBefore(dragEl, e.clientY < box.top + box.height / 2 ? over : over.nextSibling);
});

const endDrag = () => {
  if (!dragEl) return;
  dragEl.classList.remove("dragging");
  dragEl = null;
  reorderTasks([...els.list.children].map((li) => li.dataset.id));
};
els.list.addEventListener("pointerup", endDrag);
els.list.addEventListener("pointercancel", endDrag);

els.list.addEventListener("keydown", (e) => {
  const handle = e.target.closest(".drag");
  if (!handle || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault();
  const li = handle.closest(".task");
  const ids = [...els.list.children].map((x) => x.dataset.id);
  const from = ids.indexOf(li.dataset.id);
  const to = from + (e.key === "ArrowUp" ? -1 : 1);
  if (to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  reorderTasks(ids);
  const moved = els.list.querySelector(`[data-id="${li.dataset.id}"] .drag`);
  if (moved) moved.focus();
});

/* ========== REMINDERS (work while the app is open) ========== */
function askNotifyPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  } catch (err) { /* not supported */ }
}

const checkReminders = () => {
  const now = new Date();
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const today = todayStr();
  let changed = false;
  tasks.forEach((t) => {
    if (t.completed || t.reminded || !t.dueTime || t.dueDate !== today || t.dueTime > hm) return;
    t.reminded = true;
    changed = true;
    showToast(`⏰ Reminder: ${t.title}`);
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification("TaskFlow reminder", { body: t.title });
    } catch (err) { /* ignore */ }
  });
  if (changed) saveTasks();
};

/* ========== INIT ========== */
const init = () => {
  currentDay = todayStr();
  renderDateLabel();
  initTheme();
  categories = loadCategories();
  tasks = loadTasks();
  // Any category found in saved tasks but missing from the list is added back
  tasks.forEach((t) => {
    if (!getCategories().includes(t.category) && categories.length < MAX_CATEGORIES) categories.push(t.category);
    if (!getCategories().includes(t.category)) t.category = FALLBACK_CATEGORY;
  });
  renderCategorySelect(defaultCategory());
  renderCategoryManager();
  render();
  checkReminders();
  setInterval(checkReminders, 30000);
};
init();
