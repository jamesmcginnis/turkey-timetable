/**
 * turkey-timetable-card
 *
 * iOS-styled weekly lesson timetable for Home Assistant. The card owns all
 * lesson/setting data (persisted via frontend/set_user_data so it follows
 * the user across browsers), and pushes every change to the
 * `turkey_timetable` integration via the `turkey_timetable.update_schedule`
 * service so calendar triggers / automations stay in sync.
 */

const STORAGE_KEY = "turkey_timetable_data";

const WEEKDAYS = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
  { key: "sunday", label: "Sunday", short: "Sun" },
];

// Must mirror custom_components/turkey_timetable/const.py COLOR_PALETTE.
const COLOR_PALETTE = [
  { key: "red", hex: "#FF3B30" },
  { key: "orange", hex: "#FF9500" },
  { key: "yellow", hex: "#FFCC00" },
  { key: "green", hex: "#34C759" },
  { key: "teal", hex: "#30B0C7" },
  { key: "blue", hex: "#007AFF" },
  { key: "indigo", hex: "#5856D6" },
  { key: "purple", hex: "#AF52DE" },
  { key: "pink", hex: "#FF2D55" },
  { key: "brown", hex: "#A2845E" },
  { key: "gray", hex: "#8E8E93" },
];

const DEFAULT_SETTINGS = {
  notifications_enabled: true,
  notification_lead_minutes: 15,
};

function colorHex(key) {
  return (COLOR_PALETTE.find((c) => c.key === key) || COLOR_PALETTE[5]).hex;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function todayKey() {
  return WEEKDAYS[(new Date().getDay() + 6) % 7].key; // Mon=0..Sun=6
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440; // wrap around midnight
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function currentTimeHHMM() {
  const now = new Date();
  return minutesToHHMM(now.getHours() * 60 + now.getMinutes());
}

function attachmentLabel(att) {
  if (att.name) return att.name;
  try {
    const u = new URL(att.url);
    const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    return seg || u.hostname || att.url;
  } catch (e) {
    return att.url || "Attachment";
  }
}

const DEFAULT_CARD_CONFIG = {
  max_list_height: 340,
  ai_features_enabled: false,
  ai_conversation_agent: "",
  ai_enable_ask: true,
  ai_enable_quick_add: true,
  ai_enable_weekly_overview: true,
  ai_enable_fun_fact: true,
  ai_enable_resources: true,
  ai_enable_practice_resources: true,
  exam_board: "",
  year_group: "",
  card_style: "classic",
  appearance: "auto",
  glass: 50,
};

const YEAR_GROUP_OPTIONS = [
  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13",
];

const EXAM_BOARD_LABELS = {
  aqa: "AQA",
  edexcel: "Edexcel (Pearson)",
  ocr: "OCR",
  wjec: "WJEC / Eduqas",
  ccea: "CCEA",
  sqa: "SQA (Scotland)",
};

// Level/qualification keywords that trigger the Lesson Resources section.
// Deliberately UK-focused, matching the exam board picker.
const EXAM_LEVEL_PATTERN = /\b(gcse|a[- ]?level|as[- ]?level|ks[1-4]|key stage [1-4]|sats?|11\+|btec|ib|international baccalaureate|national 5|nat 5|higher(?:s)?)\b/i;

// Curated, stable resource links - never AI-generated. Models are unreliable
// at producing real URLs (they invent plausible-looking ones that 404), so
// the actual clickable links are a small hand-picked set; the AI only ever
// writes the descriptive text around them. Deliberately limited to sites
// that are genuinely free with no account/sign-up required to view content -
// verified directly rather than assumed, since several well-known "free"
// revision sites (Seneca Learning, Save My Exams) actually require signing
// up, or meter free access behind a paywall after a handful of pages.
const CURATED_RESOURCES = [
  { name: "BBC Bitesize", url: "https://www.bbc.co.uk/bitesize" },
  { name: "Oak National Academy", url: "https://www.thenational.academy/pupils/years" },
  { name: "Physics & Maths Tutor", url: "https://www.physicsandmathstutor.com" },
];

// Practice Resources is deliberately a different curated set from Resources
// above - both share the same free/no-signup requirement, but this list
// leans toward sites with actual practice quizzes (BBC Bitesize includes
// topic quizzes; Oak National Academy includes worksheets), plus
// subject-specific additions layered on when the subject matches.
const PRACTICE_RESOURCES_BASE = [
  { name: "BBC Bitesize", url: "https://www.bbc.co.uk/bitesize" },
  { name: "Oak National Academy", url: "https://www.thenational.academy/pupils/years" },
];
const PRACTICE_RESOURCES_SUBJECT = [
  { match: /\bmath/i, name: "Corbettmaths", url: "https://corbettmaths.com" },
  { match: /\b(physic|chemistr|biolog|science)/i, name: "Physics & Maths Tutor", url: "https://www.physicsandmathstutor.com" },
];
function practiceResourcesFor(subject) {
  const list = [...PRACTICE_RESOURCES_BASE];
  PRACTICE_RESOURCES_SUBJECT.forEach((r) => {
    if (r.match.test(subject || "")) list.push({ name: r.name, url: r.url });
  });
  return list;
}

// ═══════════════════════════════════════════════════════════════════
//  COLOUR TOOLS — keeps any picked colour legible in light AND dark mode
// ═══════════════════════════════════════════════════════════════════

function _hex2rgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _rgb2hex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}
function _rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function _hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return _rgb2hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
function _lum(hex) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = _hex2rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function _contrast(a, b) {
  const la = _lum(a), lb = _lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function isHex(v) { return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()); }
function hexA(hex, a) {
  const [r, g, b] = _hex2rgb(hex);
  return `rgba(${r},${g},${b},${Math.round(a * 100) / 100})`;
}

// Approximate surfaces the card sits on (glass over a typical HA dashboard).
const CC_SURFACE = { dark: '#34343a', light: '#f6f6f9' };

// Nudge lightness (keeping hue + saturation) until `min` contrast is met.
function _ensure(h, s, l, bg, min, dir) {
  let hex = _hsl2hex(h, s, l);
  for (let i = 0; i < 60 && _contrast(hex, bg) < min; i++) {
    l = Math.min(0.97, Math.max(0.03, l + dir * 0.015));
    hex = _hsl2hex(h, s, l);
  }
  return hex;
}

const _tuneCache = {};
// One picked colour → { c1, c2, dot, text } that reads in this mode.
//   dot  : icons / graphics (≥3:1 on the surface)
//   text : status text (≥4.5:1 on the surface)
function tuneColor(base, dark) {
  const key = `${base}|${dark}`;
  if (_tuneCache[key]) return _tuneCache[key];
  const [h, s, l0] = _rgb2hsl(..._hex2rgb(base));
  const bg = dark ? CC_SURFACE.dark : CC_SURFACE.light;
  let out;
  if (dark) {
    const l = Math.min(0.72, Math.max(0.52, l0));
    out = {
      c1:  _ensure(h, s, Math.min(0.86, l + 0.10), bg, 3, +1),
      c2:  _ensure(h, s, l - 0.06, bg, 3, +1),
      dot: _ensure(h, s, l, bg, 3, +1),
      text: _ensure(h, s, Math.min(0.85, l + 0.12), bg, 4.5, +1),
    };
  } else {
    const l = Math.min(0.56, Math.max(0.36, l0));
    out = {
      c1:  _ensure(h, s, Math.min(0.66, l + 0.10), bg, 2.4, -1),
      c2:  _ensure(h, s, l - 0.08, bg, 3.2, -1),
      dot: _ensure(h, s, l, bg, 3, -1),
      text: _ensure(h, s, Math.min(l, 0.34), bg, 4.5, -1),
    };
  }
  return (_tuneCache[key] = out);
}



// One tap sets the three interface colours (lesson colours are separate and unchanged)
const TT_PRESET_KEYS = ['accent_color', 'delete_color', 'switch_color'];
const TT_DEFAULTS = { accent_color: '#0a84ff', delete_color: '#ff3b30', switch_color: '#34c759' };
const TT_PRESETS = [
  { id: 'classic',  name: 'Classic',  colors: { accent_color: '#0A84FF', delete_color: '#FF3B30', switch_color: '#34C759' } },
  { id: 'ocean',    name: 'Ocean',    colors: { accent_color: '#30B0C7', delete_color: '#FF6482', switch_color: '#30D5C8' } },
  { id: 'berry',    name: 'Berry',    colors: { accent_color: '#BF5AF2', delete_color: '#FF375F', switch_color: '#BF5AF2' } },
  { id: 'graphite', name: 'Graphite', colors: { accent_color: '#8FA3BF', delete_color: '#FF6B5E', switch_color: '#8FB996' } },
];

// A colour that can sit behind a white label / knob (≥3.2:1)
function accentFill(base) {
  if (_contrast(base, '#ffffff') >= 3.2) return base;
  let [h, s, l] = _rgb2hsl(..._hex2rgb(base));
  let hex = _hsl2hex(h, s, l);
  for (let i = 0; i < 60 && _contrast(hex, '#ffffff') < 3.2; i++) { l = Math.max(0.05, l - 0.015); hex = _hsl2hex(h, s, l); }
  return hex;
}


const CC_FONT = "ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";


class TurkeyTimetableCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static getConfigElement() {
    return document.createElement("turkey-timetable-card-editor");
  }

  setConfig(config) {
    this._config = { ...DEFAULT_CARD_CONFIG, ...(config || {}) };
    this._aiAvailable = undefined; // invalidate on config change (e.g. agent switched)
    if (this.shadowRoot && this._data) this._render();   // editor changes (style, theme, colours…) show straight away
  }

  getCardSize() {
    return 6;
  }

  set hass(hass) {
    const firstRun = !this._hass;
    this._hass = hass;
    if (firstRun) {
      this._selectedDay = todayKey();
      this._data = null;
      this._modal = null;
      this._searchQuery = "";
      this._showAllLessons = false;
      this._loadData();
    } else if (this._data && this._renderedSig !== undefined && this._renderedSig !== this._themeSig()) {
      this._render();   // the Home Assistant theme changed (Glass + Auto)
    }
  }

  async _loadData() {
    // The integration's own storage is genuinely shared across every HA
    // user and device - frontend/get_user_data is scoped to whichever HA
    // account is logged in, so two people with separate accounts (or the
    // same person on two devices logged in differently) would otherwise
    // each see their own private copy. Try the shared store first.
    let integrationData = null;
    try {
      const wsResult = await this._hass.connection.sendMessagePromise({
        type: "turkey_timetable/get_schedule",
      });
      if (wsResult && Array.isArray(wsResult.lessons)) {
        integrationData = {
          lessons: wsResult.lessons,
          settings: { ...DEFAULT_SETTINGS, ...(wsResult.settings || {}) },
        };
      }
    } catch (err) {
      // Integration not installed, or this HA version doesn't have the
      // command registered yet (e.g. mid-restart) - fall back below.
    }

    let localData = null;
    try {
      const result = await this._hass.callWS({
        type: "frontend/get_user_data",
        key: STORAGE_KEY,
      });
      localData = (result && result.value) || null;
    } catch (err) {
      localData = null;
    }

    let needsMigrationPush = false;
    if (integrationData && integrationData.lessons.length > 0) {
      // The shared store already has real data - that's authoritative now.
      this._data = integrationData;
    } else if (localData && localData.lessons && localData.lessons.length > 0) {
      // Shared store is empty but this device/user already has real data -
      // not yet migrated. Use it, then push it to the shared store below
      // so every other user/device picks it up from here on, rather than
      // silently discarding it because the shared copy happened to be empty.
      this._data = localData;
      needsMigrationPush = true;
    } else if (integrationData) {
      this._data = integrationData;
    } else {
      this._data = localData || this._seedData();
    }

    if (!this._data.settings) this._data.settings = { ...DEFAULT_SETTINGS };
    if (!this._data.lessons) this._data.lessons = [];

    // One-time cleanup: strip the retired week-rotation fields from any
    // previously saved data so they don't linger indefinitely.
    let cleaned = false;
    if ("number_of_weeks" in this._data.settings) {
      delete this._data.settings.number_of_weeks;
      cleaned = true;
    }
    if ("weekend_days" in this._data.settings) {
      delete this._data.settings.weekend_days;
      cleaned = true;
    }
    this._data.lessons.forEach((lesson) => {
      if ("week" in lesson) {
        delete lesson.week;
        cleaned = true;
      }
      if ("reminder_minutes" in lesson) {
        delete lesson.reminder_minutes;
        cleaned = true;
      }
    });

    // Restore whatever view (day tab, open modal) the user was on before
    // - if they tapped a link to somewhere outside the app and the HA
    // frontend tore down and rebuilt this card while they were away (e.g.
    // the app backgrounding, or the OS reclaiming memory), it would
    // otherwise silently reset to today's tab with nothing open.
    this._restoreUiState();

    this._render();
    if (cleaned || needsMigrationPush) this._persist();
  }

  _seedData() {
    return {
      settings: { ...DEFAULT_SETTINGS },
      lessons: [],
    };
  }

  // --- View-state persistence -------------------------------------------
  // Only the card's own instance memory tracks which day tab or modal is
  // open - if the HA frontend tears down and rebuilds this custom element
  // (backgrounding the app, the OS reclaiming memory, or just switching
  // dashboard tabs and back) that state is lost and the card resets to
  // today with nothing open, even though nothing about the underlying
  // data changed. Persisting a lightweight snapshot to localStorage (not
  // sessionStorage, since a full app relaunch after backgrounding should
  // still restore it, not just a same-session return) fixes that.

  _saveUiState() {
    try {
      localStorage.setItem(
        "tt_ui_state",
        JSON.stringify({
          savedAt: Date.now(),
          selectedDay: this._selectedDay,
          searchQuery: this._searchQuery || "",
          showAllLessons: !!this._showAllLessons,
          modal: this._serializeModalForRestore(this._modal),
        })
      );
    } catch (err) {
      // localStorage unavailable (private browsing, quota, etc.) - the
      // card still works fine, it just won't restore the view next time.
    }
  }

  // Only modal types that are either stateless or reference a lesson by id
  // are worth restoring - transient AI answers, loading flags, and
  // in-progress unsaved edits on a brand new lesson aren't safely
  // reconstructable, so those are deliberately dropped rather than
  // restored half-correctly.
  _serializeModalForRestore(modal) {
    if (!modal) return null;
    if (modal.type === "view" && modal.lesson) {
      return { type: "view", lessonId: modal.lesson.id };
    }
    if (modal.type === "lesson" && !modal.isNew && modal.lesson) {
      return { type: "lesson", lessonId: modal.lesson.id };
    }
    if (["settings", "data-settings", "export-choice", "weekly", "ask"].includes(modal.type)) {
      return { type: modal.type };
    }
    return null;
  }

  _restoreUiState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("tt_ui_state") || "null");
    } catch (err) {
      saved = null;
    }
    if (!saved) return;

    // Don't resurrect a view from a genuinely old session - this is for
    // "tapped a link and came back", not "opened the app again three days
    // later and landed back in some random lesson's editor".
    if (!saved.savedAt || Date.now() - saved.savedAt > 4 * 3600 * 1000) return;

    if (saved.selectedDay && WEEKDAYS.some((d) => d.key === saved.selectedDay)) {
      this._selectedDay = saved.selectedDay;
    }
    this._searchQuery = saved.searchQuery || "";
    this._showAllLessons = !!saved.showAllLessons;

    if (saved.modal) {
      if (saved.modal.type === "view" || saved.modal.type === "lesson") {
        const lesson = this._data.lessons.find((l) => l.id === saved.modal.lessonId);
        if (lesson) {
          this._modal =
            saved.modal.type === "view"
              ? { type: "view", lesson }
              : {
                  type: "lesson",
                  isNew: false,
                  lesson: {
                    ...lesson,
                    attachments: [...(lesson.attachments || [])],
                    links: [...(lesson.links || [])],
                    online_lessons: [...(lesson.online_lessons || [])],
                  },
                };
        }
      } else {
        this._modal = { type: saved.modal.type };
      }
    }
  }

  _blankLesson(overrides = {}) {
    const start = currentTimeHHMM();
    return {
      id: uid(),
      day: this._selectedDay,
      start_time: start,
      end_time: minutesToHHMM(toMinutes(start) + 60),
      subject: "",
      tutor: "",
      location: "",
      color: "blue",
      link: "",
      meeting_id: "",
      passcode: "",
      notes: "",
      attachments: [],
      links: [],
      online_lessons: [],
      ...overrides,
    };
  }

  // --- AI helpers (shared by Ask, Quick Add, Weekly Overview, Fun Fact,
  // Resources) - same conversation/process pattern as the CrowAI and
  // DolphinAI cards. Every feature here is descriptive/informational only.

  _aiEnabled() {
    return !!(this._config?.ai_features_enabled && this._hass);
  }

  async _aiConverse(prompt) {
    if (!this._aiEnabled()) return null;
    const agentId = this._config.ai_conversation_agent || "conversation.home_assistant";
    try {
      const resp = await this._hass.connection.sendMessagePromise({
        type: "conversation/process",
        text: prompt,
        agent_id: agentId,
        language: navigator.language || "en",
      });
      if (resp?.response?.response_type === "error") return null;
      return resp?.response?.speech?.plain?.speech || null;
    } catch (err) {
      return null;
    }
  }

  async _aiCheckAvailable() {
    if (!this._aiEnabled()) return false;
    if (this._aiAvailable !== undefined) return this._aiAvailable;
    try {
      const agents = await this._hass.connection.sendMessagePromise({ type: "conversation/agent/list" });
      const ids = (agents?.agents || []).map((a) => a.id);
      const agentId = this._config.ai_conversation_agent || "conversation.home_assistant";
      this._aiAvailable = ids.includes(agentId);
    } catch (err) {
      this._aiAvailable = false;
    }
    return this._aiAvailable;
  }

  // Strips markdown fences and pulls out the first {...} block - used by
  // Quick Add, which asks the agent to reply with structured JSON.
  _aiExtractJson(raw) {
    if (!raw) return null;
    const stripped = raw.split("```json").join("").split("```").join("");
    const i1 = stripped.indexOf("{");
    const i2 = stripped.lastIndexOf("}");
    if (i1 === -1 || i2 <= i1) return null;
    try {
      return JSON.parse(stripped.slice(i1, i2 + 1));
    } catch (err) {
      return null;
    }
  }

  _scheduleSummaryText() {
    const lines = this._data.lessons
      .slice()
      .sort((a, b) => {
        const dayDiff = WEEKDAYS.findIndex((d) => d.key === a.day) - WEEKDAYS.findIndex((d) => d.key === b.day);
        return dayDiff !== 0 ? dayDiff : toMinutes(a.start_time) - toMinutes(b.start_time);
      })
      .map((l) => {
        const dayLabel = (WEEKDAYS.find((d) => d.key === l.day) || {}).label || l.day;
        return `${dayLabel} ${l.start_time}-${l.end_time}: ${l.subject}${l.tutor ? ` with ${l.tutor}` : ""}`;
      });
    return lines.length ? lines.join("\n") : "No lessons currently scheduled.";
  }

  // device-local cache for Fun Fact / Resources - trivia about "Maths"
  // doesn't change day to day, so these are cached for a few days rather
  // than re-fetched every time a lesson is opened.
  _aiLocalGet(cacheName, key, ttlMs = 3 * 24 * 3600 * 1000) {
    try {
      const store = JSON.parse(localStorage.getItem("tt_ai_" + cacheName) || "{}");
      const entry = store[key];
      if (!entry) return null;
      if (Date.now() - entry.ts > ttlMs) return null;
      return entry.data;
    } catch (err) {
      return null;
    }
  }

  _aiLocalSet(cacheName, key, value) {
    try {
      const store = JSON.parse(localStorage.getItem("tt_ai_" + cacheName) || "{}");
      const keys = Object.keys(store);
      if (keys.length >= 60) {
        keys
          .sort((a, b) => (store[a].ts || 0) - (store[b].ts || 0))
          .slice(0, 15)
          .forEach((k) => delete store[k]);
      }
      store[key] = { data: value, ts: Date.now() };
      localStorage.setItem("tt_ai_" + cacheName, JSON.stringify(store));
    } catch (err) {
      // Non-fatal - the feature just re-fetches next time.
    }
  }

  async _persist() {
    try {
      await this._hass.callWS({
        type: "frontend/set_user_data",
        key: STORAGE_KEY,
        value: this._data,
      });
    } catch (err) {
      // Non-fatal - local render still has the latest data.
    }

    // Skip quietly if the integration isn't loaded, rather than firing a
    // service call HA is guaranteed to reject (which shows its own toast
    // regardless of whether we catch the rejection here).
    const serviceExists = !!this._hass.services?.turkey_timetable?.update_schedule;
    if (!serviceExists) return;

    try {
      await this._hass.callService("turkey_timetable", "update_schedule", {
        lessons: this._data.lessons,
        settings: this._data.settings,
      });
    } catch (err) {
      // Non-fatal - local render still has the latest data.
    }
  }

  // --- Derived state -----------------------------------------------------

  _nextLessonGlobal() {
    const now = new Date();
    const nowDay = (now.getDay() + 6) % 7;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let best = null;
    let bestOffset = Infinity;

    for (const lesson of this._data.lessons) {
      const dayIndex = WEEKDAYS.findIndex((d) => d.key === lesson.day);
      if (dayIndex === -1) continue;
      let dayOffset = dayIndex - nowDay;
      if (dayOffset < 0 || (dayOffset === 0 && toMinutes(lesson.start_time) < nowMinutes)) {
        dayOffset += 7;
      }
      const totalOffset = dayOffset * 1440 + toMinutes(lesson.start_time);
      const nowOffset = nowMinutes;
      const relativeOffset = dayOffset === 0 ? totalOffset - nowOffset : totalOffset - nowOffset;
      if (relativeOffset < bestOffset) {
        bestOffset = relativeOffset;
        best = lesson;
      }
    }
    return best;
  }

  // --- Rendering -----------------------------------------------------------

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._data) return;
    this._renderedSig = this._themeSig();
    this.setAttribute("data-style", this._glassOn() ? "glass" : "classic");
    this.setAttribute("data-theme", this._isDark() ? "dark" : "light");

    const visibleDays = WEEKDAYS;

    const nextLesson = this._nextLessonGlobal();
    const query = (this._searchQuery || "").trim().toLowerCase();

    let listLessons;
    let showDayOnRow = false;
    let headerHtml;

    if (query || this._showAllLessons) {
      listLessons = this._data.lessons
        .filter((l) => !query || l.subject.toLowerCase().includes(query) || (l.tutor || "").toLowerCase().includes(query))
        .sort((a, b) => {
          const dayDiff = WEEKDAYS.findIndex((d) => d.key === a.day) - WEEKDAYS.findIndex((d) => d.key === b.day);
          return dayDiff !== 0 ? dayDiff : toMinutes(a.start_time) - toMinutes(b.start_time);
        });
      showDayOnRow = true;
      const count = listLessons.length;
      headerHtml = query
        ? `<div class="search-results-label">${count} result${count === 1 ? "" : "s"} for &ldquo;${this._escape(this._searchQuery.trim())}&rdquo;</div>`
        : `<div class="search-results-label">All Lessons \u00b7 ${count}</div>`;
    } else {
      listLessons = this._data.lessons
        .filter((l) => l.day === this._selectedDay)
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
      headerHtml = `
        <div class="tabs">
          ${visibleDays
            .map(
              (d) => `
            <button class="tab ${d.key === this._selectedDay ? "active" : ""}" data-day="${d.key}">
              ${d.short}
            </button>`
            )
            .join("")}
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="card">
        <div class="topbar">
          <button class="icon-btn" id="settings-btn" aria-label="Settings">${this._icon("settings")}</button>
          <div class="topbar-right">
            ${
              this._aiEnabled() && this._config.ai_enable_ask !== false
                ? `<button class="icon-btn" id="ai-ask-btn" aria-label="Ask Your Timetable" title="Ask Your Timetable">${this._aiIcon(19)}</button>`
                : ""
            }
            <button class="icon-btn" id="add-btn" aria-label="Add lesson">${this._icon("plus")}</button>
          </div>
        </div>
        <div class="search-bar">
          <span class="search-icon">${this._icon("search")}</span>
          <input type="text" id="search-input" class="search-input" placeholder="Search subject or tutor..." value="${this._escapeAttr(this._searchQuery || "")}">
          <button class="icon-btn search-clear-btn" id="clear-search-btn" title="Clear" style="display:${query || this._showAllLessons ? "flex" : "none"}">${this._icon("close")}</button>
        </div>
        ${headerHtml}
        <div class="lesson-list scroll-region">
          ${
            listLessons.length
              ? listLessons
                  .map((lesson) => this._lessonRow(lesson, nextLesson && nextLesson.id === lesson.id, showDayOnRow))
                  .join("")
              : `<div class="empty">${query ? "No lessons match your search." : "No lessons yet. Tap + to add one."}</div>`
          }
        </div>
      </div>
      ${this._modal ? this._renderModal() : ""}
    `;

    this._attachListeners();
    this._saveUiState();
  }

  _lessonRow(lesson, isNext, showDay = false) {
    const hasLink = !!lesson.link;
    const hasExtra =
      (lesson.online_lessons && lesson.online_lessons.length > 0) ||
      !!lesson.notes ||
      !!lesson.location ||
      (lesson.attachments && lesson.attachments.length > 0) ||
      (lesson.links && lesson.links.length > 0);
    const hasMeta = hasLink || hasExtra;
    const dayShort = showDay ? (WEEKDAYS.find((d) => d.key === lesson.day) || {}).short : null;
    return `
      <div class="lesson-row" data-id="${lesson.id}">
        <div class="lesson-swipe-content" style="background:${colorHex(lesson.color)}">
          <div class="lesson-time">${dayShort ? `${dayShort} ` : ""}${lesson.start_time}</div>
          <div class="lesson-title">${this._escape(lesson.subject)}${lesson.tutor ? ` - ${this._escape(lesson.tutor)}` : ""}</div>
          ${
            hasMeta
              ? `<div class="lesson-meta">
                  ${hasExtra ? this._icon("moreInfo") : ""}
                  ${hasLink ? this._icon("videoCamera") : ""}
                </div>`
              : ""
          }
          ${isNext ? `<div class="next-pill">Next</div>` : ""}
        </div>
        <button class="lesson-delete-btn" title="Delete">${this._icon("trash")}</button>
      </div>
    `;
  }

  _optionsHtml(values, current, unit) {
    const opts = [...values];
    if (!opts.includes(current)) opts.push(current);
    opts.sort((a, b) => a - b);
    return opts
      .map(
        (v) =>
          `<option value="${v}" ${v === current ? "selected" : ""}>${v} ${unit}${v === 1 ? "" : "s"}</option>`
      )
      .join("");
  }

  _renderModal() {
    if (this._modal.type === "settings") return this._settingsModal();
    if (this._modal.type === "data-settings") return this._dataSettingsModal();
    if (this._modal.type === "view") return this._viewModal();
    if (this._modal.type === "lesson") return this._lessonModal();
    if (this._modal.type === "ask") return this._askModal();
    if (this._modal.type === "weekly") return this._weeklyOverviewModal();
    if (this._modal.type === "ai-menu") return this._aiMenuModal();
    if (this._modal.type === "export-choice") return this._exportChoiceModal();
    if (this._modal.type === "restore-preview") return this._restorePreviewModal();
    return "";
  }

  _exportChoiceModal() {
    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="close-modal">Close</button>
            <span>Export Timetable</span>
            <span></span>
          </div>
          <div class="sheet-group">
            <button class="row action-row" id="export-list-btn">List View</button>
            <button class="row action-row" id="export-grid-btn">Grid View</button>
          </div>
          <div class="ai-disclaimer">List View is a day-by-day breakdown with full lesson detail. Grid View is a visual week-at-a-glance, colour-coded to match the card.</div>
        </div>
      </div>
    `;
  }

  _viewModal() {
    const lesson = this._modal.lesson;
    const dayLabel = (WEEKDAYS.find((d) => d.key === lesson.day) || {}).label || lesson.day;
    const title = lesson.tutor ? `${lesson.subject} - ${lesson.tutor}` : lesson.subject;
    const subjectCount = this._data.lessons.filter((l) => l.subject === lesson.subject).length;
    const tutorCount = lesson.tutor ? this._data.lessons.filter((l) => l.tutor === lesson.tutor).length : 0;

    const listSection = (heading, items, icon) =>
      items && items.length
        ? `<div class="sheet-group">
            <div class="sheet-subheader">${heading}</div>
            ${items
              .map(
                (a) => `
              <div class="attachment-row">
                <a class="attachment-link" href="${this._escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">
                  ${this._icon(icon)}
                  <span>${this._escape(attachmentLabel(a))}</span>
                </a>
              </div>`
              )
              .join("")}
          </div>`
        : "";

    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="close-modal">Close</button>
            <span>Lesson</span>
            <button class="link-btn primary" id="view-edit-btn">Edit</button>
          </div>

          <div class="sheet-group">
            <div class="view-title-row">
              <span class="view-color-dot" style="background:${colorHex(lesson.color)}"></span>
              <span class="view-title">${this._escape(title)}</span>
            </div>
            <button class="row selectable" id="view-filter-subject">
              <span>Subject</span>
              <span class="row-value view-tap-value">${this._escape(lesson.subject)}${subjectCount > 1 ? ` (${subjectCount})` : ""}</span>
            </button>
            ${
              lesson.tutor
                ? `<button class="row selectable" id="view-filter-tutor">
                    <span>Tutor</span>
                    <span class="row-value view-tap-value">${this._escape(lesson.tutor)}${tutorCount > 1 ? ` (${tutorCount})` : ""}</span>
                  </button>`
                : ""
            }
            <div class="row">
              <span>Day</span>
              <span class="row-value">${this._escape(dayLabel)}</span>
            </div>
            <div class="row">
              <span>Time</span>
              <span class="row-value">${lesson.start_time} - ${lesson.end_time}</span>
            </div>
            ${
              lesson.location
                ? `<div class="row"><span>Location</span><span class="row-value">${this._escape(lesson.location)}</span></div>`
                : ""
            }
          </div>
          <div class="view-tap-hint">Tap Subject or Tutor to see every matching lesson</div>

          ${
            lesson.link
              ? `<div class="sheet-group">
                  <div class="attachment-row">
                    <a class="attachment-link" href="${this._escapeAttr(lesson.link)}" target="_blank" rel="noopener noreferrer">
                      ${this._icon("link")}
                      <span>Join Online Lesson</span>
                    </a>
                  </div>
                  ${
                    lesson.meeting_id
                      ? `<div class="row">
                          <span>Meeting ID</span>
                          <span class="row-value copy-value-row">
                            <span>${this._escape(lesson.meeting_id)}</span>
                            <button class="icon-btn copy-btn" id="copy-meeting-id-btn" title="Copy" data-value="${this._escapeAttr(lesson.meeting_id)}">${this._icon("copy")}</button>
                          </span>
                        </div>`
                      : ""
                  }
                  ${
                    lesson.passcode
                      ? `<div class="row">
                          <span>Passcode</span>
                          <span class="row-value copy-value-row">
                            <span>${this._escape(lesson.passcode)}</span>
                            <button class="icon-btn copy-btn" id="copy-passcode-btn" title="Copy" data-value="${this._escapeAttr(lesson.passcode)}">${this._icon("copy")}</button>
                          </span>
                        </div>`
                      : ""
                  }
                </div>`
              : ""
          }

          ${
            lesson.notes
              ? `<div class="sheet-group">
                  <div class="sheet-subheader">Notes</div>
                  <div class="view-notes">${this._escape(lesson.notes)}</div>
                </div>`
              : ""
          }

          ${listSection("Attachments", lesson.attachments, "paperclip")}
          ${listSection("Links", lesson.links, "link")}
          ${listSection("Catchup Lessons", lesson.online_lessons, "playCircle")}

          ${
            this._aiEnabled() && this._config.ai_enable_fun_fact !== false
              ? `<div class="sheet-group ai-section" id="fun-fact-section">
                  <div class="sheet-subheader">${this._aiIcon()} Fun Fact</div>
                  ${
                    this._modal.funFact
                      ? `<div class="ai-answer-card">${this._escape(this._modal.funFact)}</div>`
                      : this._modal.funFactLoading
                      ? `<div class="ai-empty-card">Thinking\u2026</div>`
                      : this._modal.funFactError
                      ? `<div class="ai-empty-card">${this._escape(this._modal.funFactError)}</div>`
                      : ""
                  }
                  <button class="row action-row" id="fun-fact-btn">
                    ${this._modal.funFact ? "\u21bb Get Another" : `Get a fun fact about ${this._escape(lesson.subject)}`}
                  </button>
                </div>`
              : ""
          }

          ${this._resourcesSectionHtml(lesson)}
          ${this._practiceResourcesSectionHtml(lesson)}
        </div>
      </div>
    `;
  }

  _levelMatchFor(lesson) {
    const match = `${lesson.subject || ""} ${lesson.notes || ""}`.match(EXAM_LEVEL_PATTERN);
    return match ? match[0] : null;
  }

  // Used only by Practice Resources, not the existing Lesson Resources
  // gating above - falling back to the configured Year Group as a second
  // signal when there's no explicit level keyword. Left Lesson Resources'
  // existing keyword-only gating untouched so it doesn't suddenly start
  // appearing on every lesson (Cooking, Mindfulness, etc.) for anyone who
  // sets a Year Group - that's a bigger behaviour change than asked for.
  _practiceLevelFor(lesson) {
    return this._levelMatchFor(lesson) || this._config.year_group || null;
  }

  _resourcesCacheKey(lesson, level) {
    return `${(lesson.subject || "").trim().toLowerCase()}|${(level || "").toLowerCase()}|${this._config.exam_board || ""}`;
  }

  _resourcesCached(lesson, level) {
    return this._aiLocalGet("resources", this._resourcesCacheKey(lesson, level), 7 * 24 * 3600 * 1000);
  }

  _resourcesSectionHtml(lesson) {
    if (!this._aiEnabled() || this._config.ai_enable_resources === false) return "";
    const level = this._levelMatchFor(lesson);
    if (!level) return "";
    const cached = this._resourcesCached(lesson, level);

    return `
      <div class="sheet-group ai-section" id="resources-section">
        <div class="sheet-subheader">${this._aiIcon()} Resources - ${this._escape(level.toUpperCase())}</div>
        ${
          cached
            ? `<div class="ai-answer-card">${this._escape(cached.overview)}</div>
               <div class="resource-links">
                 ${CURATED_RESOURCES.map((r) => `<a class="attachment-link" href="${this._escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer">${this._icon("link")}<span>${this._escape(r.name)}</span></a>`).join("")}
               </div>
               ${
                 cached.tips
                   ? `<div class="ai-tips-label">Revision tips</div><div class="ai-answer-card">${this._escape(cached.tips)}</div>`
                   : ""
               }`
            : this._modal.resourcesLoading
            ? `<div class="ai-empty-card">Thinking\u2026</div>`
            : this._modal.resourcesError
            ? `<div class="ai-empty-card">${this._escape(this._modal.resourcesError)}</div>`
            : `<button class="row action-row" id="resources-btn">Get resources for ${this._escape(level.toUpperCase())} ${this._escape(lesson.subject)}</button>`
        }
      </div>`;
  }

  // Practice Resources - a different curated link set from Resources above
  // (weighted toward sites you can actually *do* practice questions on),
  // with an AI-written framing note on what to focus on. Deliberately
  // never cached: unlike a fun fact, restating "what to focus on" fresh
  // each time is more useful than replaying the same note, so this always
  // regenerates rather than reusing a stored answer.
  _practiceResourcesSectionHtml(lesson) {
    if (!this._aiEnabled() || this._config.ai_enable_practice_resources === false) return "";
    const level = this._practiceLevelFor(lesson);
    if (!level) return "";
    const links = practiceResourcesFor(lesson.subject);
    const framing = this._modal.practiceFraming;

    return `
      <div class="sheet-group ai-section" id="practice-resources-section">
        <div class="sheet-subheader">${this._aiIcon()} Practice Resources - ${this._escape(level.toUpperCase())}</div>
        ${
          framing
            ? `<div class="ai-answer-card">${this._escape(framing)}</div>`
            : this._modal.practiceLoading
            ? `<div class="ai-empty-card">Thinking\u2026</div>`
            : this._modal.practiceError
            ? `<div class="ai-empty-card">${this._escape(this._modal.practiceError)}</div>`
            : ""
        }
        <div class="resource-links">
          ${links.map((r) => `<a class="attachment-link" href="${this._escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer">${this._icon("link")}<span>${this._escape(r.name)}</span></a>`).join("")}
        </div>
        <div class="ai-disclaimer">The links above are a fixed, hand-picked set - never AI-generated. Only the short focus note is written by AI.</div>
      </div>`;
  }

  async _fetchPracticeFraming(lesson) {
    const level = this._practiceLevelFor(lesson);
    this._modal.practiceLoading = true;
    this._modal.practiceError = null;
    this._render();

    const hasAI = await this._aiCheckAvailable();
    if (!hasAI) {
      this._modal.practiceLoading = false;
      this._modal.practiceError = "No AI conversation agent is set up - add one in Settings \u2192 Voice Assistants.";
      this._render();
      return;
    }

    const boardLabel = EXAM_BOARD_LABELS[this._config.exam_board] || "";
    const boardBit = boardLabel ? `, ${boardLabel} exam board` : "";
    const prompt = `A student is preparing for ${level.toUpperCase()} ${lesson.subject}${boardBit}. In one short, friendly sentence (under 25 words), suggest what topics or skills would be worth focusing practice questions on. Just the sentence, no preamble, no links or website names.`;
    const text = await this._aiConverse(prompt);
    this._modal.practiceLoading = false;
    if (text) {
      this._modal.practiceFraming = text.trim();
    } else {
      this._modal.practiceError = "Couldn't get a focus suggestion just now - try again in a moment.";
    }
    this._render();
  }

  _settingsModal() {
    const s = this._data.settings;
    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <span></span>
            <span>Settings</span>
            <button class="link-btn" id="close-modal">Done</button>
          </div>
          <div class="sheet-group">
            <div class="row">
              <span>Notifications</span>
              <label class="switch">
                <input type="checkbox" id="notif-toggle" ${s.notifications_enabled ? "checked" : ""}>
                <span class="slider"></span>
              </label>
            </div>
            ${
              s.notifications_enabled
                ? `<div class="row">
                    <span>Notify Before</span>
                    <span class="row-value">
                      <select id="lead-minutes" class="time-input">
                        ${this._optionsHtml([1, 5, 10, 15, 20, 30, 45, 60], s.notification_lead_minutes, "minute")}
                      </select>
                    </span>
                  </div>`
                : ""
            }
          </div>
          ${
            this._aiEnabled() && this._config.ai_enable_weekly_overview !== false
              ? `<div class="sheet-group">
                  <button class="row action-row" id="weekly-overview-settings-btn">${this._aiIcon()} Weekly Overview</button>
                </div>`
              : ""
          }
          <div class="sheet-group">
            <button class="row action-row" id="export-btn">Export Timetable</button>
          </div>
          <div class="sheet-group">
            <button class="row action-row" id="data-settings-btn">Data & Backup</button>
          </div>
        </div>
      </div>
    `;
  }

  _dataSettingsModal() {
    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="data-back-btn">Back</button>
            <span>Data & Backup</span>
            <span></span>
          </div>
          <div class="sheet-group">
            <button class="row action-row" id="backup-btn">Backup Timetable</button>
          </div>
          <div class="sheet-group">
            <button class="row action-row" id="restore-btn">Restore Timetable</button>
            <input type="file" id="restore-file-input" class="file-input-hidden" accept=".json,application/json">
          </div>
          <div class="sheet-group">
            <button class="row danger-row" id="reset-btn">Reset Timetable</button>
          </div>
        </div>
      </div>
    `;
  }

  _lessonModal() {
    const lesson = this._modal.lesson;
    const isNew = this._modal.isNew;
    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="close-modal">Cancel</button>
            <span>${isNew ? "New Lesson" : "Edit Lesson"}</span>
            <button class="link-btn primary" id="save-lesson">Save</button>
          </div>

          <div class="sheet-group">
            <div class="day-picker">
              ${WEEKDAYS.map(
                (d) => `<button class="day-chip ${lesson.day === d.key ? "active" : ""}" data-day="${d.key}">${d.short}</button>`
              ).join("")}
            </div>
          </div>

          <div class="sheet-group">
            <div class="row">
              <span>Starts</span>
              <input type="time" class="time-input" id="start-time" value="${lesson.start_time}">
            </div>
            <div class="row">
              <span>Ends</span>
              <input type="time" class="time-input" id="end-time" value="${lesson.end_time}">
            </div>
          </div>

          <div class="sheet-group">
            <div class="sheet-subheader">Subject</div>
            <input class="text-input" id="subject-input" placeholder="e.g. Maths" value="${this._escapeAttr(lesson.subject)}">
            <div class="sheet-subheader">Tutor</div>
            <input class="text-input" id="tutor-input" placeholder="e.g. Sarah" value="${this._escapeAttr(lesson.tutor)}">
          </div>

          <div class="sheet-group">
            <input class="text-input" id="location-input" placeholder="Location (optional)" value="${this._escapeAttr(lesson.location)}">
          </div>

          <div class="sheet-group">
            <div class="color-grid">
              ${COLOR_PALETTE.map(
                (c) => `
                <button class="swatch ${lesson.color === c.key ? "selected" : ""}" data-color="${c.key}" style="background:${c.hex}">
                  ${lesson.color === c.key ? this._icon("check") : ""}
                </button>`
              ).join("")}
            </div>
          </div>

          <div class="sheet-group">
            <input class="text-input" id="link-input" placeholder="Online lesson link (optional)" value="${this._escapeAttr(lesson.link)}">
            <input class="text-input" id="meeting-id-input" placeholder="Meeting ID / Username (optional)" value="${this._escapeAttr(lesson.meeting_id)}">
            <input class="text-input" id="passcode-input" placeholder="Password / Passcode (optional)" value="${this._escapeAttr(lesson.passcode)}">
            <textarea class="text-input notes-input" id="notes-input" placeholder="Notes (optional)">${this._escape(lesson.notes)}</textarea>
          </div>

          <div class="sheet-group">
            <div class="sheet-subheader">Attachments</div>
            <div id="attachments-list">
              ${(lesson.attachments || [])
                .map(
                  (a, i) => `
                <div class="attachment-row" data-index="${i}">
                  <a class="attachment-link" href="${this._escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">
                    ${this._icon("paperclip")}
                    <span>${this._escape(attachmentLabel(a))}</span>
                  </a>
                  <button class="icon-btn remove-attachment" data-index="${i}">${this._icon("trash")}</button>
                </div>`
                )
                .join("")}
            </div>
            <div class="attachment-add-row">
              <button class="row action-row" id="attachment-browse-btn">+ Browse for a File</button>
              <input type="file" id="attachment-file-input" class="file-input-hidden">
            </div>
          </div>

          <div class="sheet-group">
            <div class="sheet-subheader">Links</div>
            <div id="links-list">
              ${(lesson.links || [])
                .map(
                  (a, i) => `
                <div class="attachment-row" data-index="${i}">
                  <a class="attachment-link" href="${this._escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">
                    ${this._icon("link")}
                    <span>${this._escape(attachmentLabel(a))}</span>
                  </a>
                  <button class="icon-btn remove-link" data-index="${i}">${this._icon("trash")}</button>
                </div>`
                )
                .join("")}
            </div>
            <div class="attachment-add-row">
              <input class="text-input small attachment-url-input" id="link-url-input" placeholder="Paste a link...">
              <button class="icon-btn" id="clear-link-input-btn" title="Clear">${this._icon("close")}</button>
              <button class="icon-btn" id="add-link-btn" title="Add Link">${this._icon("plus")}</button>
            </div>
          </div>

          <div class="sheet-group">
            <div class="sheet-subheader">Catchup Lessons</div>
            <div id="online-lessons-list">
              ${(lesson.online_lessons || [])
                .map(
                  (a, i) => `
                <div class="attachment-row" data-index="${i}">
                  <a class="attachment-link" href="${this._escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">
                    ${this._icon("playCircle")}
                    <span>${this._escape(attachmentLabel(a))}</span>
                  </a>
                  <button class="icon-btn remove-online-lesson" data-index="${i}">${this._icon("trash")}</button>
                </div>`
                )
                .join("")}
            </div>
            <div class="attachment-add-row">
              <input class="text-input small attachment-url-input" id="online-lesson-url-input" placeholder="Paste a link...">
              <button class="icon-btn" id="clear-online-lesson-input-btn" title="Clear">${this._icon("close")}</button>
              <button class="icon-btn" id="add-online-lesson-btn" title="Add Link">${this._icon("plus")}</button>
            </div>
          </div>

          ${
            isNew
              ? ""
              : `<div class="sheet-group">
                  <button class="row danger-row" id="delete-lesson">Delete Lesson</button>
                </div>`
          }
        </div>
      </div>
    `;
  }

  // --- AI modals -------------------------------------------------------

  _askModal() {
    const question = this._modal.question || "";
    const answer = this._modal.answer;
    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="close-modal">Close</button>
            <span>Ask Your Timetable</span>
            <span></span>
          </div>
          <div class="sheet-group">
            <textarea class="text-input notes-input" id="ask-input" placeholder="e.g. What do I have on Thursday?">${this._escape(question)}</textarea>
          </div>
          <button class="row action-row ai-primary-btn" id="ask-submit-btn" ${this._modal.loading ? "disabled" : ""}>
            ${this._modal.loading ? "Thinking\u2026" : `${this._aiIcon()} Ask`}
          </button>
          ${
            answer
              ? `<div class="sheet-group ai-answer-card">${this._escape(answer)}</div>`
              : this._modal.error
              ? `<div class="sheet-group ai-empty-card">${this._escape(this._modal.error)}</div>`
              : ""
          }
          <div class="ai-disclaimer">AI-generated from your current schedule - always double check anything time-sensitive.</div>
        </div>
      </div>
    `;
  }

  _attachAskListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const input = q("#ask-input");
    if (input) input.oninput = (e) => (this._modal.question = e.target.value);

    const submitBtn = q("#ask-submit-btn");
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const question = (this._modal.question || "").trim();
        if (!question) return;
        this._modal.loading = true;
        this._modal.error = null;
        this._render();

        const hasAI = await this._aiCheckAvailable();
        if (!hasAI) {
          this._modal.loading = false;
          this._modal.error = "No AI conversation agent is set up - add one in Settings \u2192 Voice Assistants, then choose it in this card's visual editor.";
          this._render();
          return;
        }

        const prompt = `Here is a weekly lesson timetable:\n${this._scheduleSummaryText()}\n\nQuestion: ${question}\n\nAnswer only using the schedule above. If the answer isn't in the schedule, say so plainly rather than guessing.`;
        const text = await this._aiConverse(prompt);
        this._modal.loading = false;
        if (text) {
          this._modal.answer = text.trim();
        } else {
          this._modal.error = "Couldn't get an answer just now - try again in a moment.";
        }
        this._render();
      };
    }
  }

  _weeklyOverviewModal() {
    const cache = this._weeklyOverviewCache;
    const lessons = this._data.lessons;
    const dayCounts = {};
    lessons.forEach((l) => (dayCounts[l.day] = (dayCounts[l.day] || 0) + 1));
    const busiestDayKey = Object.keys(dayCounts).sort((a, b) => dayCounts[b] - dayCounts[a])[0];
    const busiestDayLabel = busiestDayKey ? (WEEKDAYS.find((d) => d.key === busiestDayKey) || {}).label : null;

    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="close-modal">Close</button>
            <span>Weekly Overview</span>
            <span></span>
          </div>
          <div class="sheet-group ai-stats-row">
            <button class="ai-stat ai-stat-tap" id="stat-lessons-btn" ${lessons.length ? "" : "disabled"}>
              <div class="ai-stat-value">${lessons.length}</div>
              <div class="ai-stat-label">Lesson${lessons.length === 1 ? "" : "s"}</div>
            </button>
          </div>
          ${
            cache
              ? `<div class="sheet-group ai-answer-card">${this._highlightWeeklyOverviewText(cache.text, busiestDayLabel)}</div>`
              : this._modal.loading
              ? `<div class="sheet-group ai-empty-card">Thinking\u2026</div>`
              : this._modal.error
              ? `<div class="sheet-group ai-empty-card">${this._escape(this._modal.error)}</div>`
              : ""
          }
          <div class="ai-disclaimer">AI-generated from your current schedule.</div>
        </div>
      </div>
    `;
  }

  async _fetchWeeklyOverview() {
    this._modal.loading = true;
    this._modal.error = null;
    this._render();

    const hasAI = await this._aiCheckAvailable();
    if (!hasAI) {
      this._modal.loading = false;
      this._modal.error = "No AI conversation agent is set up - add one in Settings \u2192 Voice Assistants, then choose it in this card's visual editor.";
      this._render();
      return;
    }

    const prompt = `Here is a weekly lesson timetable:\n${this._scheduleSummaryText()}\n\nWrite a short, friendly paragraph (2-3 sentences) describing the overall shape of the week. Explicitly name the busiest day (e.g. "Your busiest day this week is Tuesday, with N lessons"), and refer to the scheduled items as "lessons" throughout, not "events", "activities", "sessions", or "commitments". You can also mention any back-to-back lessons, or whether the week is generally light or heavy. Purely descriptive, no suggestions or advice.`;
    const text = await this._aiConverse(prompt);
    this._modal.loading = false;
    if (text) {
      this._weeklyOverviewCache = { text: text.trim(), timestamp: Date.now() };
    } else {
      this._modal.error = "Couldn't generate an overview just now - try again in a moment.";
    }
    this._render();
  }

  // Bold-wraps "lessons" and the specific busiest-day name wherever they
  // appear in the AI's returned sentence, applied to the already-escaped
  // text - not raw AI output, so this can never reopen an injection risk;
  // it's only recognizing and wrapping specific safe substrings with our
  // own trusted <strong> markup, not rendering anything the AI supplied.
  _highlightWeeklyOverviewText(text, busiestDayLabel) {
    let escaped = this._escape(text);
    escaped = escaped.replace(/\b(lessons?)\b/gi, "<strong>$1</strong>");
    if (busiestDayLabel) {
      const dayRe = new RegExp(`\\b(${busiestDayLabel})\\b`, "g");
      escaped = escaped.replace(dayRe, "<strong>$1</strong>");
    }
    return escaped;
  }

  _attachWeeklyOverviewListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);

    const statLessonsBtn = q("#stat-lessons-btn");
    if (statLessonsBtn) {
      statLessonsBtn.onclick = () => {
        this._modal = null;
        this._searchQuery = "";
        this._showAllLessons = true;
        this._render();
      };
    }

    // Loads automatically the first time this modal is opened with no
    // fresh cache to show - only once per open (weeklyFetchStarted),
    // not on every re-render while the modal is up.
    if (!this._weeklyOverviewCache && !this._modal.weeklyFetchStarted) {
      this._modal.weeklyFetchStarted = true;
      this._fetchWeeklyOverview();
    }
  }

  _aiMenuModal() {
    const lesson = this._modal.lesson;
    const title = lesson.tutor ? `${lesson.subject} - ${lesson.tutor}` : lesson.subject;
    const items = [];
    if (this._config.ai_enable_fun_fact !== false) items.push({ id: "ai-menu-funfact", label: "Fun Fact" });
    if (this._config.ai_enable_resources !== false) items.push({ id: "ai-menu-resources", label: "Resources" });
    if (this._config.ai_enable_practice_resources !== false) items.push({ id: "ai-menu-practice", label: "Practice Resources" });
    if (this._config.ai_enable_ask !== false) items.push({ id: "ai-menu-ask", label: "Ask About This Lesson" });
    if (this._config.ai_enable_weekly_overview !== false) items.push({ id: "ai-menu-weekly", label: "Weekly Overview" });

    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="close-modal">Close</button>
            <span>${this._escape(title)}</span>
            <span></span>
          </div>
          <div class="sheet-group">
            ${items.map((item) => `<button class="row action-row ai-menu-item" id="${item.id}">${item.label}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
  }

  _attachAiMenuListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const lesson = this._modal.lesson;

    const funFactBtn = q("#ai-menu-funfact");
    if (funFactBtn) funFactBtn.onclick = () => { this._modal = { type: "view", lesson, scrollToAi: "fun-fact" }; this._render(); };

    const resourcesBtn = q("#ai-menu-resources");
    if (resourcesBtn) resourcesBtn.onclick = () => { this._modal = { type: "view", lesson, scrollToAi: "resources" }; this._render(); };

    const practiceBtn = q("#ai-menu-practice");
    if (practiceBtn) practiceBtn.onclick = () => { this._modal = { type: "view", lesson, scrollToAi: "practice-resources" }; this._render(); };

    const askBtn = q("#ai-menu-ask");
    if (askBtn) askBtn.onclick = () => { this._modal = { type: "ask", question: `Tell me about ${lesson.subject}`, answer: null }; this._render(); };

    const weeklyBtn = q("#ai-menu-weekly");
    if (weeklyBtn) weeklyBtn.onclick = () => { this._modal = { type: "weekly" }; this._render(); };
  }

  _attachExportChoiceListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);

    const listBtn = q("#export-list-btn");
    if (listBtn) {
      listBtn.onclick = () => {
        this._modal = null;
        this._render();
        this._exportTimetablePDF();
      };
    }

    const gridBtn = q("#export-grid-btn");
    if (gridBtn) {
      gridBtn.onclick = () => {
        this._modal = null;
        this._render();
        this._exportTimetableGridPDF();
      };
    }
  }

  // Combines three gestures on a lesson row into one handler, since they'd
  // otherwise fight over the same touch events: a stationary tap opens the
  // read-only view, holding still for ~500ms opens the AI quick-action menu,
  // and dragging left reveals a delete button (iOS swipe-list convention -
  // tapping while revealed closes it first, same as tiger-todo-card).
  _attachLessonRowGestures(row) {
    const content = row.querySelector(".lesson-swipe-content");
    if (!content) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let dragging = false;
    let axisLock = null;
    let longPressTimer = null;
    let longPressFired = false;
    const LONG_PRESS_MS = 500;

    const clearLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const openView = () => {
      const lesson = this._data.lessons.find((l) => l.id === row.dataset.id);
      if (lesson) {
        this._modal = { type: "view", lesson };
        this._render();
      }
    };

    const openAiMenu = () => {
      if (!this._aiEnabled()) return;
      const lesson = this._data.lessons.find((l) => l.id === row.dataset.id);
      if (lesson) {
        this._modal = { type: "ai-menu", lesson };
        this._modalOpenedByLongPress = Date.now();
        this._render();
      }
    };

    const beginPress = (x, y) => {
      this._closeOtherLessonRows(row);
      startX = x;
      startY = y;
      dragging = true;
      currentX = 0;
      axisLock = null;
      longPressFired = false;
      clearLongPress();
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        dragging = false;
        content.style.transform = "translateX(0)";
        row.dataset.longpress = "1"; // consumed by the click handler below
        openAiMenu();
      }, LONG_PRESS_MS);
    };

    const trackMove = (x, y) => {
      if (!dragging) return;
      const dx = x - startX;
      const dy = y - startY;
      if (longPressTimer && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) clearLongPress();

      if (!axisLock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axisLock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axisLock === "y") return; // committed to a vertical scroll

      currentX = dx;
      if (currentX < 0) content.style.transform = `translateX(${Math.max(currentX, -88)}px)`;
    };

    const endPress = () => {
      clearLongPress();
      dragging = false;
      if (longPressFired) {
        longPressFired = false;
        currentX = 0;
        axisLock = null;
        return;
      }
      const openNow = axisLock === "x" && currentX < -40;
      content.style.transform = openNow ? "translateX(-88px)" : "translateX(0)";
      row.classList.toggle("swiped-open", openNow);
      currentX = 0;
      axisLock = null;
    };

    content.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        beginPress(t.clientX, t.clientY);
      },
      { passive: true }
    );
    content.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        trackMove(t.clientX, t.clientY);
      },
      { passive: true }
    );
    content.addEventListener("touchend", endPress);
    content.addEventListener("mousedown", (e) => beginPress(e.clientX, e.clientY));
    content.addEventListener("mousemove", (e) => trackMove(e.clientX, e.clientY));
    content.addEventListener("mouseup", endPress);
    content.addEventListener("mouseleave", () => { if (dragging) endPress(); });

    content.addEventListener("click", () => {
      if (row.dataset.longpress === "1") {
        delete row.dataset.longpress;
        return;
      }
      if (row.classList.contains("swiped-open")) {
        this._closeLessonRow(row);
        return;
      }
      openView();
    });

    const deleteBtn = row.querySelector(".lesson-delete-btn");
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        const lesson = this._data.lessons.find((l) => l.id === row.dataset.id);
        if (!lesson) return;
        const title = lesson.tutor ? `${lesson.subject} - ${lesson.tutor}` : lesson.subject;
        this._showConfirmDialog({
          title: "Delete this lesson?",
          message: title,
          confirmLabel: "Delete",
          onConfirm: () => {
            this._data.lessons = this._data.lessons.filter((l) => l.id !== lesson.id);
            this._persist();
            this._render();
          },
        });
      };
    }
  }

  // Collapses any lesson row other than exceptRow that's currently swiped
  // open, so only one row is ever revealed at a time.
  _closeOtherLessonRows(exceptRow) {
    const root = this.shadowRoot;
    root.querySelectorAll(".lesson-row.swiped-open").forEach((r) => {
      if (r !== exceptRow) this._closeLessonRow(r);
    });
  }

  _closeLessonRow(row) {
    const content = row.querySelector(".lesson-swipe-content");
    if (content) content.style.transform = "translateX(0)";
    row.classList.remove("swiped-open");
  }

  // --- Event wiring --------------------------------------------------------

  _attachListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const qa = (sel) => Array.from(root.querySelectorAll(sel));

    const settingsBtn = q("#settings-btn");
    if (settingsBtn) settingsBtn.onclick = () => { this._modal = { type: "settings" }; this._render(); };

    const askBtn = q("#ai-ask-btn");
    if (askBtn) askBtn.onclick = () => { this._modal = { type: "ask", question: "", answer: null }; this._render(); };

    const addBtn = q("#add-btn");
    if (addBtn)
      addBtn.onclick = () => {
        this._modal = { type: "lesson", isNew: true, lesson: this._blankLesson() };
        this._render();
      };

    const searchInput = q("#search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        this._searchQuery = e.target.value;
        this._showAllLessons = false;
        // Full re-render replaces the input node entirely (innerHTML-based
        // rendering, no diffing), which would otherwise drop keyboard focus
        // and cursor position after every keystroke - restore both
        // synchronously on the freshly created node right after.
        const cursorPos = e.target.selectionStart;
        this._render();
        const newInput = this.shadowRoot.querySelector("#search-input");
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(cursorPos, cursorPos);
        }
      };
    }

    const clearSearchBtn = q("#clear-search-btn");
    if (clearSearchBtn) {
      clearSearchBtn.onclick = () => {
        this._searchQuery = "";
        this._showAllLessons = false;
        this._render();
        this.shadowRoot.querySelector("#search-input")?.focus();
      };
    }

    qa(".tab").forEach((tab) => {
      tab.onclick = () => {
        this._selectedDay = tab.dataset.day;
        this._render();
      };
    });

    qa(".lesson-row").forEach((row) => {
      this._attachLessonRowGestures(row);
    });

    const backdrop = q("#backdrop");
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target !== backdrop) return;
        // A long-press that opens a modal fires its action while the
        // finger/mouse button is still down - when it's finally released,
        // that release lands on the freshly rendered backdrop and would
        // otherwise be read as "tap to dismiss", closing the modal the
        // same instant it opened. Ignore backdrop clicks for a brief
        // window right after a long-press-triggered open.
        if (this._modalOpenedByLongPress && Date.now() - this._modalOpenedByLongPress < 400) {
          this._modalOpenedByLongPress = null;
          return;
        }
        this._modal = null;
        this._render();
      };
    }

    const closeModal = q("#close-modal");
    if (closeModal) closeModal.onclick = () => { this._modal = null; this._render(); };

    if (this._modal && this._modal.type === "settings") this._attachSettingsListeners();
    if (this._modal && this._modal.type === "data-settings") this._attachDataSettingsListeners();
    if (this._modal && this._modal.type === "view") this._attachViewListeners();
    if (this._modal && this._modal.type === "lesson") this._attachLessonListeners();
    if (this._modal && this._modal.type === "ask") this._attachAskListeners();
    if (this._modal && this._modal.type === "weekly") this._attachWeeklyOverviewListeners();
    if (this._modal && this._modal.type === "ai-menu") this._attachAiMenuListeners();
    if (this._modal && this._modal.type === "export-choice") this._attachExportChoiceListeners();
    if (this._modal && this._modal.type === "restore-preview") this._attachRestorePreviewListeners();
  }

  _copyToClipboard(text, btn) {
    const flashSuccess = () => {
      if (!btn) return;
      const original = btn.innerHTML;
      btn.innerHTML = this._icon("check");
      setTimeout(() => {
        btn.innerHTML = original;
      }, 1200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flashSuccess).catch(() => this._copyFallback(text, flashSuccess));
    } else {
      this._copyFallback(text, flashSuccess);
    }
  }

  // Fallback for WKWebView contexts where navigator.clipboard isn't
  // available or the permission prompt is denied - the classic
  // hidden-textarea + execCommand('copy') trick.
  _copyFallback(text, onSuccess) {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      if (ok) onSuccess();
    } catch (err) {
      // Nothing else to fall back to - the value stays visible for a manual copy.
    }
  }

  _attachViewListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const qa = (sel) => Array.from(root.querySelectorAll(sel));
    const lesson = this._modal.lesson;

    qa(".copy-btn").forEach((btn) => {
      btn.onclick = () => this._copyToClipboard(btn.dataset.value, btn);
    });

    const editBtn = q("#view-edit-btn");
    if (editBtn) {
      editBtn.onclick = () => {
        this._modal = {
          type: "lesson",
          isNew: false,
          lesson: {
            ...lesson,
            attachments: [...(lesson.attachments || [])],
            links: [...(lesson.links || [])],
            online_lessons: [...(lesson.online_lessons || [])],
          },
        };
        this._render();
      };
    }

    const filterSubjectBtn = q("#view-filter-subject");
    if (filterSubjectBtn) {
      filterSubjectBtn.onclick = () => {
        this._searchQuery = lesson.subject;
        this._modal = null;
        this._render();
      };
    }

    const filterTutorBtn = q("#view-filter-tutor");
    if (filterTutorBtn) {
      filterTutorBtn.onclick = () => {
        this._searchQuery = lesson.tutor;
        this._modal = null;
        this._render();
      };
    }

    const funFactBtn = q("#fun-fact-btn");
    if (funFactBtn) {
      funFactBtn.onclick = async () => {
        // Always fetch fresh, including on repeat taps ("Get Another") -
        // caching per subject meant every tap replayed the identical fact,
        // which defeats the point of something meant to be varied.
        this._modal.funFactLoading = true;
        this._modal.funFactError = null;
        this._render();

        const hasAI = await this._aiCheckAvailable();
        if (!hasAI) {
          this._modal.funFactLoading = false;
          this._modal.funFactError = "No AI conversation agent is set up - add one in Settings \u2192 Voice Assistants.";
          this._render();
          return;
        }

        const avoid = this._modal.funFact ? ` Don't repeat this one: "${this._modal.funFact}".` : "";
        const prompt = `Write one short, fun, interesting fact (1-2 sentences) about the school subject "${lesson.subject}". Keep it light and suitable for a family audience.${avoid}`;
        const text = await this._aiConverse(prompt);
        this._modal.funFactLoading = false;
        if (text) {
          this._modal.funFact = text.trim();
        } else {
          this._modal.funFactError = "Couldn't get a fun fact just now - try again in a moment.";
        }
        this._render();
      };
    }

    const resourcesBtn = q("#resources-btn");
    if (resourcesBtn) {
      resourcesBtn.onclick = async () => {
        const level = this._levelMatchFor(lesson);
        this._modal.resourcesLoading = true;
        this._modal.resourcesError = null;
        this._render();

        const hasAI = await this._aiCheckAvailable();
        if (!hasAI) {
          this._modal.resourcesLoading = false;
          this._modal.resourcesError = "No AI conversation agent is set up - add one in Settings \u2192 Voice Assistants.";
          this._render();
          return;
        }

        const boardLabel = EXAM_BOARD_LABELS[this._config.exam_board] || "";
        const boardBit = boardLabel ? ` (${boardLabel} exam board)` : "";
        const prompt = `Reply with ONLY a JSON object, no other text, no markdown fences, in this exact shape:\n{"overview": "a short paragraph (2-3 sentences) describing what ${level.toUpperCase()} ${lesson.subject}${boardBit} typically covers", "tips": "2-3 short, general revision tips for this subject and level, as one short paragraph"}\n\nStay general if you're not certain of exact exam board specifics - accurate-but-general is better than confidently wrong.`;
        const raw = await this._aiConverse(prompt);
        const parsed = this._aiExtractJson(raw);
        this._modal.resourcesLoading = false;
        if (parsed && parsed.overview) {
          this._aiLocalSet("resources", this._resourcesCacheKey(lesson, level), parsed);
        } else {
          this._modal.resourcesError = "Couldn't get resources just now - try again in a moment.";
        }
        this._render();
      };
    }

    // Practice Resources has no button - it loads automatically the first
    // time this lesson's view is opened, and (per practiceFetchStarted)
    // only once per open, not on every re-render while the modal is up.
    if (
      this._aiEnabled() &&
      this._config.ai_enable_practice_resources !== false &&
      this._practiceLevelFor(lesson) &&
      !this._modal.practiceFetchStarted
    ) {
      this._modal.practiceFetchStarted = true;
      this._fetchPracticeFraming(lesson);
    }

    if (this._modal.scrollToAi) {
      const target = root.getElementById(`${this._modal.scrollToAi}-section`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  _attachSettingsListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const s = this._data.settings;

    q("#notif-toggle").onchange = (e) => {
      s.notifications_enabled = e.target.checked;
      this._persist();
      this._render();
    };

    const leadInput = q("#lead-minutes");
    if (leadInput) {
      leadInput.onchange = (e) => {
        s.notification_lead_minutes = Number(e.target.value);
        this._persist();
      };
    }

    const weeklyOverviewBtn = q("#weekly-overview-settings-btn");
    if (weeklyOverviewBtn) {
      weeklyOverviewBtn.onclick = () => {
        const cache = this._weeklyOverviewCache;
        const stale = !cache || Date.now() - cache.timestamp > 1800000; // 30 min
        this._modal = { type: "weekly" };
        if (stale) this._weeklyOverviewCache = null;
        this._render();
      };
    }

    const exportBtn = q("#export-btn");
    if (exportBtn) exportBtn.onclick = () => { this._modal = { type: "export-choice" }; this._render(); };

    const dataSettingsBtn = q("#data-settings-btn");
    if (dataSettingsBtn) dataSettingsBtn.onclick = () => { this._modal = { type: "data-settings" }; this._render(); };
  }

  _attachDataSettingsListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);

    const dataBackBtn = q("#data-back-btn");
    if (dataBackBtn) dataBackBtn.onclick = () => { this._modal = { type: "settings" }; this._render(); };

    const backupBtn = q("#backup-btn");
    if (backupBtn) backupBtn.onclick = () => this._backupTimetable();

    const restoreBtn = q("#restore-btn");
    if (restoreBtn) {
      restoreBtn.onclick = () => {
        q("#restore-file-input").click();
      };
    }

    const restoreFileInput = q("#restore-file-input");
    if (restoreFileInput) {
      restoreFileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) this._handleRestoreFile(file);
      };
    }

    q("#reset-btn").onclick = () => {
      this._showConfirmDialog({
        title: "Reset the entire timetable?",
        message: "This can't be undone.",
        confirmLabel: "Reset",
        onConfirm: () => {
          this._data.lessons = [];
          this._persist();
          this._modal = null;
          this._render();
        },
      });
    };
  }

  _attachLessonListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const qa = (sel) => Array.from(root.querySelectorAll(sel));
    const lesson = this._modal.lesson;

    const quickFillInput = q("#quickfill-input");
    if (quickFillInput) {
      quickFillInput.oninput = (e) => (this._modal.quickFillText = e.target.value);
      quickFillInput.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          q("#quickfill-btn").click();
        }
      };
    }

    const runQuickFill = async () => {
      const text = (this._modal.quickFillText || "").trim();
      if (!text) return;
      this._modal.quickFillLoading = true;
      this._modal.quickFillError = null;
      this._render();

      const hasAI = await this._aiCheckAvailable();
      if (!hasAI) {
        this._modal.quickFillLoading = false;
        this._modal.quickFillError = "No AI conversation agent is set up - add one in Settings \u2192 Voice Assistants, then choose it in this card's visual editor.";
        this._render();
        return;
      }

      const dayKeys = WEEKDAYS.map((d) => d.key).join(", ");
      const prompt = `Extract a single lesson from this description: "${text}"\n\nReply with ONLY a JSON object, no other text, no markdown fences, in this exact shape:\n{"day": "one of ${dayKeys}", "start_time": "HH:MM 24-hour", "end_time": "HH:MM 24-hour", "subject": "string", "tutor": "string or empty"}\n\nIf no end time is mentioned, assume the lesson is 1 hour long. If no day is mentioned, use "monday". If you genuinely cannot extract a subject, use an empty string for subject.`;
      const raw = await this._aiConverse(prompt);
      const parsed = this._aiExtractJson(raw);
      this._modal.quickFillLoading = false;

      if (!parsed || !WEEKDAYS.some((d) => d.key === parsed.day)) {
        this._modal.quickFillError = "Couldn't work that out - try rephrasing, or fill in the fields below yourself.";
        this._render();
        return;
      }

      // Title-case rather than trusting the model to capitalise consistently -
      // an LLM will occasionally return "maths"/"sarah" even when told not to.
      const titleCase = (s) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

      lesson.day = parsed.day;
      if (/^\d{2}:\d{2}$/.test(parsed.start_time || "")) lesson.start_time = parsed.start_time;
      if (/^\d{2}:\d{2}$/.test(parsed.end_time || "")) lesson.end_time = parsed.end_time;
      if (parsed.subject) lesson.subject = titleCase(parsed.subject.trim());
      if (parsed.tutor) lesson.tutor = titleCase(parsed.tutor.trim());
      this._render();
    };

    const quickFillBtn = q("#quickfill-btn");
    if (quickFillBtn) quickFillBtn.onclick = runQuickFill;

    qa(".day-chip[data-day]").forEach((chip) => {
      chip.onclick = () => {
        lesson.day = chip.dataset.day;
        this._render();
      };
    });

    qa(".swatch").forEach((sw) => {
      sw.onclick = () => {
        lesson.color = sw.dataset.color;
        this._render();
      };
    });

    q("#start-time").onchange = (e) => {
      lesson.start_time = e.target.value;
      lesson.end_time = minutesToHHMM(toMinutes(lesson.start_time) + 60);
      // Update the Ends field directly rather than calling _render() -
      // a full re-render tears down and rebuilds every input, including
      // this one, mid-interaction with iOS's native time-wheel (which can
      // fire "change" before the checkmark is tapped) - disrupting the
      // picker the user's still actively using.
      const endInput = q("#end-time");
      if (endInput) endInput.value = lesson.end_time;
    };
    q("#end-time").onchange = (e) => (lesson.end_time = e.target.value);
    q("#subject-input").oninput = (e) => (lesson.subject = e.target.value);
    q("#tutor-input").oninput = (e) => (lesson.tutor = e.target.value);
    const locationInput = q("#location-input");
    if (locationInput) locationInput.oninput = (e) => (lesson.location = e.target.value);
    q("#link-input").oninput = (e) => (lesson.link = e.target.value);
    q("#meeting-id-input").oninput = (e) => (lesson.meeting_id = e.target.value);
    q("#passcode-input").oninput = (e) => (lesson.passcode = e.target.value);
    q("#notes-input").oninput = (e) => (lesson.notes = e.target.value);

    qa(".remove-attachment").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.dataset.index);
        const item = lesson.attachments[index];
        this._showConfirmDialog({
          title: "Delete this attachment?",
          message: attachmentLabel(item),
          confirmLabel: "Delete",
          onConfirm: () => {
            lesson.attachments.splice(index, 1);
            this._render();
          },
        });
      };
    });

    qa(".remove-link").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.dataset.index);
        const item = lesson.links[index];
        this._showConfirmDialog({
          title: "Delete this link?",
          message: attachmentLabel(item),
          confirmLabel: "Delete",
          onConfirm: () => {
            lesson.links.splice(index, 1);
            this._render();
          },
        });
      };
    });

    qa(".remove-online-lesson").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.dataset.index);
        const item = lesson.online_lessons[index];
        this._showConfirmDialog({
          title: "Delete this catchup lesson link?",
          message: attachmentLabel(item),
          confirmLabel: "Delete",
          onConfirm: () => {
            lesson.online_lessons.splice(index, 1);
            this._render();
          },
        });
      };
    });

    q("#attachment-browse-btn").onclick = () => {
      q("#attachment-file-input").click();
    };

    q("#attachment-file-input").onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this._handleAttachmentFile(file);
    };

    const linkUrlInput = q("#link-url-input");

    q("#add-link-btn").onclick = () => {
      const url = linkUrlInput.value.trim();
      if (!url) return;
      lesson.links = lesson.links || [];
      lesson.links.push({ name: "", url });
      this._render();
    };

    if (linkUrlInput) {
      linkUrlInput.onkeydown = (e) => {
        if (e.key === "Enter") q("#add-link-btn").click();
      };
    }

    const clearLinkInputBtn = q("#clear-link-input-btn");
    if (clearLinkInputBtn) {
      clearLinkInputBtn.onclick = () => {
        linkUrlInput.value = "";
        linkUrlInput.focus();
      };
    }

    const onlineLessonUrlInput = q("#online-lesson-url-input");

    const addOnlineLessonBtn = q("#add-online-lesson-btn");
    if (addOnlineLessonBtn) {
      addOnlineLessonBtn.onclick = () => {
        const url = onlineLessonUrlInput.value.trim();
        if (!url) return;
        lesson.online_lessons = lesson.online_lessons || [];
        lesson.online_lessons.push({ name: "", url });
        this._render();
      };
    }

    if (onlineLessonUrlInput) {
      onlineLessonUrlInput.onkeydown = (e) => {
        if (e.key === "Enter") q("#add-online-lesson-btn").click();
      };
    }

    const clearOnlineLessonInputBtn = q("#clear-online-lesson-input-btn");
    if (clearOnlineLessonInputBtn) {
      clearOnlineLessonInputBtn.onclick = () => {
        onlineLessonUrlInput.value = "";
        onlineLessonUrlInput.focus();
      };
    }

    q("#save-lesson").onclick = () => {
      if (!lesson.subject.trim()) {
        alert("Please enter a subject.");
        return;
      }
      const idx = this._data.lessons.findIndex((l) => l.id === lesson.id);
      if (idx === -1) {
        this._data.lessons.push(lesson);
      } else {
        this._data.lessons[idx] = lesson;
      }
      this._persist();
      this._modal = null;
      this._render();
    };

    const deleteBtn = q("#delete-lesson");
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        this._showConfirmDialog({
          title: "Delete this lesson?",
          confirmLabel: "Delete",
          onConfirm: () => {
            this._data.lessons = this._data.lessons.filter((l) => l.id !== lesson.id);
            this._persist();
            this._modal = null;
            this._render();
          },
        });
      };
    }
  }

  async _handleAttachmentFile(file) {
    const lesson = this._modal.lesson;
    const formData = new FormData();
    formData.append("file", file, file.name);

    const btn = this.shadowRoot.querySelector("#attachment-browse-btn");
    if (btn) btn.disabled = true;

    try {
      const response = await fetch(this._hass.hassUrl("/api/turkey_timetable/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` },
        body: formData,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      const result = await response.json();
      lesson.attachments = lesson.attachments || [];
      lesson.attachments.push({ name: result.name || file.name, url: result.url });
      this._render();
    } catch (err) {
      alert("Couldn't upload that file. You can paste a link instead.");
      if (btn) btn.disabled = false;
    }
  }

  // --- Backup & restore -----------------------------------------------
  // Plain JSON, no attachment files - restoring an attachment reference
  // only works if the underlying file is still on this HA instance, since
  // the bytes themselves were never included in the backup.

  _backupTimetable() {
    const backup = {
      format: "turkey-timetable-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      lessons: this._data.lessons,
      settings: this._data.settings,
    };
    const json = JSON.stringify(backup, null, 2);
    const blobUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `turkey-timetable-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  async _handleRestoreFile(file) {
    this._modal = { type: "restore-preview", loading: true };
    this._render();

    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error("That doesn't look like a valid backup file.");
      }

      if (!Array.isArray(parsed.lessons)) {
        throw new Error("That file doesn't contain any timetable data.");
      }

      const hasAttachments = parsed.lessons.some(
        (l) => (l.attachments && l.attachments.length) || (l.links && l.links.length)
      );

      this._modal = {
        type: "restore-preview",
        loading: false,
        lessons: parsed.lessons,
        settings: parsed.settings || null,
        hasAttachments,
      };
      this._render();
    } catch (err) {
      this._modal = { type: "restore-preview", loading: false, error: err.message || "Couldn't read that file." };
      this._render();
    }
  }

  _restorePreviewModal() {
    const m = this._modal;
    if (m.loading) {
      return `
        <div class="sheet-backdrop" id="backdrop">
          <div class="sheet">
            <div class="sheet-header"><span></span><span>Restore Timetable</span><span></span></div>
            <div class="ai-empty-card">Reading file\u2026</div>
          </div>
        </div>`;
    }
    if (m.error) {
      return `
        <div class="sheet-backdrop" id="backdrop">
          <div class="sheet">
            <div class="sheet-header">
              <button class="link-btn" id="close-modal">Close</button>
              <span>Restore Timetable</span>
              <span></span>
            </div>
            <div class="ai-empty-card">${this._escape(m.error)}</div>
          </div>
        </div>`;
    }

    const lessons = m.lessons || [];
    const byDay = {};
    lessons.forEach((l) => {
      (byDay[l.day] = byDay[l.day] || []).push(l);
    });
    const summaryHtml = WEEKDAYS.filter((d) => byDay[d.key])
      .map(
        (d) =>
          `<div class="row"><span>${d.label}</span><span class="row-value">${byDay[d.key].length} lesson${byDay[d.key].length === 1 ? "" : "s"}</span></div>`
      )
      .join("");

    return `
      <div class="sheet-backdrop" id="backdrop">
        <div class="sheet">
          <div class="sheet-header">
            <button class="link-btn" id="close-modal">Cancel</button>
            <span>Restore Timetable</span>
            <span></span>
          </div>
          <div class="sheet-group">
            <div class="row"><span>Found</span><span class="row-value">${lessons.length} lesson${lessons.length === 1 ? "" : "s"}</span></div>
            ${summaryHtml}
          </div>
          <div class="sheet-group">
            <button class="row action-row" id="restore-merge-btn">Merge With Existing Timetable</button>
          </div>
          <div class="sheet-group">
            <button class="row danger-row" id="restore-replace-btn">Replace Entire Timetable</button>
          </div>
          ${
            m.hasAttachments
              ? `<div class="ai-disclaimer">This backup doesn't include attachment files themselves - attachment links will only work if the original files still exist on this Home Assistant instance.</div>`
              : ""
          }
        </div>
      </div>`;
  }

  _attachRestorePreviewListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const m = this._modal || {};
    const lessons = m.lessons || [];

    const mergeBtn = q("#restore-merge-btn");
    if (mergeBtn) {
      mergeBtn.onclick = () => {
        this._data.lessons = [...this._data.lessons, ...lessons];
        this._persist();
        this._modal = null;
        this._render();
      };
    }

    const replaceBtn = q("#restore-replace-btn");
    if (replaceBtn) {
      replaceBtn.onclick = () => {
        const existingCount = this._data.lessons.length;
        this._showConfirmDialog({
          title: "Replace your entire timetable?",
          message: `This deletes all ${existingCount} existing lesson${existingCount === 1 ? "" : "s"} and replaces them with the ${lessons.length} restored one${lessons.length === 1 ? "" : "s"}. This can't be undone.`,
          confirmLabel: "Replace",
          onConfirm: () => {
            this._data.lessons = lessons;
            if (m.settings) this._data.settings = { ...DEFAULT_SETTINGS, ...m.settings };
            this._persist();
            this._modal = null;
            this._render();
          },
        });
      };
    }
  }

  // --- PDF export (same approach as the DolphinAI card) --------------------
  // Lazy-loads jsPDF from cdnjs the first time it's needed, builds a
  // themed document with the shared masthead/table/footer helpers, then
  // shows it in a preview popup before the person commits to a download.

  _ensureJsPDF() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (this._jsPDFLoadPromise) return this._jsPDFLoadPromise;
    this._jsPDFLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = () => {
        if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error("jsPDF failed to initialise"));
      };
      script.onerror = () => {
        this._jsPDFLoadPromise = null;
        reject(new Error("Could not load PDF library - check your internet connection"));
      };
      document.head.appendChild(script);
    });
    return this._jsPDFLoadPromise;
  }

  _pdfHexToRgb(hex) {
    const h = (hex || "#000000").replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  _pdfTheme(doc) {
    const inkRgb = [28, 28, 30];
    const mutedRgb = [130, 130, 136];
    const zebraRgb = [246, 246, 248];
    const accentRgb = this._pdfHexToRgb(colorHex("blue"));
    return {
      hexToRgb: this._pdfHexToRgb,
      inkRgb, mutedRgb, zebraRgb, accentRgb,
      setInk: () => doc.setTextColor(...inkRgb),
      setMuted: () => doc.setTextColor(...mutedRgb),
      setAccent: () => doc.setTextColor(...accentRgb),
    };
  }

  _pdfMasthead(doc, theme, marginX, y, pageW) {
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    theme.setInk();
    doc.text("Timetable", marginX, y);
    y += 8;
    doc.setDrawColor(...theme.accentRgb);
    doc.setLineWidth(1.5);
    doc.line(marginX, y, pageW - marginX, y);
    return y + 28;
  }

  _pdfFooter(doc, theme, marginX, pageW, pageH) {
    const pageCount = doc.internal.getNumberOfPages();
    const generatedText = `Timetable  \u00b7  Generated ${new Date().toLocaleString("en-GB")}`;
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      theme.setMuted();
      doc.text(`Page ${p} of ${pageCount}`, pageW - marginX, pageH - 24, { align: "right" });
      doc.text(generatedText, marginX, pageH - 24);
    }
  }

  // Shows a finished jsPDF document in a popup before committing to a
  // download - appended to document.body (not the shadow root) so it
  // isn't constrained by the card's own size.
  _showPDFPreview(doc, filename) {
    const blobUrl = doc.output("bloburl");

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);";

    const popup = document.createElement("div");
    popup.style.cssText =
      "background:rgba(28,28,30,0.96);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border:1px solid rgba(255,255,255,0.15);border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,0.65);padding:16px;width:100%;max-width:480px;max-height:88vh;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;color:#fff;";

    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";
    headerRow.innerHTML = `
      <span style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.45);">PDF Preview</span>
      <button id="tt-pdf-close" style="background:rgba(255,255,255,0.1);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;color:rgba(255,255,255,0.65);font-size:14px;line-height:1;">&times;</button>`;
    headerRow.querySelector("#tt-pdf-close").onclick = () => overlay.remove();
    popup.appendChild(headerRow);

    const frameWrap = document.createElement("div");
    frameWrap.style.cssText =
      "width:100%;height:58vh;min-height:340px;border-radius:12px;overflow:hidden;background:#fff;margin-bottom:10px;border:1px solid rgba(255,255,255,0.12);";
    const iframe = document.createElement("iframe");
    iframe.src = blobUrl;
    iframe.title = "PDF preview";
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    frameWrap.appendChild(iframe);
    popup.appendChild(frameWrap);

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "\u2b07 Download";
    downloadBtn.style.cssText =
      "width:100%;padding:12px;border-radius:12px;border:none;background:#007AFF;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;";
    downloadBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      downloadBtn.textContent = "\u2713 Downloaded";
      setTimeout(() => (downloadBtn.textContent = "\u2b07 Download"), 1500);
    };
    popup.appendChild(downloadBtn);

    overlay.appendChild(popup);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);

    const observer = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        URL.revokeObjectURL(blobUrl);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  // dialog button colours: the original hues unless the user has chosen their own
  _confirmAccent() { const v = this._pick("accent_color"); return this._x(v || "#63b3ed"); }
  _confirmDanger() { const v = this._pick("delete_color"); return this._x(v || "#FF3B30"); }

  _showConfirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = true, onConfirm, onCancel }) {
    document.getElementById("tt-confirm-dialog")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "tt-confirm-dialog";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,0.35);";

    const style = document.createElement("style");
    style.textContent = `
      @keyframes ttConfirmFadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes ttConfirmSlideUp { from{transform:translateY(12px) scale(0.96);opacity:0} to{transform:none;opacity:1} }
    `;
    overlay.style.animation = "ttConfirmFadeIn 0.15s ease";

    const card = document.createElement("div");
    card.style.cssText =
      "width:100%;max-width:270px;background:" + (this._glassOn() ? this._gt().dialog : "rgba(40,40,42,0.94)") + ";backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border-radius:" + (this._glassOn() ? "24px" : "14px") + ";overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.5);border:1px solid " + this._W("0.12") + ";font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;animation:ttConfirmSlideUp 0.2s cubic-bezier(0.34,1.3,0.64,1);";
    card.innerHTML = `
      <div style="padding:18px 18px 16px;text-align:center;">
        <div style="font-size:15px;font-weight:600;color:${this._T()};margin-bottom:4px;">${this._escape(title)}</div>
        ${message ? `<div style="font-size:12.5px;font-weight:400;color:${this._W("0.6")};line-height:1.4;">${this._escape(message)}</div>` : ""}
      </div>
      <div style="display:flex;border-top:1px solid ${this._W("0.14")};">
        <button id="tt-confirm-cancel" style="flex:1;padding:12px;background:none;border:none;border-right:1px solid ${this._W("0.14")};color:${this._confirmAccent()};font-size:14.5px;font-weight:500;cursor:pointer;font-family:inherit;">${this._escape(cancelLabel)}</button>
        <button id="tt-confirm-ok" style="flex:1;padding:12px;background:none;border:none;color:${destructive ? this._confirmDanger() : this._confirmAccent()};font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit;">${this._escape(confirmLabel)}</button>
      </div>`;

    overlay.appendChild(style);
    overlay.appendChild(card);
    const close = () => {
      overlay.style.transition = "opacity 0.15s ease";
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 150);
    };
    card.querySelector("#tt-confirm-cancel").onclick = () => {
      close();
      onCancel?.();
    };
    card.querySelector("#tt-confirm-ok").onclick = () => {
      close();
      onConfirm?.();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        close();
        onCancel?.();
      }
    });
    document.body.appendChild(overlay);
  }

  async _exportTimetableGridPDF() {
    let JsPDFCtor;
    try {
      JsPDFCtor = await this._ensureJsPDF();
    } catch (err) {
      alert("Couldn't load the PDF library - check your internet connection and try again.");
      return;
    }

    const doc = new JsPDFCtor({ unit: "pt", format: "a4", orientation: "landscape" });
    const theme = this._pdfTheme(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 36;
    let y = this._pdfMasthead(doc, theme, marginX, 40, pageW);

    const lessons = this._data.lessons;
    if (!lessons.length) {
      theme.setMuted();
      doc.setFontSize(11);
      doc.text("No lessons added yet.", marginX, y);
      this._pdfFooter(doc, theme, marginX, pageW, pageH);
      this._showPDFPreview(doc, `turkey-timetable-grid-${new Date().toISOString().slice(0, 10)}.pdf`);
      return;
    }

    // Proportional time axis (like a calendar week view) rather than fixed
    // hourly slots, so a lesson at e.g. 09:15-10:05 is positioned and sized
    // to its real time rather than snapping to the nearest hour.
    let minMinutes = Math.min(...lessons.map((l) => toMinutes(l.start_time)));
    let maxMinutes = Math.max(...lessons.map((l) => toMinutes(l.end_time)));
    minMinutes = Math.floor(minMinutes / 30) * 30 - 15;
    maxMinutes = Math.ceil(maxMinutes / 30) * 30 + 15;
    if (maxMinutes - minMinutes < 60) maxMinutes = minMinutes + 60;
    const totalMinutes = maxMinutes - minMinutes;

    const timeColW = 42;
    const dayColW = (pageW - marginX * 2 - timeColW) / 7;
    const headerH = 20;
    const gridTop = y + headerH + 6;
    const gridBottom = pageH - 48;
    const gridH = gridBottom - gridTop;

    const yForMinutes = (mins) => gridTop + ((mins - minMinutes) / totalMinutes) * gridH;

    // Day headers
    doc.setFontSize(10.5);
    doc.setFont(undefined, "bold");
    theme.setInk();
    WEEKDAYS.forEach((d, i) => {
      const x = marginX + timeColW + i * dayColW;
      doc.text(d.short, x + dayColW / 2, y + headerH - 6, { align: "center" });
    });
    doc.setDrawColor(...theme.accentRgb);
    doc.setLineWidth(1.2);
    doc.line(marginX, gridTop, pageW - marginX, gridTop);

    // Hour gridlines + time labels
    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    theme.setMuted();
    for (let m = Math.ceil(minMinutes / 60) * 60; m <= maxMinutes; m += 60) {
      const gy = yForMinutes(m);
      const h = String(Math.floor(m / 60)).padStart(2, "0");
      doc.text(`${h}:00`, marginX, gy + 3);
      doc.setDrawColor(...theme.zebraRgb);
      doc.setLineWidth(0.75);
      doc.line(marginX + timeColW, gy, pageW - marginX, gy);
    }

    // Day column separators
    doc.setDrawColor(...theme.zebraRgb);
    doc.setLineWidth(0.75);
    for (let i = 0; i <= 7; i++) {
      const x = marginX + timeColW + i * dayColW;
      doc.line(x, gridTop, x, gridBottom);
    }

    // Lesson blocks - drawn in schedule order; overlapping lessons (rare
    // for a personal timetable) simply overlap, later one on top, rather
    // than splitting into side-by-side lanes.
    lessons.forEach((lesson) => {
      const dayIndex = WEEKDAYS.findIndex((d) => d.key === lesson.day);
      if (dayIndex === -1) return;
      const startM = toMinutes(lesson.start_time);
      const endM = toMinutes(lesson.end_time);
      const blockTop = yForMinutes(startM);
      const blockH = Math.max(yForMinutes(endM) - blockTop, 18);
      const blockX = marginX + timeColW + dayIndex * dayColW + 2;
      const blockW = dayColW - 4;

      doc.setFillColor(...this._pdfHexToRgb(colorHex(lesson.color)));
      doc.roundedRect(blockX, blockTop, blockW, blockH, 4, 4, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, "bold");
      doc.setFontSize(7.5);
      const subjectLines = doc.splitTextToSize(lesson.subject, blockW - 6);
      doc.text(subjectLines.slice(0, blockH > 30 ? 2 : 1), blockX + 3, blockTop + 10);

      if (lesson.tutor && blockH > 28) {
        doc.setFont(undefined, "normal");
        doc.setFontSize(7);
        const tutorY = blockTop + 10 + Math.min(subjectLines.length, 2) * 8.5;
        if (tutorY < blockTop + blockH - 3) doc.text(lesson.tutor, blockX + 3, tutorY);
      }
    });

    this._pdfFooter(doc, theme, marginX, pageW, pageH);
    this._showPDFPreview(doc, `turkey-timetable-grid-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async _exportTimetablePDF() {
    let JsPDFCtor;
    try {
      JsPDFCtor = await this._ensureJsPDF();
    } catch (err) {
      alert("Couldn't load the PDF library - check your internet connection and try again.");
      return;
    }

    const doc = new JsPDFCtor({ unit: "pt", format: "a4" });
    const theme = this._pdfTheme(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 50;
    let y = this._pdfMasthead(doc, theme, marginX, 56, pageW);

    const newPageIfNeeded = (needed) => {
      if (y + needed > pageH - 44) {
        doc.addPage();
        y = 56;
        return true;
      }
      return false;
    };

    const visibleDays = WEEKDAYS;

    let anyLessons = false;

    visibleDays.forEach((day) => {
      const lessons = this._data.lessons
        .filter((l) => l.day === day.key)
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
      if (!lessons.length) return;
      anyLessons = true;

      newPageIfNeeded(40);
      doc.setFillColor(...theme.accentRgb);
      doc.rect(marginX, y - 10, 3, 13, "F");
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      theme.setInk();
      doc.text(day.label, marginX + 9, y);
      y += 18;

      const colX = [marginX, marginX + 70, marginX + 320];
      const tableHeader = () => {
        doc.setFillColor(...theme.zebraRgb);
        doc.rect(marginX, y - 10, pageW - marginX * 2, 16, "F");
        doc.setFontSize(9);
        doc.setFont(undefined, "bold");
        theme.setMuted();
        doc.text("TIME", colX[0] + 4, y);
        doc.text("LESSON", colX[1] + 4, y);
        doc.text("NOTES", colX[2] + 4, y);
        y += 14;
        doc.setFont(undefined, "normal");
      };
      tableHeader();

      lessons.forEach((lesson, idx) => {
        const noteBits = [];
        if (lesson.link) noteBits.push("Link attached");
        if (lesson.notes) noteBits.push(lesson.notes);
        if (lesson.attachments && lesson.attachments.length) {
          noteBits.push(`${lesson.attachments.length} attachment${lesson.attachments.length === 1 ? "" : "s"}`);
        }
        if (lesson.links && lesson.links.length) {
          noteBits.push(`${lesson.links.length} link${lesson.links.length === 1 ? "" : "s"}`);
        }
        if (lesson.online_lessons && lesson.online_lessons.length) {
          noteBits.push(`${lesson.online_lessons.length} catchup lesson${lesson.online_lessons.length === 1 ? "" : "s"}`);
        }
        const noteText = noteBits.join(" \u00b7 ");
        doc.setFontSize(9);
        const noteLines = noteText ? doc.splitTextToSize(noteText, pageW - marginX - colX[2] - 4) : [];
        const rowH = Math.max(14, noteLines.length * 11 + 4);

        if (newPageIfNeeded(rowH + 1)) tableHeader();
        if (idx % 2 === 1) {
          doc.setFillColor(...theme.zebraRgb);
          doc.rect(marginX, y - 9, pageW - marginX * 2, rowH, "F");
        }

        doc.setFillColor(...this._pdfHexToRgb(colorHex(lesson.color)));
        doc.rect(colX[0], y - 8, 3, 10, "F");

        doc.setFontSize(9);
        theme.setInk();
        doc.text(`${lesson.start_time}-${lesson.end_time}`, colX[0] + 8, y);

        const title = lesson.tutor ? `${lesson.subject} - ${lesson.tutor}` : lesson.subject;
        doc.setFont(undefined, "bold");
        doc.text(title, colX[1] + 4, y);
        doc.setFont(undefined, "normal");

        theme.setMuted();
        if (noteLines.length) doc.text(noteLines, colX[2] + 4, y);

        y += rowH;
      });

      y += 16;
    });

    if (!anyLessons) {
      theme.setMuted();
      doc.setFontSize(11);
      doc.text("No lessons added yet.", marginX, y);
    }

    this._pdfFooter(doc, theme, marginX, pageW, pageH);
    this._showPDFPreview(doc, `turkey-timetable-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // --- Helpers ---------------------------------------------------------

  _escape(str) {
    return (str || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  _escapeAttr(str) {
    return this._escape(str).replace(/"/g, "&quot;");
  }

  // Single shared MDI icon standing in for "AI feature" everywhere the app
  // marks something as AI-generated - a real vector glyph (matching the
  // rest of HA's UI) rather than the sparkle emoji, which read as
  // decoration rather than an icon.
  _aiIcon(size = 15) {
    return `<ha-icon icon="mdi:creation" style="--mdc-icon-size: ${size}px; vertical-align: -3px;"></ha-icon>`;
  }

  _icon(name) {
    const icons = {
      settings:
        '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      plus:
        '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
      link:
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
      bookmark:
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M6 4h12v16l-6-4-6 4V4z"/></svg>',
      moreInfo:
        '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="8" r="1.15" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 11.5v5"/></svg>',
      videoCamera:
        '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M15 10l6-3v10l-6-3z"/></svg>',
      playCircle:
        '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M10 8.5l6 3.5-6 3.5z"/></svg>',
      notes:
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2" d="M5 4h14v16H5z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 9h8M8 13h8M8 17h4"/></svg>',
      paperclip:
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 12l6-6a3 3 0 1 1 4 4l-8 8a5 5 0 1 1-7-7l7-7"/></svg>',
      chevron:
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9 6l6 6-6 6"/></svg>',
      check:
        '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12l5 5 9-9"/></svg>',
      trash:
        '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
      upload:
        '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M5 18v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"/></svg>',
      close:
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>',
      search:
        '<svg viewBox="0 0 24 24" width="17" height="17"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M21 21l-4.35-4.35"/></svg>',
      spinner:
        '<svg viewBox="0 0 24 24" width="18" height="18" class="tt-spin"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="14 42"/></svg>',
      copy:
        '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    };
    return icons[name] || "";
  }

  // ── Theme ──────────────────────────────────────────────────────────
  // Two looks: 'classic' (the card exactly as it was) and 'glass' (a frosted
  // surface with soft highlights, in a light or dark theme). Theme
  // (Auto / Light / Dark) applies to Glass; Auto follows Home Assistant.
  // Lesson colours are never touched.
  _glassOn() { return this._config?.card_style === "glass"; }

  _isDark() {
    const mode = this._config?.appearance || "auto";
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return this._hass?.themes?.darkMode !== false;
  }

  _lightGlass() { return this._glassOn() && !this._isDark(); }

  _themeSig() {
    const g = this._glassOn(), c = this._config || {};
    return `${g}|${g ? this._isDark() : ""}|${g ? (c.glass ?? 50) : ""}|${c.accent_color || ""}|${c.delete_color || ""}|${c.switch_color || ""}`;
  }

  _gt() {
    const dark = this._isDark();
    let a = parseFloat(this._config?.glass);
    a = isNaN(a) ? 0.5 : Math.min(1, Math.max(0, a / 100));
    const f = (n) => n.toFixed(3);
    return dark ? {
      dark: true,
      glass1: `rgba(255,255,255,${f(0.10 + a * 0.16)})`, glass2: `rgba(255,255,255,${f(0.03 + a * 0.08)})`,
      edge: "rgba(255,255,255,0.26)", hi: "rgba(255,255,255,0.42)", lo: "rgba(255,255,255,0.07)", shadow: "0 14px 36px rgba(0,0,0,0.32)",
      text: "#ffffff", dim: "rgba(255,255,255,0.68)", ink: "rgba(255,255,255,0.86)",
      chip: "rgba(255,255,255,0.10)", chipEdge: "rgba(255,255,255,0.16)", fill: "rgba(255,255,255,0.13)", line: "rgba(255,255,255,0.12)", track: "rgba(255,255,255,0.22)",
      sheet: "linear-gradient(160deg,rgba(70,70,80,0.90),rgba(30,30,36,0.95))", sheetSolid: "#2a2a30", sheetEdge: "rgba(255,255,255,0.22)",
      scrim: "rgba(0,0,0,0.5)", dialog: "rgba(52,52,58,0.94)", scheme: "dark",
    } : {
      dark: false,
      glass1: `rgba(255,255,255,${f(0.50 + a * 0.32)})`, glass2: `rgba(255,255,255,${f(0.34 + a * 0.30)})`,
      edge: "rgba(255,255,255,0.85)", hi: "rgba(255,255,255,0.95)", lo: "rgba(0,0,0,0.04)", shadow: "0 10px 30px rgba(28,36,80,0.14), 0 0 0 0.5px rgba(0,0,0,0.05)",
      text: "#1c1c1e", dim: "rgba(60,60,67,0.72)", ink: "rgba(60,60,67,0.9)",
      chip: "rgba(120,120,128,0.12)", chipEdge: "rgba(120,120,128,0.14)", fill: "rgba(120,120,128,0.16)", line: "rgba(60,60,67,0.14)", track: "rgba(120,120,128,0.32)",
      sheet: "linear-gradient(160deg,rgba(255,255,255,0.94),rgba(244,244,250,0.96))", sheetSolid: "#f4f4fa", sheetEdge: "rgba(255,255,255,0.9)",
      scrim: "rgba(0,0,0,0.30)", dialog: "rgba(255,255,255,0.96)", scheme: "light",
    };
  }

  // ink used by the confirm dialog (a body-level element, outside the stylesheet)
  _W(a) {
    if (!this._lightGlass()) return `rgba(255,255,255,${a})`;
    const x = parseFloat(a);
    return x <= 0.26 ? `rgba(120,120,128,${(x * 1.5).toFixed(2)})` : `rgba(60,60,67,${Math.min(0.92, 0.45 + x * 0.6).toFixed(2)})`;
  }
  _T() { return this._lightGlass() ? "#1c1c1e" : "#fff"; }
  _x(hex) { return this._lightGlass() ? tuneColor(hex, false).text : hex; }

  // The three interface colours. Classic uses exactly what is set (or the original default);
  // Glass tunes them for the theme.
  _pick(key) { const v = this._config?.[key]; return isHex(v) ? v.trim() : null; }
  _accentVar()  { const v = this._pick("accent_color") || TT_DEFAULTS.accent_color; return this._lightGlass() ? tuneColor(v, false).text : v; }
  _accentFill() { const v = this._pick("accent_color") || TT_DEFAULTS.accent_color; return accentFill(v); }
  _delFillVar() { const v = this._pick("delete_color") || TT_DEFAULTS.delete_color; return this._glassOn() ? accentFill(v) : v; }
  _delTextVar() { const v = this._pick("delete_color") || "#ff453a"; return this._lightGlass() ? tuneColor(v, false).text : v; }
  _swVar()      { const v = this._pick("switch_color") || TT_DEFAULTS.switch_color; return this._glassOn() ? accentFill(v) : v; }

  _styles() { return this._baseStyles() + (this._glassOn() ? this._glassStyles() : ""); }

  // Everything below only applies in Glass — it sits on top of the original stylesheet
  _glassStyles() {
    const t = this._gt(), light = !t.dark;
    return `
      :host([data-style="glass"]) {
        --tt-bg: transparent;
        --tt-surface: ${t.chip};
        --tt-text: ${t.text};
        --tt-text-dim: ${t.dim};
        --tt-accent-fill: ${this._accentFill()};
        font-family: ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
      }
      :host([data-style="glass"]) .card {
        background: linear-gradient(160deg, ${t.glass1}, ${t.glass2});
        -webkit-backdrop-filter: blur(24px) saturate(170%); backdrop-filter: blur(24px) saturate(170%);
        border: 1px solid ${t.edge}; border-radius: 28px; padding: 16px 16px 20px;
        box-shadow: inset 0 1px 0 ${t.hi}, inset 0 -1px 0 ${t.lo}, ${t.shadow};
      }
      :host([data-style="glass"]) .topbar .icon-btn {
        width: 36px; height: 36px; padding: 0; border-radius: 50%; justify-content: center;
        background: ${t.chip}; border: 1px solid ${t.chipEdge}; box-shadow: inset 0 1px 0 ${t.hi};
      }
      :host([data-style="glass"]) .search-bar {
        border-radius: 999px; padding: 9px 14px; background: ${t.chip}; border: 1px solid ${t.chipEdge}; box-shadow: inset 0 1px 0 ${t.hi};
      }
      :host([data-style="glass"]) .search-input { font-size: 16px; }
      :host([data-style="glass"]) .tab { border-radius: 999px; padding: 7px 13px; }
      :host([data-style="glass"]) .tab.active { background: ${t.chip}; box-shadow: inset 0 1px 0 ${t.hi}, 0 0 0 1px ${t.chipEdge}; }
      :host([data-style="glass"]) .lesson-row { border-radius: 20px; }
      :host([data-style="glass"]) .lesson-swipe-content { border-radius: 20px; color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.08); }
      :host([data-style="glass"]) .lesson-delete-btn { border-radius: 0 20px 20px 0; }
      :host([data-style="glass"]) .sheet-backdrop { background: ${t.scrim}; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); padding: 12px; box-sizing: border-box; }
      :host([data-style="glass"]) .sheet {
        background: ${t.sheet}; border: 1px solid ${t.sheetEdge}; border-radius: 34px; padding: 20px;
        -webkit-backdrop-filter: blur(40px) saturate(180%); backdrop-filter: blur(40px) saturate(180%);
        box-shadow: 0 24px 64px rgba(0,0,0,${light ? "0.25" : "0.45"}), inset 0 1px 0 ${t.hi};
      }
      :host([data-style="glass"]) .sheet-group { background: ${t.chip}; border: 1px solid ${t.chipEdge}; border-radius: 20px; box-shadow: inset 0 1px 0 ${t.hi}; }
      :host([data-style="glass"]) .row, :host([data-style="glass"]) .row.selectable, :host([data-style="glass"]) .attachment-row { border-bottom-color: ${t.line}; }
      :host([data-style="glass"]) .view-notes, :host([data-style="glass"]) .ai-answer-card { color: ${t.ink}; }
      :host([data-style="glass"]) .mins-input, :host([data-style="glass"]) .time-input, :host([data-style="glass"]) .day-chip,
      :host([data-style="glass"]) .text-input.small, :host([data-style="glass"]) .attachment-url-input { background: ${t.fill}; }
      :host([data-style="glass"]) .mins-input, :host([data-style="glass"]) .text-input { color: ${t.text}; }
      :host([data-style="glass"]) .time-input { color-scheme: ${t.scheme}; }
      :host([data-style="glass"]) .day-chip.active { background: var(--tt-accent-fill); color: #fff; }
      :host([data-style="glass"]) .slider { background: ${t.track}; }
      :host([data-style="glass"]) .swatch.selected { box-shadow: 0 0 0 2px ${t.sheetSolid}, 0 0 0 4px ${t.text}; }
      :host([data-style="glass"]) .ai-stat-tap:not(:disabled):active { background: ${t.chip}; }
    `;
  }

  _baseStyles() {
    return `
      :host {
        --tt-bg: #1c1c1e;
        --tt-surface: rgba(255,255,255,0.06);
        --tt-text: #ffffff;
        --tt-text-dim: #8e8e93;
        --tt-accent: ${this._accentVar()};
        --tt-list-max-height: ${Number(this._config.max_list_height) > 0 ? this._config.max_list_height : 340}px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
      }
      .card {
        background: var(--tt-bg);
        border-radius: 18px;
        padding: 14px 14px 18px;
        color: var(--tt-text);
        overflow: hidden;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .topbar-right {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .icon-btn {
        background: none;
        border: none;
        color: var(--tt-accent);
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
      }
      .tabs {
        display: flex;
        gap: 4px;
        overflow-x: auto;
        margin-bottom: 12px;
        scrollbar-width: none;
      }
      .tabs::-webkit-scrollbar { display: none; }
      .search-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--tt-surface);
        border-radius: 10px;
        padding: 8px 10px;
        margin-bottom: 12px;
      }
      .search-icon {
        display: flex;
        align-items: center;
        color: var(--tt-text-dim);
        flex-shrink: 0;
      }
      .search-input {
        flex: 1;
        min-width: 0;
        background: none;
        border: none;
        outline: none;
        color: var(--tt-text);
        font-size: 15px;
        font-family: inherit;
      }
      .search-input::placeholder { color: var(--tt-text-dim); }
      .search-clear-btn { flex-shrink: 0; color: var(--tt-text-dim); }
      .search-results-label {
        font-size: 13px;
        color: var(--tt-text-dim);
        margin-bottom: 10px;
        padding: 0 2px;
      }
      .tab {
        flex: 0 0 auto;
        background: none;
        border: none;
        color: var(--tt-text-dim);
        font-size: 15px;
        font-weight: 700;
        padding: 6px 10px;
        border-radius: 10px;
        cursor: pointer;
      }
      .tab.active {
        color: var(--tt-text);
        background: var(--tt-surface);
      }
      .lesson-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .scroll-region {
        height: var(--tt-list-max-height);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .lesson-row {
        position: relative;
        overflow: hidden;
        border-radius: 14px;
        isolation: isolate;
        flex-shrink: 0;
        background: var(--tt-bg);
      }
      .lesson-swipe-content {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 14px;
        cursor: pointer;
        position: relative;
        z-index: 1;
        width: 100%;
        box-sizing: border-box;
        border-radius: 14px;
        transition: transform 0.2s ease;
      }
      .lesson-delete-btn {
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        width: 78px;
        background: ${this._delFillVar()};
        border: none;
        border-radius: 0 14px 14px 0;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 0;
      }
      .lesson-time {
        font-size: 15px;
        font-weight: 600;
        color: rgba(255,255,255,0.85);
        min-width: 44px;
      }
      .lesson-title {
        font-size: 19px;
        font-weight: 700;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lesson-meta {
        display: flex;
        gap: 6px;
        opacity: 0.85;
        flex-shrink: 0;
      }
      .next-pill {
        background: white;
        color: #1c1c1e;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 999px;
      }
      .empty {
        padding: 30px 10px;
        text-align: center;
        color: var(--tt-text-dim);
        font-size: 14px;
      }

      .sheet-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        z-index: 1000;
      }
      .sheet {
        background: #1c1c1e;
        width: 100%;
        max-width: 480px;
        max-height: 85vh;
        overflow-y: auto;
        border-radius: 18px 18px 0 0;
        padding: 16px;
        color: var(--tt-text);
        font-family: inherit;
      }
      .sheet-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        font-size: 17px;
        font-weight: 700;
        margin-bottom: 14px;
      }
      .sheet-header > *:first-child { justify-self: start; }
      .sheet-header > *:last-child { justify-self: end; }
      .link-btn {
        background: none;
        border: none;
        color: var(--tt-accent);
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
      }
      .link-btn.primary { font-weight: 700; }
      .sheet-group {
        background: var(--tt-surface);
        border-radius: 12px;
        margin-bottom: 14px;
        overflow: hidden;
      }
      .sheet-subheader {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--tt-text-dim);
        padding: 10px 12px 2px;
      }
      .view-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 12px 6px;
      }
      .view-color-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .view-title {
        font-size: 19px;
        font-weight: 700;
        color: var(--tt-text);
      }
      .view-notes {
        padding: 4px 12px 14px;
        font-size: 14px;
        color: rgba(255,255,255,0.75);
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .row-value.view-tap-value {
        color: var(--tt-accent);
        font-weight: 700;
      }
      .view-tap-hint {
        font-size: 11.5px;
        color: var(--tt-text-dim);
        padding: 6px 12px 14px;
        text-align: center;
      }
      .copy-value-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .copy-btn {
        flex-shrink: 0;
        padding: 2px;
        color: var(--tt-accent);
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        font-size: 15px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .row:last-child { border-bottom: none; }
      .row.selectable {
        cursor: pointer;
        width: 100%;
        background: none;
        border: none;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        font-family: inherit;
        color: inherit;
        text-align: left;
      }
      .row.selectable:last-child { border-bottom: none; }
      .row-value {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--tt-text-dim);
      }
      .action-row {
        width: 100%;
        text-align: left;
        color: var(--tt-accent);
        background: none;
        border: none;
        font-size: 15px;
        cursor: pointer;
      }
      .danger-row {
        width: 100%;
        text-align: center;
        color: ${this._delTextVar()};
        background: none;
        border: none;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        padding: 12px;
      }
      .switch { position: relative; width: 44px; height: 26px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; inset: 0; background: #39393d;
        border-radius: 999px; transition: 0.15s; cursor: pointer;
      }
      .slider::before {
        content: ""; position: absolute; width: 22px; height: 22px;
        left: 2px; top: 2px; background: white; border-radius: 50%; transition: 0.15s;
      }
      .switch input:checked + .slider { background: ${this._swVar()}; }
      .switch input:checked + .slider::before { transform: translateX(18px); }
      .mins-input {
        width: 46px;
        background: rgba(255,255,255,0.1);
        border: none;
        border-radius: 6px;
        color: white;
        text-align: center;
        padding: 4px;
        font-size: 15px;
      }
      .time-input {
        background: rgba(255,255,255,0.12);
        border: none;
        border-radius: 10px;
        color: var(--tt-text);
        font-size: 19px;
        font-weight: 700;
        font-family: inherit;
        padding: 8px 14px;
        min-width: 96px;
        text-align: center;
        color-scheme: dark;
      }
      .time-input::-webkit-datetime-edit { padding: 0; }

      .day-picker {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 12px;
      }
      .day-chip {
        background: rgba(255,255,255,0.1);
        border: none;
        color: var(--tt-text-dim);
        font-size: 13px;
        font-weight: 600;
        padding: 8px 12px;
        border-radius: 999px;
        cursor: pointer;
      }
      .day-chip.active { background: var(--tt-accent); color: white; }

      .text-input {
        width: 100%;
        box-sizing: border-box;
        background: none;
        border: none;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        outline: none;
        color: white;
        font-size: 15px;
        padding: 12px;
        font-family: inherit;
      }
      .text-input:last-child { border-bottom: none; }
      .text-input.small { border-bottom: none; padding: 6px 8px; background: rgba(255,255,255,0.08); border-radius: 8px; margin-right: 6px; }
      .notes-input { resize: vertical; min-height: 120px; }
      .text-input::placeholder { color: var(--tt-text-dim); }

      .color-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        padding: 14px;
      }
      .swatch {
        width: 34px; height: 34px; border-radius: 50%;
        border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .swatch.selected { box-shadow: 0 0 0 2px #1c1c1e, 0 0 0 4px white; }

      .attachment-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .attachment-row:last-child { border-bottom: none; }
      .attachment-link {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--tt-accent);
        text-decoration: none;
        font-size: 14px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .attachment-link span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .remove-attachment { color: ${this._delTextVar()}; flex: 0 0 auto; }
      .attachment-add-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 12px;
      }
      .attachment-url-input { border-bottom: none !important; padding: 8px !important; background: rgba(255,255,255,0.08); border-radius: 8px; }
      .file-input-hidden { display: none; }

      @keyframes ttSpin { to { transform: rotate(360deg); } }
      .tt-spin { animation: ttSpin 0.8s linear infinite; }
      .ai-primary-btn {
        color: var(--tt-accent);
        font-weight: 700;
        text-align: center;
      }
      .ai-answer-card {
        padding: 12px;
        font-size: 13.5px;
        line-height: 1.5;
        color: rgba(255,255,255,0.85);
      }
      .ai-answer-card strong {
        color: var(--tt-accent);
        font-weight: 700;
      }
      .ai-empty-card {
        padding: 12px;
        font-size: 12.5px;
        color: var(--tt-text-dim);
        text-align: center;
      }
      .ai-disclaimer {
        font-size: 10.5px;
        color: var(--tt-text-dim);
        text-align: center;
        padding: 4px 12px 14px;
        line-height: 1.4;
      }
      .ai-stats-row {
        display: flex;
        gap: 10px;
        padding: 14px;
      }
      .ai-stat {
        flex: 1;
        text-align: center;
      }
      .ai-stat-tap {
        background: none;
        border: none;
        font-family: inherit;
        cursor: pointer;
        padding: 4px;
        border-radius: 10px;
      }
      .ai-stat-tap:disabled { cursor: default; opacity: 0.6; }
      .ai-stat-tap:not(:disabled):active { background: rgba(255,255,255,0.06); }
      .ai-stat-value {
        font-size: 20px;
        font-weight: 700;
        color: var(--tt-accent);
      }
      .ai-stat-label {
        font-size: 11px;
        color: var(--tt-text-dim);
        margin-top: 2px;
      }
      .ai-menu-item { color: var(--tt-accent); text-align: center; }
      .resource-links {
        display: flex;
        flex-direction: column;
        padding: 0 12px 12px;
        gap: 8px;
      }
      .resource-links .attachment-link { font-size: 15px; font-weight: 600; }
      .ai-tips-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--tt-text-dim);
        padding: 4px 12px 0;
      }
    `;
  }
}

if (!customElements.get("turkey-timetable-card")) customElements.define("turkey-timetable-card", TurkeyTimetableCard);

// --- Visual editor - same section-title/card-block/toggle-switch aesthetic
// as the CrowAI Media Player card, using HA's own theme variables so it
// follows whatever light/dark theme the dashboard is on.

class TurkeyTimetableCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._initialized = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) this._render();
  }

  setConfig(config) {
    this._config = { ...DEFAULT_CARD_CONFIG, ...(config || {}) };
    if (!this._initialized && this._hass) this._render();
  }

  _updateConfig(key, value) {
    this._config = { ...this._config, [key]: value };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _toggleRow(id, label, description, checked) {
    return `
      <div class="toggle-item ai-dep">
        <div style="flex:1;">
          <div class="toggle-label">${label}</div>
          <div class="toggle-desc">${description}</div>
        </div>
        <label class="toggle-switch"><input type="checkbox" id="${id}" ${checked ? "checked" : ""}><span class="toggle-track"></span></label>
      </div>`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    this._initialized = true;
    const c = this._config;
    const root = this.shadowRoot;

    root.innerHTML = `
      <style>
        .container { display: flex; flex-direction: column; gap: 18px; padding: 12px; color: var(--primary-text-color); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; }
        .card-block { background: var(--card-background-color); border: 1px solid var(--divider-color, rgba(128,128,128,0.2)); border-radius: 12px; padding: 12px; }
        .toggle-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--divider-color, rgba(128,128,128,0.14)); }
        .toggle-item:first-child { border-top: none; padding-top: 0; }
        .toggle-label { font-size: 14px; font-weight: 500; }
        .toggle-desc { font-size: 11px; color: #888; margin-top: 2px; line-height: 1.4; }
        .toggle-switch { position: relative; flex-shrink: 0; width: 44px; height: 26px; margin-top: 2px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .toggle-track { position: absolute; inset: 0; border-radius: 26px; background: rgba(120,120,128,0.32); cursor: pointer; transition: background 0.2s; }
        .toggle-track::after { content: ''; position: absolute; width: 22px; height: 22px; border-radius: 50%; background: #fff; top: 2px; left: 2px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: transform 0.2s; }
        .toggle-switch input:checked + .toggle-track { background: #34C759; }
        .toggle-switch input:checked + .toggle-track::after { transform: translateX(18px); }
        .field-label { font-size: 13px; font-weight: 500; margin: 14px 0 6px; color: var(--primary-text-color); }
        .field-label:first-child { margin-top: 0; }
        .field-desc { font-size: 11px; color: #888; margin-bottom: 8px; line-height: 1.4; }
        select, input[type="number"] {
          width: 100%; box-sizing: border-box; background: var(--card-background-color, rgba(255,255,255,0.07));
          border: 1px solid var(--divider-color, rgba(128,128,128,0.2)); border-radius: 10px;
          color: var(--primary-text-color); font-size: 13px; font-family: inherit; padding: 10px 12px; outline: none;
        }
        select { -webkit-appearance: none; cursor: pointer; }
        .agent-note { margin-top: 10px; padding: 8px 10px; background: rgba(99,179,237,0.06); border: 1px solid rgba(99,179,237,0.12); border-radius: 8px; font-size: 10px; color: var(--secondary-text-color, rgba(0,0,0,0.5)); line-height: 1.5; }
        .ai-dep { transition: opacity 0.15s; }
        .hint { font-size: 11px; color: #888; line-height: 1.4; margin-bottom: 8px; }
        .seg { display: flex; padding: 2px; gap: 2px; border-radius: 10px; background: rgba(120,120,128,0.16); }
        .seg-btn { flex: 1; border: none; border-radius: 8px; padding: 8px 6px; cursor: pointer; background: transparent; color: var(--primary-text-color); font-family: inherit; font-size: 13px; font-weight: 600; transition: background .15s, box-shadow .15s; }
        .seg-btn.is-selected { background: var(--card-background-color, #fff); box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
        .range-row { display: flex; align-items: center; gap: 10px; }
        .range-row span { font-size: 11px; color: #888; flex-shrink: 0; }
        .range-row input[type="range"] { flex: 1; accent-color: #007AFF; margin: 4px 0; padding: 0; }
        .preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
        .preset-opt { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 12px; cursor: pointer; background: rgba(128,128,128,0.06); color: var(--primary-text-color); border: 2px solid transparent; font-family: inherit; font-size: 13px; font-weight: 600; transition: border-color .15s, background .15s; }
        .preset-opt.is-selected { border-color: #007AFF; background: rgba(0,122,255,0.08); }
        .preset-dots { display: inline-flex; }
        .preset-dots i { width: 14px; height: 14px; border-radius: 50%; margin-left: -4px; border: 1.5px solid var(--card-background-color, #fff); }
        .preset-dots i:first-child { margin-left: 0; }
        .colour-card { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--divider-color, rgba(128,128,128,0.14)); }
        .colour-swatch { position: relative; width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; overflow: hidden; border: 1px solid rgba(128,128,128,0.25); }
        .colour-swatch input[type="color"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: none; padding: 0; }
        .colour-swatch-preview { position: absolute; inset: 0; pointer-events: none; }
        .colour-info { flex: 1; min-width: 0; }
        .colour-label { font-size: 14px; font-weight: 500; }
        .colour-hex-row { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
        .colour-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); flex-shrink: 0; }
        .colour-hex { flex: 1; font-size: 12px; font-family: monospace; border: none; background: none; color: var(--secondary-text-color, #888); padding: 0; width: auto; }
        .colour-hex:focus { outline: none; color: var(--primary-text-color); }
        .color-prev { display: flex; gap: 4px; flex-shrink: 0; }
        .pv { width: 30px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; border: 1px solid rgba(128,128,128,0.25); }
        .reset-btn { border: none; background: none; color: #007AFF; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 2px; flex-shrink: 0; }
      </style>
      <div class="container">
        <div>
          <div class="section-title"><ha-icon icon="mdi:creation" style="--mdc-icon-size: 15px; vertical-align: -3px;"></ha-icon> AI Settings</div>
          <div class="card-block">
            <div class="toggle-item" style="border-top:none;padding-top:0;">
              <div style="flex:1;">
                <div class="toggle-label">Enable AI Features</div>
                <div class="toggle-desc">Master switch for Ask Your Timetable, Quick Add, Weekly Overview, Fun Fact, and Lesson Resources. Off: none of these appear anywhere in the card, and everything else works as normal. Requires a conversation agent when on.</div>
              </div>
              <label class="toggle-switch"><input type="checkbox" id="ai_features_enabled" ${c.ai_features_enabled ? "checked" : ""}><span class="toggle-track"></span></label>
            </div>

            <div class="ai-dep">
              <div class="field-label">AI Agent</div>
              <div class="field-desc">Used for all five AI features below.</div>
              <select id="ai_conversation_agent">
                <option value="">Default (Home Assistant)</option>
              </select>
              <div class="agent-note">Add agents via <strong>Settings \u2192 Voice Assistants</strong>.</div>
            </div>

            <div class="ai-dep">
              <div class="field-label">Exam Board (UK)</div>
              <div class="field-desc">Used by Lesson Resources to tailor the topic overview to your board's structure. Doesn't change which resource sites are linked.</div>
              <select id="exam_board">
                <option value="">None / Not sure</option>
                ${Object.entries(EXAM_BOARD_LABELS)
                  .map(([value, label]) => `<option value="${value}" ${c.exam_board === value ? "selected" : ""}>${label}</option>`)
                  .join("")}
              </select>
            </div>

            <div class="ai-dep">
              <div class="field-label">Year Group (UK)</div>
              <div class="field-desc">Used by Practice Resources to pick the right difficulty, and as a fallback for Lesson Resources when a lesson's subject/notes don't mention a qualification level explicitly.</div>
              <select id="year_group">
                <option value="">Not set</option>
                ${YEAR_GROUP_OPTIONS.map((y) => `<option value="${y}" ${c.year_group === y ? "selected" : ""}>${y}</option>`).join("")}
              </select>
            </div>

            ${this._toggleRow(
              "ai_enable_ask",
              "Ask Your Timetable",
              "A free-text question box, answered from your actual schedule data.",
              c.ai_enable_ask !== false
            )}
            ${this._toggleRow(
              "ai_enable_quick_add",
              "Quick Add",
              "Describe a lesson in a sentence and have it parsed into the New Lesson form for you to check and save.",
              c.ai_enable_quick_add !== false
            )}
            ${this._toggleRow(
              "ai_enable_weekly_overview",
              "Weekly Overview",
              "A one-tap AI summary of the shape of your week, available from Settings.",
              c.ai_enable_weekly_overview !== false
            )}
            ${this._toggleRow(
              "ai_enable_fun_fact",
              "Fun Fact",
              "A short, light AI fact about a lesson's subject, shown in its detail view.",
              c.ai_enable_fun_fact !== false
            )}
            ${this._toggleRow(
              "ai_enable_resources",
              "Lesson Resources",
              "For lessons mentioning a UK qualification level (GCSE, A-Level, etc.), shows an AI overview plus a curated set of study resource links.",
              c.ai_enable_resources !== false
            )}
            ${this._toggleRow(
              "ai_enable_practice_resources",
              "Practice Resources",
              "A different curated set of practice-question sites, plus a short AI note on what to focus on - regenerated fresh each time rather than reused. Uses Year Group as well as any qualification level mentioned in the lesson.",
              c.ai_enable_practice_resources !== false
            )}
          </div>
        </div>

        <div>
          <div class="section-title">Appearance</div>
          <div class="card-block">
            <div class="field-label">Style</div>
            <div class="field-desc">Classic is the card as it was. Glass is a frosted, translucent surface with blur and soft highlights. Lesson colours are never changed.</div>
            <div class="seg">
              <button type="button" class="seg-btn" data-cardstyle="classic">Classic</button>
              <button type="button" class="seg-btn" data-cardstyle="glass">Glass</button>
            </div>
            <div id="glass-only">
              <div class="field-label">Theme</div>
              <div class="field-desc">For the Glass card and its sheets. Auto follows your Home Assistant theme.</div>
              <div class="seg">
                <button type="button" class="seg-btn" data-appearance="auto">Auto</button>
                <button type="button" class="seg-btn" data-appearance="light">Light</button>
                <button type="button" class="seg-btn" data-appearance="dark">Dark</button>
              </div>
              <div class="field-label">Glass</div>
              <div class="field-desc">How see-through the card is (needs a wallpaper or coloured view behind it)</div>
              <div class="range-row"><span>Clear</span><input type="range" id="glass" min="0" max="100" step="5"><span>Frosted</span></div>
            </div>
          </div>
        </div>

        <div>
          <div class="section-title">Colours</div>
          <div class="card-block">
            <div class="field-desc">Preset — one tap sets all three colours, then fine-tune any of them below.</div>
            <div class="preset-grid">
              ${TT_PRESETS.map((pr) => `
                <button type="button" class="preset-opt" data-preset="${pr.id}" aria-pressed="false">
                  <span class="preset-dots">${TT_PRESET_KEYS.map((k) => `<i style="background:${pr.colors[k]}"></i>`).join("")}</span>${pr.name}
                </button>`).join("")}
            </div>
            ${[["accent_color", "Accent", "Buttons, links, the selected day and highlights"], ["delete_color", "Delete", "Swipe-to-delete and destructive actions"], ["switch_color", "Switch", "Toggle switches when turned on"]].map(([k, label, desc]) => `
            <div class="colour-card">
              <label class="colour-swatch">
                <input type="color" data-cinput="${k}" value="#000000">
                <span class="colour-swatch-preview" data-cprev="${k}"></span>
              </label>
              <div class="colour-info">
                <div class="colour-label">${label}</div>
                <div class="hint" style="margin:0;">${desc}</div>
                <div class="colour-hex-row"><span class="colour-dot" data-cdot="${k}"></span><input class="colour-hex" data-chex="${k}" spellcheck="false" autocomplete="off"></div>
              </div>
              <div class="color-prev" title="Glass on a dark theme / light theme"><span class="pv" data-pvd="${k}">Aa</span><span class="pv" data-pvl="${k}">Aa</span></div>
              <button type="button" class="reset-btn" data-creset="${k}" hidden>Reset</button>
            </div>`).join("")}
            <div class="hint" style="margin-top:6px;">In Glass these are adjusted automatically so they stay readable in both light and dark themes; the “Aa” swatches preview that. Lesson colours (the palette when you add a lesson) stay exactly as they are.</div>
          </div>
        </div>
      </div>
    `;

    this._wireListeners();
    this._wireAppearance();
    this._populateAgentSelect();
    this._applyAiDepState();
  }

  // ── Appearance + colours ───────────────────────────────────────────
  _hex6(v) {
    let h = String(v).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return "#" + h.toLowerCase();
  }

  _syncAppearance() {
    const root = this.shadowRoot, cfg = this._config || {}, glassOn = cfg.card_style === "glass";
    root.querySelectorAll(".seg-btn[data-cardstyle]").forEach((b) => b.classList.toggle("is-selected", b.dataset.cardstyle === (glassOn ? "glass" : "classic")));
    root.querySelectorAll(".seg-btn[data-appearance]").forEach((b) => b.classList.toggle("is-selected", b.dataset.appearance === (cfg.appearance || "auto")));
    const gl = root.getElementById("glass");
    if (gl) gl.value = Number.isFinite(parseFloat(cfg.glass)) ? parseFloat(cfg.glass) : 50;
    const go = root.getElementById("glass-only");
    if (go) { go.style.opacity = glassOn ? "" : "0.4"; go.style.pointerEvents = glassOn ? "" : "none"; }
    TT_PRESET_KEYS.forEach((k) => {
      const own = /^#[0-9a-fA-F]{3,6}$/.test(cfg[k] || "") ? cfg[k] : null;
      const hex = this._hex6(own || TT_DEFAULTS[k]);
      const set = (sel, fn) => { const el = root.querySelector(sel); if (el) fn(el); };
      set(`[data-cprev="${k}"]`, (el) => { el.style.background = hex; });
      set(`[data-cdot="${k}"]`, (el) => { el.style.background = hex; });
      set(`[data-cinput="${k}"]`, (el) => { el.value = hex; });
      set(`[data-chex="${k}"]`, (el) => { if (root.activeElement !== el) el.value = hex; });
      set(`[data-creset="${k}"]`, (el) => { el.hidden = !own; });
      set(`[data-pvd="${k}"]`, (el) => { el.style.background = CC_SURFACE.dark; el.style.color = tuneColor(hex, true).text; });
      set(`[data-pvl="${k}"]`, (el) => { el.style.background = CC_SURFACE.light; el.style.color = tuneColor(hex, false).text; });
    });
    root.querySelectorAll(".preset-opt").forEach((b) => {
      const pr = TT_PRESETS.find((x) => x.id === b.dataset.preset);
      const on = TT_PRESET_KEYS.every((k) => this._hex6(cfg[k] || TT_DEFAULTS[k]) === this._hex6(pr.colors[k]));
      b.classList.toggle("is-selected", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  _setColour(key, value) {
    if (!isHex(value)) { this._syncAppearance(); return; }
    this._updateConfig(key, this._hex6(value));
    this._syncAppearance();
  }

  _wireAppearance() {
    const root = this.shadowRoot;
    root.querySelectorAll(".seg-btn[data-cardstyle]").forEach((b) => b.addEventListener("click", () => { this._updateConfig("card_style", b.dataset.cardstyle); this._syncAppearance(); }));
    root.querySelectorAll(".seg-btn[data-appearance]").forEach((b) => b.addEventListener("click", () => { this._updateConfig("appearance", b.dataset.appearance); this._syncAppearance(); }));
    const gl = root.getElementById("glass");
    if (gl) gl.addEventListener("input", () => this._updateConfig("glass", Number(gl.value)));
    root.querySelectorAll(".preset-opt").forEach((b) => b.addEventListener("click", () => {
      const pr = TT_PRESETS.find((x) => x.id === b.dataset.preset); if (!pr) return;
      this._config = { ...this._config, ...pr.colors };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      this._syncAppearance();
    }));
    root.querySelectorAll("[data-cinput]").forEach((inp) => {
      const k = inp.dataset.cinput;
      inp.addEventListener("input", () => { const pv = root.querySelector(`[data-cprev="${k}"]`); if (pv) pv.style.background = inp.value; });   // live preview only
      inp.addEventListener("change", () => this._setColour(k, inp.value));
    });
    root.querySelectorAll("[data-chex]").forEach((inp) => inp.addEventListener("change", () => { const v = inp.value.trim(); this._setColour(inp.dataset.chex, v.startsWith("#") ? v : "#" + v); }));
    root.querySelectorAll("[data-creset]").forEach((b) => b.addEventListener("click", () => {
      const cfg = { ...this._config }; delete cfg[b.dataset.creset]; this._config = cfg;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      this._syncAppearance();
    }));
    this._syncAppearance();
  }

  _applyAiDepState() {
    const root = this.shadowRoot;
    const on = this._config.ai_features_enabled === true;
    root.querySelectorAll(".ai-dep").forEach((el) => {
      el.style.opacity = on ? "1" : "0.4";
      el.style.pointerEvents = on ? "" : "none";
    });
  }

  _populateAgentSelect() {
    const select = this.shadowRoot.getElementById("ai_conversation_agent");
    if (!select || !this._hass?.connection) return;
    this._hass.connection.sendMessagePromise({ type: "conversation/agent/list" }).then((resp) => {
      const agents = resp?.agents || [];
      const current = this._config.ai_conversation_agent || "";
      const opts = [`<option value="">Default (Home Assistant)</option>`];
      agents.forEach((a) => {
        if (a.id === "conversation.home_assistant") return;
        opts.push(`<option value="${a.id}" ${current === a.id ? "selected" : ""}>${a.name || a.id}</option>`);
      });
      select.innerHTML = opts.join("");
    }).catch(() => {});
  }

  _wireListeners() {
    const root = this.shadowRoot;
    const q = (sel) => root.querySelector(sel);

    q("#ai_features_enabled").onchange = (e) => {
      this._updateConfig("ai_features_enabled", e.target.checked);
      this._applyAiDepState();
    };

    q("#ai_conversation_agent").onchange = (e) => {
      this._updateConfig("ai_conversation_agent", e.target.value);
    };

    q("#exam_board").onchange = (e) => {
      this._updateConfig("exam_board", e.target.value);
    };

    q("#year_group").onchange = (e) => {
      this._updateConfig("year_group", e.target.value);
    };

    [
      "ai_enable_ask",
      "ai_enable_quick_add",
      "ai_enable_weekly_overview",
      "ai_enable_fun_fact",
      "ai_enable_resources",
      "ai_enable_practice_resources",
    ].forEach((key) => {
      const el = q(`#${key}`);
      if (el) el.onchange = (e) => this._updateConfig(key, e.target.checked);
    });
  }
}

if (!customElements.get("turkey-timetable-card-editor")) customElements.define("turkey-timetable-card-editor", TurkeyTimetableCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "turkey-timetable-card")) window.customCards.push({
  type: "turkey-timetable-card",
  name: "Turkey Timetable Card",
  description: "iOS-style weekly lesson timetable with colours, links, notes and attachments — classic or liquid-glass, light and dark.",
  preview: false,
});
