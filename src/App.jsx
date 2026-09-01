import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Calendar, Gauge, PieChart as PieChartIcon,
  X, Plus, Trash2, Target, Settings as SettingsIcon, Info, RefreshCw,
  Download, Upload, FileSpreadsheet, Smartphone, Camera, AlertTriangle, Share2, PiggyBank, FileText, Check,
  CheckSquare, Square, ListTodo, ChevronUp, ChevronDown,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import * as XLSX from "xlsx";

// ---------- constants ----------
const INK = "#1C2321";
const PAPER = "#F6F3EC";
const PAPER_LINE = "#DED7C4";
const CARD = "#FFFDF9";
const MUTED = "#A79E8C";
const INCOME = "#0F6B5C";
const EXPENSE = "#B5432E";
const GOLD = "#B08D57";
const INDIGO = "#3B5BA5";

const DEFAULT_GOAL = 2500000;
const DEFAULT_SAVING_GOAL = 500000;
const DEFAULT_PAYDAY = 10;
const ONE_SHIFT = 140000;
const TWO_SHIFT = 280000;
const DEFAULT_HOURLY = 12000;
const DEFAULT_DAILY = 130000;

const EXPENSE_CATS = [
  { key: "식비", color: "#B5432E" }, { key: "쇼핑", color: "#C77B4A" },
  { key: "교통", color: "#8C7A5B" }, { key: "고정비", color: "#6B5B4A" },
  { key: "적금/투자", color: "#0F6B5C" }, { key: "기타", color: "#9A9284" },
];
const ASSET_CAT = "적금/투자";
const FIXED_CAT = "고정비";

const DEFAULT_TODO_CATS = [
  { id: "c1", name: "공부", color: "#B5432E" },
  { id: "c2", name: "일정", color: "#C77B4A" },
  { id: "c3", name: "알바/근무", color: "#B08D57" },
  { id: "c4", name: "운동", color: "#3B5BA5" },
  { id: "c5", name: "학교", color: "#0F6B5C" },
];

const DEFAULT_LABELS = [
  { key: "휴무", color: "#6B7A8F" }, { key: "면접", color: "#3B5BA5" },
  { key: "스터디", color: "#0F6B5C" }, { key: "알바", color: "#B08D57" },
  { key: "기타", color: "#9A9284" },
];

const TAX_MODES = {
  "3.3": { label: "원천징수 3.3%", rate: 0.033 },
  "4dae": { label: "4대보험 9.4%", rate: 0.094 },
  none: { label: "비과세/미공제", rate: 0 },
};

const DEFAULT_SHIFT_INFO = {
  A: { label: "A조", short: "A", color: GOLD, time: "" },
  A1: { label: "A1조", short: "A1", color: GOLD, time: "6:30-13:30" },
  A2: { label: "A2조", short: "A2", color: "#C77B4A", time: "7:00-14:00" },
  C: { label: "C조", short: "C", color: INDIGO, time: "" },
  AC: { label: "A/C조", short: "A/C", color: INK, time: "" },
  A1C: { label: "A1/C", short: "A1/C", color: INK, time: "" },
  A2C: { label: "A2/C", short: "A2/C", color: "#6B5B4A", time: "" },
};

const SHIFT_SLOTS = {
  A: ["morning"], A1: ["morning"], A2: ["morning"], C: ["afternoon"],
  AC: ["morning", "afternoon"], A1C: ["morning", "afternoon"], A2C: ["morning", "afternoon"],
};
const COMBO_SHIFTS = new Set(["AC", "A1C", "A2C"]);

const DEFAULT_STORE_PRESETS = [
  { name: "T2 불가리팝업", color: "#B5432E" },
  { name: "T2 현대스면세", color: "#3B5BA5" },
  { name: "T1 C&P", color: "#0F6B5C" },
  { name: "T1 프레쉬", color: "#B08D57" },
  { name: "T1 아디파", color: "#6B5B4A" },
];
const CUSTOM_STORE_PALETTE = ["#8C7A5B", "#9A6B8F", "#4A7A8C", "#A57A3B", "#5B6B4A"];
const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const pad2 = (n) => String(n).padStart(2, "0");
const monthKey = (y, m) => `month:${y}-${pad2(m + 1)}`;
const dateStrKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const won = (n) => (n < 0 ? "-" : "") + Math.abs(Math.round(n || 0)).toLocaleString("ko-KR") + "원";
const uid = () => Math.random().toString(36).slice(2, 10);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const firstWeekday = (y, m) => new Date(y, m, 1).getDay();
const clampDay = (d, dim) => Math.min(Math.max(1, d), dim);
const emptyDay = () => ({ entries: [], label: null, memo: "" });

function storeColor(name, customStores = []) {
  const preset = DEFAULT_STORE_PRESETS.find((s) => s.name === name) || customStores.find((s) => s.name === name);
  if (preset) return preset.color;
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return CUSTOM_STORE_PALETTE[hash % CUSTOM_STORE_PALETTE.length];
}
function labelColorOf(name, customLabels = []) {
  const allLabels = [...DEFAULT_LABELS, ...customLabels];
  return (allLabels.find((l) => l.key === name) || {}).color || MUTED;
}

function computeConflict(entries, customShifts = {}) {
  const shiftMap = { ...DEFAULT_SHIFT_INFO, ...customShifts };
  const work = (entries || []).filter((e) => e.shift && (SHIFT_SLOTS[e.shift] || shiftMap[e.shift]));
  let morning = 0, afternoon = 0;
  work.forEach((e) => {
    const slots = SHIFT_SLOTS[e.shift] || (e.shift.includes("C") && !e.shift.includes("A") ? ["afternoon"] : ["morning"]);
    slots.forEach((slot) => { if (slot === "morning") morning++; else afternoon++; });
  });
  return morning > 1 || afternoon > 1;
}

const DEFAULT_SETTINGS = {
  goal: DEFAULT_GOAL, savingGoal: DEFAULT_SAVING_GOAL, payday: DEFAULT_PAYDAY,
  recurring: [], workType: "fixed", taxMode: "3.3",
  fixedRates: { one: ONE_SHIFT, two: TWO_SHIFT },
  hourlyRate: DEFAULT_HOURLY, dailyRate: DEFAULT_DAILY,
  customStores: [], hiddenStores: [],
  customLabels: [],
  customShifts: {},
  hiddenShifts: [],
  todoCats: DEFAULT_TODO_CATS,
  routines: [], todos: [], 
};

async function loadMonth(y, m) {
  try {
    if (window.storage && window.storage.get) {
      const res = await window.storage.get(monthKey(y, m), false);
      if (res && res.value) return JSON.parse(res.value);
    } else {
      const res = localStorage.getItem(monthKey(y, m));
      if (res) return JSON.parse(res);
    }
  } catch (e) { }
  return { days: {} };
}
async function saveMonth(y, m, data) {
  try {
    if (window.storage && window.storage.set) {
      await window.storage.set(monthKey(y, m), JSON.stringify(data), false);
    } else {
      localStorage.setItem(monthKey(y, m), JSON.stringify(data));
    }
  } catch (e) { console.error("save failed", e); }
}
async function loadSettings() {
  try {
    if (window.storage && window.storage.get) {
      const res = await window.storage.get("settings", false);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        return { ...DEFAULT_SETTINGS, ...parsed, fixedRates: { ...DEFAULT_SETTINGS.fixedRates, ...(parsed.fixedRates || {}) } };
      }
    } else {
      const res = localStorage.getItem("settings");
      if (res) return { ...DEFAULT_SETTINGS, ...JSON.parse(res) };
    }
  } catch (e) { }
  return { ...DEFAULT_SETTINGS };
}
async function saveSettings(s) {
  try {
    if (window.storage && window.storage.set) {
      await window.storage.set("settings", JSON.stringify(s), false);
    } else {
      localStorage.setItem("settings", JSON.stringify(s));
    }
  } catch (e) { console.error("settings save failed", e); }
}
async function listAllMonths() {
  const out = {};
  try {
    if (window.storage && window.storage.list) {
      const res = await window.storage.list("month:", false);
      const keys = (res && res.keys) || [];
      await Promise.all(keys.map(async (k) => {
        try { const r = await window.storage.get(k, false); if (r && r.value) out[k] = JSON.parse(r.value); } catch (e) { }
      }));
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("month:")) {
          out[k] = JSON.parse(localStorage.getItem(k));
        }
      }
    }
  } catch (e) { console.error("list failed", e); }
  return out;
}
function downloadText(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function applyRecurringToMonth(year, month, monthData, recurringList, realToday) {
  if (!recurringList || !recurringList.length) return { data: monthData, changed: false };
  const dim = daysInMonth(year, month);
  const isPastMonth = year < realToday.getFullYear() || (year === realToday.getFullYear() && month < realToday.getMonth());
  const isCurrentMonth = year === realToday.getFullYear() && month === realToday.getMonth();
  if (!isPastMonth && !isCurrentMonth) return { data: monthData, changed: false };

  let changed = false;
  const days = { ...(monthData.days || {}) };
  recurringList.forEach((item) => {
    if (!item.active) return;
    const day = clampDay(item.day, dim);
    if (isCurrentMonth && realToday.getDate() < day) return;
    const dk = pad2(day);
    const existing = days[dk] || emptyDay();
    if (existing.entries.some((e) => e.recurringId === item.id)) return;
    const newEntry = {
      id: uid(), type: item.type, category: item.category, amount: item.amount,
      memo: item.memo ? `(고정) ${item.memo}` : "(고정) 자동등록", recurringId: item.id,
    };
    days[dk] = { ...existing, entries: [...existing.entries, newEntry] };
    changed = true;
  });
  return { data: changed ? { ...monthData, days } : monthData, changed };
}

function generateCalendarPNG(year, month, daysData, customShifts = {}) {
  const shiftMap = { ...DEFAULT_SHIFT_INFO, ...customShifts };
  const width = 1080, height = 2220;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = "700 26px Georgia, serif";
  ctx.fillText("MOA", 56, 90);
  ctx.fillStyle = INK;
  ctx.font = "700 68px Georgia, serif";
  ctx.fillText(`${year}년 ${month + 1}월`, 56, 172);

  const gridLeft = 36, gridRight = 36;
  const cols = 7;
  const cellW = (width - gridLeft - gridRight) / cols;
  const headerY = 226;
  ctx.textAlign = "center";
  ctx.font = "700 24px sans-serif";
  WEEK_LABELS.forEach((w, i) => {
    ctx.fillStyle = i === 0 ? EXPENSE : i === 6 ? INDIGO : MUTED;
    ctx.fillText(w, gridLeft + cellW * i + cellW / 2, headerY);
  });

  const dim = daysInMonth(year, month);
  const fw = firstWeekday(year, month);
  const rows = Math.ceil((dim + fw) / 7);
  const gridTop = headerY + 26;
  const gridBottom = height - 60;
  const cellH = (gridBottom - gridTop) / rows;

  for (let d = 1; d <= dim; d++) {
    const idx = fw + d - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = gridLeft + col * cellW;
    const y = gridTop + row * cellH;

    ctx.strokeStyle = PAPER_LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 6, y + 4, cellW - 12, cellH - 12);

    const dk = pad2(d);
    const dayObj = (daysData || {})[dk];
    const work = dayObj ? (dayObj.entries || []).filter((e) => e.shift) : [];
    const conflict = dayObj ? computeConflict(dayObj.entries, shiftMap) : false;

    ctx.textAlign = "left";
    ctx.fillStyle = col === 0 ? EXPENSE : col === 6 ? INDIGO : INK;
    ctx.font = "700 26px sans-serif";
    ctx.fillText(`${d}`, x + 16, y + 34);

    if (dayObj && dayObj.label) {
      ctx.fillStyle = labelColorOf(dayObj.label);
      ctx.beginPath();
      ctx.arc(x + cellW - 20, y + 26, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (conflict) {
      ctx.fillStyle = EXPENSE;
      ctx.font = "700 20px sans-serif";
      ctx.fillText("⚠️ 중복", x + 16, y + 68);
    } else if (work.length) {
      const first = work[0];
      ctx.fillStyle = storeColor(first.category);
      ctx.font = "600 18px sans-serif";
      ctx.fillText(first.category, x + 16, y + 68);
      ctx.fillStyle = shiftMap[first.shift]?.color || INK;
      ctx.font = "700 20px sans-serif";
      const shiftText = (shiftMap[first.shift]?.label || first.shift) + (work.length > 1 ? ` 외${work.length - 1}` : "");
      ctx.fillText(shiftText, x + 16, y + 96);
    } else if (dayObj && dayObj.label) {
      ctx.fillStyle = labelColorOf(dayObj.label);
      ctx.font = "600 20px sans-serif";
      ctx.fillText(dayObj.label, x + 16, y + 68);
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = "500 18px sans-serif";
  ctx.fillText("모으다 · MOA", width / 2, height - 24);

  return canvas.toDataURL("image/png");
}
function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3.5" style={{ color: active ? INK : MUTED, border: "none", background: "transparent", cursor: "pointer" }}>
      <Icon size={28} strokeWidth={active ? 2.6 : 2.0} />
      <span style={{ fontSize: 14, fontWeight: active ? 800 : 600, letterSpacing: 0.3 }}>{label}</span>
    </button>
  );
}
function TornEdge({ color = PAPER }) {
  return (
    <div style={{
      height: 10, backgroundImage: `radial-gradient(circle at 8px 0px, transparent 6px, ${color} 6.5px)`,
      backgroundSize: "16px 16px", backgroundPosition: "top", backgroundRepeat: "repeat-x", marginTop: -1,
    }} />
  );
}
function Row({ label, value, color, bold, big }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: 13, color: "#6B6455", fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span className="mono" style={{ fontSize: big ? 18 : 14, fontWeight: bold ? 700 : 600, color }}>{won(value)}</span>
    </div>
  );
}
function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 5 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ padding: 0, display: "flex", background: "transparent", border: "none" }}><Info size={13} color={MUTED} /></button>
      {open && (
        <div style={{ position: "absolute", top: 20, left: 0, zIndex: 10, width: 210, background: INK, color: "#F6F3EC", fontSize: 11, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}>{text}</div>
      )}
    </span>
  );
}
function SegButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 12.5, fontWeight: 700,
      border: `1.3px solid ${active ? INDIGO : PAPER_LINE}`, background: active ? INDIGO : "transparent", color: active ? "#fff" : INK,
    }}>{children}</button>
  );
}

export default function App() {
  const realToday = new Date();
  const [year, setYear] = useState(realToday.getFullYear());
  const [month, setMonth] = useState(realToday.getMonth());
  const [reportYear, setReportYear] = useState(realToday.getFullYear());
  const [reportMonth, setReportMonth] = useState(realToday.getMonth());

  const [tab, setTab] = useState("calendar");
  const [selectedPlannerDate, setSelectedPlannerDate] = useState(dateStrKey(realToday.getFullYear(), realToday.getMonth(), realToday.getDate()));

  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedDay, setSelectedDay] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  
  const [goalEdit, setGoalEdit] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [savingGoalEdit, setSavingGoalEdit] = useState(false);
  const [savingGoalInput, setSavingGoalInput] = useState("");
  const [toast, setToast] = useState("");

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 70) {
      if (tab === "calendar") setTab("daily");
    } else if (distance < -70) {
      if (tab === "daily") setTab("calendar");
    }
    touchStartX.current = 0; touchEndX.current = 0;
  };

  const cacheRef = useRef({});
  useEffect(() => { cacheRef.current = cache; }, [cache]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); }, [toast]);

  const taxRate = (TAX_MODES[settings.taxMode] || TAX_MODES["3.3"]).rate;

  const ensureMonth = useCallback(async (y, m) => {
    const k = monthKey(y, m);
    let existing = cacheRef.current[k];
    if (!existing) {
      const data = await loadMonth(y, m);
      const { data: applied, changed } = applyRecurringToMonth(y, m, data || { days: {} }, settings.recurring || [], new Date());
      cacheRef.current = { ...cacheRef.current, [k]: applied };
      setCache((prev) => ({ ...prev, [k]: applied }));
      if (changed) await saveMonth(y, m, applied);
      return applied;
    }
    return existing;
  }, [settings]);

  useEffect(() => { (async () => { setLoading(true); setSettings(await loadSettings()); setLoading(false); })(); }, []);
  
  useEffect(() => { if (!loading) ensureMonth(year, month); }, [year, month, ensureMonth, loading]);
  useEffect(() => { if (!loading) ensureMonth(reportYear, reportMonth); }, [reportYear, reportMonth, ensureMonth, loading]);
  
  const handleSelectPlannerDate = async (ds) => {
    setSelectedPlannerDate(ds);
    const [y, m] = ds.split("-").map(Number);
    setYear(y);
    setMonth(m - 1);
    await ensureMonth(y, m - 1);
  };

  const saveTodos = async (newTodos) => {
    const updated = { ...settings, todos: newTodos };
    setSettings(updated);
    await saveSettings(updated);
  };
  const addTodo = (text, dateStr, catId) => {
    if (!text.trim()) return;
    const newTodo = { id: uid(), dateStr, text: text.trim(), done: false, catId: catId || (settings.todoCats?.[0]?.id || "c1") };
    saveTodos([...(settings.todos || []), newTodo]);
  };
  const toggleTodo = (id) => {
    const next = (settings.todos || []).map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    saveTodos(next);
  };
  const deleteTodo = (id) => {
    const next = (settings.todos || []).filter((t) => t.id !== id);
    saveTodos(next);
  };

  const moveTodo = (id, direction) => {
    const todos = [...(settings.todos || [])];
    const dateTodos = todos.filter((t) => t.dateStr === selectedPlannerDate);
    const otherTodos = todos.filter((t) => t.dateStr !== selectedPlannerDate);
    
    const index = dateTodos.findIndex((t) => t.id === id);
    if (index === -1) return;
    
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= dateTodos.length) return;

    const temp = dateTodos[index];
    dateTodos[index] = dateTodos[targetIndex];
    dateTodos[targetIndex] = temp;

    saveTodos([...otherTodos, ...dateTodos]);
  };

  const reportPrevMonthIndex = reportMonth === 0 ? 11 : reportMonth - 1;
  const reportPrevMonthYear = reportMonth === 0 ? reportYear - 1 : reportYear;
  const reportPrevData = cache[monthKey(reportPrevMonthYear, reportPrevMonthIndex)] || { days: {} };
  const reportPrevGross = useMemo(() => {
    let sum = 0;
    Object.values(reportPrevData.days || {}).forEach((d) => (d.entries || []).forEach((e) => { if (e.type === "income") sum += e.amount; }));
    return sum;
  }, [reportPrevData]);
  const reportPrevNet = reportPrevGross * (1 - taxRate);

  const [yearScan, setYearScan] = useState({});
  const [yearScanLoaded, setYearScanLoaded] = useState(false);
  
  useEffect(() => {
    if (tab !== "report" && tab !== "analysis") return;
    let cancelled = false;
    setYearScanLoaded(false);
    (async () => {
      const all = await listAllMonths();
      if (cancelled) return;
      const perMonth = {};
      for (let m = 1; m <= 12; m++) {
        const cachedData = cache[monthKey(year, m - 1)];
        const data = cachedData || all[monthKey(year, m - 1)];
        let gross = 0;
        if (data && data.days) {
          Object.values(data.days).forEach((day) => (day.entries || []).forEach((e) => { if (e.type === "income") gross += e.amount; }));
        }
        perMonth[pad2(m)] = gross;
      }
      setYearScan(perMonth);
      setYearScanLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tab, year, cache]);

  const curData = cache[monthKey(year, month)] || { days: {} };
  const reportCurData = cache[monthKey(reportYear, reportMonth)] || { days: {} };
  const combinedShiftInfo = { ...DEFAULT_SHIFT_INFO, ...(settings.customShifts || {}) };

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  const changeReportMonth = (delta) => {
    let m = reportMonth + delta, y = reportYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setReportMonth(m); setReportYear(y);
  };

  const mutateDay = async (dayNum, mutator) => {
    const k = monthKey(year, month);
    const data = cache[k] || { days: {} };
    const dk = pad2(dayNum);
    const dayObj = (data.days || {})[dk] || emptyDay();
    const nextDay = mutator(dayObj);
    const next = { ...data, days: { ...(data.days || {}), [dk]: nextDay } };
    setCache((prev) => ({ ...prev, [k]: next }));
    await saveMonth(year, month, next);
  };

  const addEntry = (dayNum, entry) => mutateDay(dayNum, (d) => ({ ...d, entries: [...(d.entries || []), entry] }));
  const deleteEntry = (dayNum, id) => mutateDay(dayNum, (d) => ({ ...d, entries: (d.entries || []).filter((e) => e.id !== id) }));
  const updateDayMeta = (dayNum, meta) => mutateDay(dayNum, (d) => ({ ...d, ...meta }));

  const monthTotals = useMemo(() => {
    let gross = 0, expense = 0, asset = 0, countA = 0, countC = 0, countFull = 0;
    const workDaySet = new Set();
    const byCat = {};
    if (curData && curData.days) {
      Object.entries(curData.days).forEach(([dk, d]) => (d.entries || []).forEach((e) => {
        if (e.type === "income") {
          gross += e.amount;
          if (e.shift) {
            workDaySet.add(dk);
            const sKey = e.shift;
            if (COMBO_SHIFTS.has(sKey) || sKey.includes("/") || sKey.length > 2) {
              countFull++;
            } else if (sKey.includes("C") && !sKey.includes("A")) {
              countC++;
            } else {
              countA++;
            }
          }
        } else {
          if (e.category === ASSET_CAT) asset += e.amount; else expense += e.amount;
          byCat[e.category] = (byCat[e.category] || 0) + e.amount;
        }
      }));
    }
    const totalGeun = countA + countC + countFull * 2;
    return { gross, expense, asset, byCat, net: gross * (1 - taxRate), workStats: { countA, countC, countFull, workDays: workDaySet.size, totalGeun } };
  }, [curData, taxRate]);

  const reportMonthTotals = useMemo(() => {
    let gross = 0, expense = 0, asset = 0, countA = 0, countC = 0, countFull = 0;
    const workDaySet = new Set();
    const byCat = {};
    if (reportCurData && reportCurData.days) {
      Object.entries(reportCurData.days).forEach(([dk, d]) => (d.entries || []).forEach((e) => {
        if (e.type === "income") {
          gross += e.amount;
          if (e.shift) {
            workDaySet.add(dk);
            const sKey = e.shift;
            if (COMBO_SHIFTS.has(sKey) || sKey.includes("/") || sKey.length > 2) {
              countFull++;
            } else if (sKey.includes("C") && !sKey.includes("A")) {
              countC++;
            } else {
              countA++;
            }
          }
        } else {
          if (e.category === ASSET_CAT) asset += e.amount; else expense += e.amount;
          byCat[e.category] = (byCat[e.category] || 0) + e.amount;
        }
      }));
    }
    const totalGeun = countA + countC + countFull * 2;
    return { gross, expense, asset, byCat, net: gross * (1 - taxRate), workStats: { countA, countC, countFull, workDays: workDaySet.size, totalGeun } };
  }, [reportCurData, taxRate]);

  const yearTotals = useMemo(() => {
    const gross = Object.values(yearScan).reduce((a, b) => a + b, 0);
    return { gross, net: gross * (1 - taxRate), tax: gross * taxRate };
  }, [yearScan, taxRate]);

  const monthlySeries = useMemo(() => {
    const series = [];
    for (let m = 1; m <= 12; m++) {
      const gross = yearScan[pad2(m)] || 0;
      series.push({ month: `${m}월`, gross, net: gross * (1 - taxRate) });
    }
    return series;
  }, [yearScan, taxRate]);

  const isCurrentMonth = year === realToday.getFullYear() && month === realToday.getMonth();
  const expenseToDate = useMemo(() => {
    if (!isCurrentMonth) return 0;
    const todayD = realToday.getDate();
    let sum = 0;
    if (curData && curData.days) {
      Object.entries(curData.days).forEach(([dk, d]) => { if (parseInt(dk, 10) <= todayD) (d.entries || []).forEach((e) => { if (e.type === "expense" && e.category !== ASSET_CAT) sum += e.amount; }); });
    }
    return sum;
  }, [curData, isCurrentMonth]);
  const todaySpent = useMemo(() => {
    if (!isCurrentMonth) return 0;
    const d = curData.days ? curData.days[pad2(realToday.getDate())] : null;
    if (!d) return 0;
    return (d.entries || []).filter((e) => e.type === "expense" && e.category !== ASSET_CAT).reduce((a, e) => a + e.amount, 0);
  }, [curData, isCurrentMonth]);

  const goal = settings.goal || DEFAULT_GOAL;
  const savingGoal = settings.savingGoal || DEFAULT_SAVING_GOAL;
  const achieveRate = Math.min(100, (monthTotals.gross / goal) * 100);
  const remaining = Math.max(0, goal - monthTotals.gross);
  const shiftsNeeded = remaining > 0 ? Math.ceil(remaining / (settings.fixedRates?.two || TWO_SHIFT)) : 0;

  const commitGoal = async () => {
    const n = parseInt(goalInput.replace(/[^0-9]/g, ""), 10);
    if (n > 0) { const s = { ...settings, goal: n }; setSettings(s); await saveSettings(s); }
    setGoalEdit(false);
  };
  const commitSavingGoal = async () => {
    const n = parseInt(savingGoalInput.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n >= 0) { const s = { ...settings, savingGoal: n }; setSettings(s); await saveSettings(s); }
    setSavingGoalEdit(false);
  };

  const patchSettings = async (patch) => { const s = { ...settings, ...patch }; setSettings(s); await saveSettings(s); };
  const saveRecurring = (list) => patchSettings({ recurring: list });
  const addRecurring = (item) => saveRecurring([...(settings.recurring || []), { id: uid(), active: true, ...item }]);
  const toggleRecurring = (id) => saveRecurring((settings.recurring || []).map((r) => (r.id === id ? { ...r, active: !r.active } : r)));
  const deleteRecurring = (id) => saveRecurring((settings.recurring || []).filter((r) => r.id !== id));

  const addStorePreset = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const isHidden = (settings.hiddenStores || []).includes(trimmed);
    if (isHidden) {
      patchSettings({ hiddenStores: (settings.hiddenStores || []).filter((s) => s !== trimmed) });
      return;
    }
    const already = DEFAULT_STORE_PRESETS.some((s) => s.name === trimmed) || (settings.customStores || []).some((s) => s.name === trimmed);
    if (already) return;
    patchSettings({ customStores: [...(settings.customStores || []), { name: trimmed, color: storeColor(trimmed) }] });
  };
  const deleteStorePreset = (name) => {
    const isDefault = DEFAULT_STORE_PRESETS.some((s) => s.name === name);
    if (isDefault) {
      patchSettings({ hiddenStores: [...new Set([...(settings.hiddenStores || []), name])] });
    } else {
      patchSettings({ customStores: (settings.customStores || []).filter((s) => s.name !== name) });
    }
  };
  const resetStorePresets = () => patchSettings({ hiddenStores: [], customStores: [] });

  const copyOffDaysText = () => {
    const dim = daysInMonth(year, month);
    const list = [];
    for (let d = 1; d <= dim; d++) {
      const dk = pad2(d);
      const dayObj = curData.days ? curData.days[dk] : null;
      const wdLabel = WEEK_LABELS[new Date(year, month, d).getDay()];
      if (dayObj && dayObj.label === "휴무") {
        list.push(`${month + 1}/${d}(${wdLabel}) 휴무`);
      }
    }
    if (list.length === 0) {
      setToast("이번 달 설정된 휴무일이 없어요");
      return;
    }
    const fullText = `[${month + 1}월 휴무 일정]\n` + list.join("\n");
    navigator.clipboard.writeText(fullText).then(() => {
      setToast("휴무 일정이 클립보드에 복사되었어요!");
    }).catch(() => {
      setToast("복사에 실패했어요, 다시 시도해주세요");
    });
  };

  const handleBatchScheduleImport = async (parsedMap, storeName) => {
    const k = monthKey(year, month);
    const data = cache[k] || { days: {} };
    const nextDays = { ...(data.days || {}) };

    Object.entries(parsedMap).forEach(([dayNumStr, shiftKey]) => {
      const dk = pad2(parseInt(dayNumStr, 10));
      const existing = nextDays[dk] || emptyDay();
      
      if (shiftKey === "OFF") {
        nextDays[dk] = { ...existing, label: "휴무" };
      } else {
        const amt = COMBO_SHIFTS.has(shiftKey) || shiftKey.includes("/") ? (settings.fixedRates?.two || TWO_SHIFT) : (settings.fixedRates?.one || ONE_SHIFT);
        const newEntry = { id: uid(), type: "income", category: storeName, shift: shiftKey, amount: amt, memo: "" };
        const cleanEntries = (existing.entries || []).filter((e) => !e.shift);
        nextDays[dk] = { ...existing, entries: [...cleanEntries, newEntry] };
      }
    });

    const next = { ...data, days: nextDays };
    setCache((prev) => ({ ...prev, [k]: next }));
    await saveMonth(year, month, next);
    if (storeName) addStorePreset(storeName);
    setToast("엑셀 스케줄이 달력에 자동으로 추가되었어요!");
  };

  const exportBackup = async () => {
    const months = await listAllMonths();
    const payload = { exportedAt: new Date().toISOString(), settings, months };
    const stamp = `${realToday.getFullYear()}${pad2(realToday.getMonth() + 1)}${pad2(realToday.getDate())}`;
    downloadText(`모으다_backup_${stamp}.json`, "application/json", JSON.stringify(payload, null, 2));
    setToast("백업 파일을 다운로드했어요");
  };
  const importBackup = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.settings) { const merged = { ...DEFAULT_SETTINGS, ...parsed.settings }; setSettings(merged); await saveSettings(merged); }
        if (parsed.months) {
          const newCache = { ...cacheRef.current };
          for (const [key, val] of Object.entries(parsed.months)) {
            const ym = key.replace("month:", "");
            const [yy, mm] = ym.split("-").map((x) => parseInt(x, 10));
            if (window.storage && window.storage.set) {
              await window.storage.set(key, JSON.stringify(val), false);
            } else {
              localStorage.setItem(key, JSON.stringify(val));
            }
            newCache[`${yy}-${pad2(mm)}`] = val;
          }
          cacheRef.current = newCache;
          setCache(newCache);
        }
        setToast("복원이 완료됐어요");
      } catch (err) { console.error(err); setToast("복원 실패: 파일을 확인해주세요"); }
    };
    reader.readAsText(file);
  };
  const exportCSV = async () => {
    const months = await listAllMonths();
    const rows = [["날짜", "유형", "카테고리", "조", "금액", "메모"]];
    Object.entries(months).sort().forEach(([key, data]) => {
      const ym = key.replace("month:", "");
      if (data && data.days) {
        Object.entries(data.days).forEach(([dk, dayObj]) => {
          (dayObj.entries || []).forEach((e) => {
            const memo = (e.memo || "").replace(/"/g, "'");
            const sInfo = combinedShiftInfo[e.shift];
            rows.push([`${ym}-${dk}`, e.type === "income" ? "수입" : "지출", e.category, e.shift ? sInfo?.label || e.shift : "", e.amount, `"${memo}"`]);
          });
        });
      }
    });
    const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    downloadText(`모으다_${realToday.getFullYear()}_증빙.csv`, "text/csv;charset=utf-8", csv);
    setToast("CSV 파일을 다운로드했어요");
  };
  const saveWallpaper = () => {
    try {
      const dataUrl = generateCalendarPNG(year, month, curData.days || {}, settings.customShifts || {});
      downloadDataUrl(`모으다_${year}${pad2(month + 1)}_배경화면.png`, dataUrl);
      setToast("배경화면 이미지를 저장했어요");
    } catch (e) { console.error(e); setToast("이미지 생성에 실패했어요"); }
  };

  return (
    <div style={{ background: PAPER, minHeight: "100vh", color: INK, display: "flex", justifyContent: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500;0,700;1,500&family=IBM+Plex+Mono:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap');
        .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
        .display { font-family: 'Newsreader', Georgia, serif; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        body, .app-root { font-family: 'Source Sans 3', ui-sans-serif, system-ui; }
        .cell-tap:active { transform: scale(0.97); }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity:0; transform: translate(-50%, 6px);} to {opacity:1; transform: translate(-50%,0);} }
      `}</style>

      <div
        className="app-root"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ width: "100%", maxWidth: 480, minHeight: "100vh", position: "relative", background: PAPER }}
      >
        <div style={{ borderBottom: `1px solid ${PAPER_LINE}`, padding: "18px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="display" style={{ fontSize: 13, letterSpacing: 3, color: GOLD, fontWeight: 700 }}>MOA</div>
            <div className="display" style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>모으다</div>
          </div>
          <button onClick={() => setSettingsOpen(true)} style={{ padding: 8, marginTop: 4, background: "transparent", border: "none" }}><SettingsIcon size={20} color={INK} /></button>
        </div>

        <InstallBanner />

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED }}>불러오는 중…</div>
        ) : (
          <>
            {tab === "calendar" && (
              <CalendarView
                year={year} month={month} changeMonth={changeMonth} daysData={curData.days || {}}
                onSelectDay={setSelectedDay} onSaveWallpaper={saveWallpaper} onCopyOffDays={copyOffDaysText}
                onOpenImportModal={() => setImportModalOpen(true)}
                customLabels={settings.customLabels || []}
                customShifts={settings.customShifts || {}}
              />
            )}
            {tab === "daily" && (
              <DailyPlannerView
                realToday={realToday}
                selectedDateStr={selectedPlannerDate}
                onSelectDateStr={handleSelectPlannerDate}
                ensureMonth={ensureMonth}
                cache={cache}
                settings={settings}
                onAddTodo={addTodo}
                onToggleTodo={toggleTodo}
                onDeleteTodo={deleteTodo}
                onMoveTodo={moveTodo}
              />
            )}
            {tab === "report" && (
              <ReportView
                reportYear={reportYear} reportMonth={reportMonth} changeReportMonth={changeReportMonth}
                isCurrentMonth={reportYear === realToday.getFullYear() && reportMonth === realToday.getMonth()}
                monthTotals={reportMonthTotals} yearTotals={yearTotals} goal={goal} savingGoal={savingGoal}
                achieveRate={Math.min(100, (reportMonthTotals.gross / goal) * 100)} remaining={Math.max(0, goal - reportMonthTotals.gross)}
                goalEdit={goalEdit} setGoalEdit={setGoalEdit} goalInput={goalInput} setGoalInput={setGoalInput} commitGoal={commitGoal}
                savingGoalEdit={savingGoalEdit} setSavingGoalEdit={setSavingGoalEdit} savingGoalInput={savingGoalInput} setSavingGoalInput={setSavingGoalInput} commitSavingGoal={commitSavingGoal}
                expenseToDate={expenseToDate} todaySpent={todaySpent} realToday={realToday}
                taxMode={settings.taxMode} payday={settings.payday || DEFAULT_PAYDAY} prevNet={reportPrevNet}
                customShifts={settings.customShifts || {}}
              />
            )}
            {tab === "analysis" && <AnalysisView monthTotals={monthTotals} monthlySeries={monthlySeries} yearTotals={yearTotals} year={year} yearScanLoaded={yearScanLoaded} />}
          </>
        )}

        <div style={{ position: "sticky", bottom: 0, display: "flex", background: PAPER, borderTop: `1.5px solid ${PAPER_LINE}`, boxShadow: "0 -4px 20px rgba(0,0,0,0.06)", zIndex: 30 }}>
          <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={Calendar} label="캘린더" />
          <TabButton active={tab === "daily"} onClick={() => setTab("daily")} icon={ListTodo} label="오늘 플래너" />
          <TabButton active={tab === "report"} onClick={() => setTab("report")} icon={Gauge} label="정산" />
          <TabButton active={tab === "analysis"} onClick={() => setTab("analysis")} icon={PieChartIcon} label="분석" />
        </div>

        {selectedDay && (
          <DayModal
            year={year} month={month} day={selectedDay}
            dayObj={curData.days ? curData.days[pad2(selectedDay)] || emptyDay() : emptyDay()}
            settings={settings}
            onClose={() => setSelectedDay(null)}
            onAdd={(entry) => addEntry(selectedDay, entry)}
            onDelete={(id) => deleteEntry(selectedDay, id)}
            onMeta={(meta) => updateDayMeta(selectedDay, meta)}
            onAddStorePreset={addStorePreset}
            onAddTodo={(text, catId) => addTodo(text, dateStrKey(year, month, selectedDay), catId)}
            todos={settings.todos || []}
            onToggleTodo={toggleTodo}
            onDeleteTodo={deleteTodo}
            onPatchSettings={patchSettings}
          />
        )}

        {importModalOpen && (
          <ScheduleImportModal
            onClose={() => setImportModalOpen(false)}
            onImportBatch={handleBatchScheduleImport}
            settings={settings}
          />
        )}

        {settingsOpen && (
          <SettingsModal
            settings={settings}
            onClose={() => setSettingsOpen(false)}
            onPatch={patchSettings}
            onAddRecurring={addRecurring}
            onToggleRecurring={toggleRecurring}
            onDeleteRecurring={deleteRecurring}
            onDeleteStorePreset={deleteStorePreset}
            onResetStorePresets={resetStorePresets}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
            onExportCSV={exportCSV}
          />
        )}

        {toast && (
          <div style={{ position: "fixed", bottom: 90, left: "50%", background: INK, color: "#fff", padding: "10px 18px", borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 80, animation: "fadeIn 0.2s ease-out", whiteSpace: "nowrap" }}>{toast}</div>
        )}
      </div>
    </div>
  );
}

// ---------- DailyPlannerView ----------
function DailyPlannerView({ realToday, selectedDateStr, onSelectDateStr, ensureMonth, cache, settings, onAddTodo, onToggleTodo, onDeleteTodo, onMoveTodo }) {
  const [activeCatId, setActiveCatId] = useState(settings.todoCats?.[0]?.id || "c1");
  const [inputText, setInputText] = useState("");
  const combinedShiftInfo = { ...DEFAULT_SHIFT_INFO, ...(settings.customShifts || {}) };

  const [selY, selM, selD] = selectedDateStr.split("-").map((x) => parseInt(x, 10));
  const selDateObj = new Date(selY, selM - 1, selD);
  const selWd = WEEK_LABELS[selDateObj.getDay()];

  useEffect(() => {
    ensureMonth(selY, selM - 1);
  }, [selY, selM, ensureMonth]);

  const targetMonthKey = monthKey(selY, selM - 1);
  const targetMonthData = cache[targetMonthKey] || { days: {} };
  const selDayData = targetMonthData.days ? targetMonthData.days[pad2(selD)] || emptyDay() : emptyDay();
  const workEntries = (selDayData.entries || []).filter((e) => e.shift);

  const weekDates = useMemo(() => {
    const list = [];
    const curr = new Date(selY, selM - 1, selD);
    const dayOfWeek = curr.getDay();
    curr.setDate(curr.getDate() - dayOfWeek);
    for (let i = 0; i < 7; i++) {
      list.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return list;
  }, [selectedDateStr, selY, selM, selD]);

  const changeWeek = (offsetDays) => {
    const nextDate = new Date(selY, selM - 1, selD);
    nextDate.setDate(nextDate.getDate() + offsetDays);
    onSelectDateStr(dateStrKey(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()));
  };

  const todoCats = settings.todoCats || DEFAULT_TODO_CATS;
  const dateTodos = (settings.todos || []).filter((t) => t.dateStr === selectedDateStr);

  const handleAdd = () => {
    if (!inputText.trim()) return;
    onAddTodo(inputText, selectedDateStr, activeCatId);
    setInputText("");
  };

  return (
    <div style={{ padding: "16px 20px 100px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 2 }}>TODAY PLANNER</div>
      <div className="display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 14 }}>
        {selM}월 {selD}일 ({selWd})
      </div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 14, padding: "10px 8px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
          <button onClick={() => changeWeek(-7)} style={{ fontSize: 12, fontWeight: 700, color: INDIGO, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
            <ChevronLeft size={16} /> 지난주
          </button>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: INK }}>{selY}년 {selM}월</span>
          <button onClick={() => changeWeek(7)} style={{ fontSize: 12, fontWeight: 700, color: INDIGO, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
            다음주 <ChevronRight size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {weekDates.map((d, i) => {
            const ds = dateStrKey(d.getFullYear(), d.getMonth(), d.getDate());
            const isSel = ds === selectedDateStr;
            const isRealToday = ds === dateStrKey(realToday.getFullYear(), realToday.getMonth(), realToday.getDate());
            return (
              <button
                key={i}
                onClick={() => onSelectDateStr(ds)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0", borderRadius: 10,
                  border: isSel ? `1.5px solid ${GOLD}` : "none", background: isSel ? "#FCFAF5" : "transparent", cursor: "pointer"
                }}
              >
                <span style={{ fontSize: 10, color: i === 0 ? EXPENSE : i === 6 ? INDIGO : MUTED, fontWeight: 600 }}>{WEEK_LABELS[i]}</span>
                <span className="mono" style={{ fontSize: 13.5, fontWeight: isSel || isRealToday ? 700 : 500, color: isRealToday ? GOLD : INK, marginTop: 2 }}>
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 4 }}>등록된 근무/일정</div>
        {workEntries.length > 0 ? (
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: storeColor(workEntries[0].category) }}>{workEntries[0].category} </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: combinedShiftInfo[workEntries[0].shift]?.color || INK }}>
              · {combinedShiftInfo[workEntries[0].shift]?.label || workEntries[0].shift}
            </span>
          </div>
        ) : selDayData.label ? (
          <div style={{ fontSize: 14, fontWeight: 700, color: labelColorOf(selDayData.label, settings.customLabels) }}>{selDayData.label}</div>
        ) : (
          <div style={{ fontSize: 12.5, color: MUTED }}>등록된 일정이 없어요. 캘린더에서 클릭해 추가해보세요.</div>
        )}
      </div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, marginBottom: 8 }}>카테고리 선택</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {todoCats.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCatId(cat.id)}
              style={{
                padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1.3px solid ${activeCatId === cat.id ? cat.color : PAPER_LINE}`,
                background: activeCatId === cat.id ? cat.color : "transparent",
                color: activeCatId === cat.id ? "#fff" : INK,
                cursor: "pointer"
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            placeholder={`+ [${todoCats.find((c) => c.id === activeCatId)?.name || '일반'}] 할 일 추가`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 13 }}
          />
          <button onClick={handleAdd} style={{ background: INK, color: "#fff", border: "none", borderRadius: 10, padding: "0 14px", fontWeight: 700, cursor: "pointer" }}>추가</button>
        </div>

        {todoCats.map((cat) => {
          const catTodos = dateTodos.filter((t) => t.catId === cat.id);
          if (catTodos.length === 0) return null;
          return (
            <div key={cat.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: cat.color, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: cat.color }} />
                {cat.name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {catTodos.map((item, idx) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${PAPER_LINE}` }}>
                    <button onClick={() => onToggleTodo(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", flex: 1 }}>
                      {item.done ? <CheckSquare size={18} color={cat.color} /> : <Square size={18} color={MUTED} />}
                      <span style={{ fontSize: 13.5, color: item.done ? MUTED : INK, textDecoration: item.done ? "line-through" : "none", fontWeight: item.done ? 400 : 600 }}>
                        {item.text}
                      </span>
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => onMoveTodo(item.id, "up")} disabled={idx === 0} style={{ padding: 2, background: "transparent", border: "none", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={15} color={INK} /></button>
                      <button onClick={() => onMoveTodo(item.id, "down")} disabled={idx === catTodos.length - 1} style={{ padding: 2, background: "transparent", border: "none", cursor: idx === catTodos.length - 1 ? "not-allowed" : "pointer", opacity: idx === catTodos.length - 1 ? 0.3 : 1 }}><ChevronDown size={15} color={INK} /></button>
                      <button onClick={() => onDeleteTodo(item.id)} style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer" }}><Trash2 size={15} color="#C9BFA8" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {dateTodos.length === 0 && (
          <div style={{ fontSize: 12, color: MUTED, textAlign: "center", padding: "20px 0" }}>등록된 할 일이 없어요. 위 입력창에서 할 일을 추가해 보세요!</div>
        )}
      </div>
    </div>
  );
}

// ---------- Install Banner ----------
function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      let dismissed = false;
      try {
        if (window.storage && window.storage.get) {
          const res = await window.storage.get("installBannerDismissed", false);
          dismissed = !!(res && res.value === "1");
        } else {
          dismissed = localStorage.getItem("installBannerDismissed") === "1";
        }
      } catch (e) { }
      const isStandalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      setVisible(!dismissed && !isStandalone && isMobile);
      setReady(true);
    })();
  }, []);
  const dismiss = async () => {
    setVisible(false);
    try {
      if (window.storage && window.storage.set) {
        await window.storage.set("installBannerDismissed", "1", false);
      } else {
        localStorage.setItem("installBannerDismissed", "1");
      }
    } catch (e) { }
  };
  if (!ready || !visible) return null;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <div style={{ margin: "14px 14px 0", background: INK, color: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Smartphone size={20} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>홈 화면에 추가하세요</div>
          <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.45 }}>
            {isIOS ? "Safari 공유 버튼 → '홈 화면에 추가'를 누르면 아이콘처럼 켤 수 있어요." : "브라우저 메뉴 → '홈 화면에 추가'를 선택하면 아이콘처럼 켤 수 있어요."}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={dismiss} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 12, cursor: "pointer" }}>닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- CalendarView (시간 및 복수 조 깔끔한 출력 최적화) ----------
function CalendarView({ year, month, changeMonth, daysData, onSelectDay, onSaveWallpaper, onCopyOffDays, onOpenImportModal, customLabels = [], customShifts = {} }) {
  const dim = daysInMonth(year, month);
  const fw = firstWeekday(year, month);
  const cells = [];
  for (let i = 0; i < fw; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  const isToday = (d) => { const t = new Date(); return d === t.getDate() && month === t.getMonth() && year === t.getFullYear(); };

  const allLabels = [...DEFAULT_LABELS, ...customLabels];
  const combinedShiftInfo = { ...DEFAULT_SHIFT_INFO, ...customShifts };

  return (
    <div style={{ padding: "14px 14px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => changeMonth(-1)} style={{ padding: 8, background: "transparent", border: "none" }}><ChevronLeft size={20} color={INK} /></button>
        <div className="display" style={{ fontSize: 19, fontWeight: 700 }}>{year}년 {month + 1}월</div>
        <button onClick={() => changeMonth(1)} style={{ padding: 8, background: "transparent", border: "none" }}><ChevronRight size={20} color={INK} /></button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={onOpenImportModal} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, border: `1.3px solid ${INDIGO}`, color: INDIGO, background: "transparent", borderRadius: 12, padding: "8px 0", fontWeight: 700, fontSize: 11.5 }}>
          <FileText size={14} /> 스케줄 스캔
        </button>
        <button onClick={onSaveWallpaper} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, border: `1.3px solid ${GOLD}`, color: GOLD, background: "transparent", borderRadius: 12, padding: "8px 0", fontWeight: 700, fontSize: 11.5 }}>
          <Camera size={14} /> 배경화면 저장
        </button>
        <button onClick={onCopyOffDays} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, border: `1.3px solid ${EXPENSE}`, color: EXPENSE, background: "transparent", borderRadius: 12, padding: "8px 0", fontWeight: 700, fontSize: 11.5 }}>
          <Share2 size={14} /> 휴무일 복사
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
        {WEEK_LABELS.map((w) => <div key={w} style={{ textAlign: "center", fontSize: 11, color: MUTED, fontWeight: 600, padding: "4px 0" }}>{w}</div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, width: "100%", boxSizing: "border-box" }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} style={{ minHeight: 110 }} />;
          const dk = pad2(d);
          const dayObj = daysData[dk];
          const work = dayObj ? (dayObj.entries || []).filter((e) => e.shift) : [];
          const conflict = dayObj ? computeConflict(dayObj.entries, combinedShiftInfo) : false;
          const hasContent = !!(dayObj && (dayObj.entries.length || dayObj.label));
          const wd = new Date(year, month, d).getDay();

          return (
            <button key={i} onClick={() => onSelectDay(d)} className="cell-tap" style={{
              minHeight: 110, width: "100%", boxSizing: "border-box",
              border: conflict ? `1.6px solid ${EXPENSE}` : isToday(d) ? `1.6px solid ${GOLD}` : `1px solid ${PAPER_LINE}`,
              borderRadius: 10, background: hasContent ? "#FCFAF5" : "transparent", display: "flex", flexDirection: "column",
              alignItems: "flex-start", justifyContent: "flex-start", padding: "5px 4px", position: "relative", textAlign: "left",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: isToday(d) ? 700 : 600, color: isToday(d) ? GOLD : (wd === 0 ? EXPENSE : wd === 6 ? INDIGO : INK) }}>
                  {d}
                </span>
                {dayObj?.label && <span style={{ width: 6, height: 6, borderRadius: 6, background: labelColorOf(dayObj.label, customLabels), flexShrink: 0 }} />}
              </div>

              {/* ✅ [화면 표시 개선] 매장명, 조 이름, 세부 시간까지 스크린샷 느낌처럼 칸 안에 완벽하게 표현 */}
              <div style={{ marginTop: 2, width: "100%", lineHeight: 1.15, wordBreak: "break-all" }}>
                {conflict ? (
                  <div style={{ fontSize: 10, fontWeight: 700, color: EXPENSE }}>⚠️ 중복출근</div>
                ) : work.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {work.map((wItem, wIdx) => {
                      const sInfo = combinedShiftInfo[wItem.shift];
                      return (
                        <div key={wItem.id || wIdx} style={{ fontSize: 9.5, borderBottom: wIdx < work.length - 1 ? `1px dashed ${PAPER_LINE}` : "none", paddingBottom: 2 }}>
                          <div style={{ fontWeight: 600, color: storeColor(wItem.category), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {wItem.category}
                          </div>
                          <div className="mono" style={{ fontWeight: 700, color: sInfo?.color || INK, fontSize: 9.5 }}>
                            {sInfo?.label || wItem.shift}
                          </div>
                          {sInfo?.time && (
                            <div className="mono" style={{ fontSize: 8, color: MUTED, whiteSpace: "pre-line", lineHeight: 1.1, marginTop: 1 }}>
                              {sInfo.time}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : dayObj?.label ? (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 600, color: labelColorOf(dayObj.label, customLabels), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dayObj.label}</div>
                    {dayObj.memo && <div style={{ fontSize: 9, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dayObj.memo}</div>}
                  </>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {allLabels.map((l) => (<div key={l.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: MUTED }}><span style={{ width: 6, height: 6, borderRadius: 6, background: l.color, display: "inline-block" }} />{l.key}</div>))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: MUTED, textAlign: "center" }}>날짜를 눌러 근무·지출·일정을 기록하세요 · 왼쪽으로 스와이프하면 오늘 플래너가 열려요</div>
    </div>
  );
}

// ---------- ScheduleImportModal ----------
function ScheduleImportModal({ onClose, onImportBatch, settings }) {
  const [userName, setUserName] = useState("선형윤");
  const [storeName, setStoreName] = useState("T2 불가리팝업");
  const [file, setFile] = useState(null);
  const [parsedPreview, setParsedPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);
  const combinedShiftInfo = { ...DEFAULT_SHIFT_INFO, ...(settings.customShifts || {}) };

  const normalizeShift = (val) => {
    if (!val) return null;
    const str = String(val).trim().toUpperCase().replace(/\s+/g, "");
    if (str === "OFF" || str === "휴무" || str === "휴") return "OFF";
    if (combinedShiftInfo[str]) return str;
    if (str.includes("A1/C") || str.includes("A1C")) return "A1C";
    if (str.includes("A2/C") || str.includes("A2C")) return "A2C";
    if (str.includes("A/C") || str.includes("AC")) return "AC";
    if (str === "A1") return "A1";
    if (str === "A2") return "A2";
    if (str === "A" || str === "A조") return "A";
    if (str === "C" || str === "C조") return "C";
    return str;
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setErrorMsg("");
    setParsedPreview(null);

    const isExcel = f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv");
    if (!isExcel) {
      setErrorMsg("현재 엑셀(.xlsx) 파일 스캔만 지원합니다. 엑셀 스케줄표 파일을 선택해 주세요!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (!data || data.length === 0) {
          setErrorMsg("엑셀 파일이 비어 있거나 내용을 읽을 수 없습니다.");
          return;
        }

        const nameKey = userName.trim();
        if (!nameKey) {
          setErrorMsg("찾으실 유저 이름(예: 선형윤)을 먼저 입력해 주세요.");
          return;
        }

        const mapResult = {};
        let foundUser = false;
        let nameColIndex = -1;
        let dayColIndex = -1;
        let headerRowIndex = -1;

        for (let r = 0; r < Math.min(data.length, 10); r++) {
          const row = data[r];
          for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c]).trim();
            if (cellVal === nameKey) {
              nameColIndex = c;
              headerRowIndex = r;
              foundUser = true;
            }
            if (cellVal.includes("일") || cellVal.includes("날짜") || cellVal === "1") {
              dayColIndex = c;
            }
          }
          if (foundUser) break;
        }

        if (foundUser && nameColIndex !== -1) {
          for (let r = headerRowIndex + 1; r < data.length; r++) {
            const row = data[r];
            if (!row) continue;
            const dayCell = String(row[dayColIndex >= 0 ? dayColIndex : 0]).replace(/[^0-9]/g, "");
            const dayNum = parseInt(dayCell, 10);
            if (dayNum >= 1 && dayNum <= 31) {
              const shiftVal = normalizeShift(row[nameColIndex]);
              if (shiftVal) mapResult[dayNum] = shiftVal;
            }
          }
        } else {
          for (let r = 0; r < data.length; r++) {
            const row = data[r];
            if (!row || row.length === 0) continue;
            const firstCell = String(row[0]).replace(/[^0-9]/g, "");
            const dayNum = parseInt(firstCell, 10);
            if (dayNum >= 1 && dayNum <= 31) {
              for (let c = 1; c < row.length; c++) {
                const cellVal = String(row[c]).trim();
                if (cellVal.includes(nameKey)) {
                  foundUser = true;
                  const headerShift = normalizeShift(data[0]?.[c] || data[1]?.[c]);
                  if (headerShift) mapResult[dayNum] = headerShift;
                }
              }
            }
          }
        }

        if (!foundUser || Object.keys(mapResult).length === 0) {
          setErrorMsg(`엑셀 표 안에서 '${nameKey}' 님의 스케줄을 찾지 못했습니다. 이름이 정확히 일치하는지 확인해 주세요.`);
        } else {
          setParsedPreview(mapResult);
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("엑셀 파일 해석 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(f);
  };

  const applyImport = () => {
    if (!parsedPreview) return;
    onImportBatch(parsedPreview, storeName.trim() || "스캔 매장");
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", justifyContent: "center", alignItems: "flex-end", zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", animation: "slideUp 0.22s ease-out", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>스케줄표 자동 스캔</div>
          <button onClick={onClose} style={{ padding: 6, background: "transparent", border: "none" }}><X size={20} color={MUTED} /></button>
        </div>
        <TornEdge color={CARD} />

        <div style={{ padding: "12px 20px 30px" }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
            매장 엑셀 근무표(.xlsx)를 업로드하면 표 구조를 분석해 '내 이름'에 해당하는 한 달 치 근무 조를 자동으로 달력에 기입해 줍니다.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 4 }}>찾을 유저 이름</div>
              <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="예: 선형윤" style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 13 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 4 }}>등록할 매장명</div>
              <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="예: T2 불가리팝업" style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 13 }} />
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 4 }}>스케줄 엑셀 파일</div>
          <button onClick={() => fileRef.current?.click()} style={{ width: "100%", border: `1.5px dashed ${INDIGO}`, borderRadius: 12, padding: "16px 0", textAlign: "center", background: "#FCFAF5", cursor: "pointer", marginBottom: 14 }}>
            <Upload size={20} color={INDIGO} style={{ margin: "0 auto 6px" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{file ? file.name : "엑셀(.xlsx) 파일 선택하기"}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>백화점 근무표 자동 인식</div>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx, .xls, .csv" style={{ display: "none" }} onChange={handleFileChange} />

          {errorMsg && (
            <div style={{ background: "#FBEAE6", border: `1px solid ${EXPENSE}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: EXPENSE, marginBottom: 14 }}>
              {errorMsg}
            </div>
          )}

          {parsedPreview && (
            <div style={{ border: `1px solid ${PAPER_LINE}`, borderRadius: 12, padding: 12, marginBottom: 16, background: "#FFF" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: INCOME, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                <Check size={14} /> 스캔 완료! ({Object.keys(parsedPreview).length}일 치 스케줄 추출됨)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 110, overflowY: "auto" }}>
                {Object.entries(parsedPreview).map(([d, sKey]) => (
                  <span key={d} style={{ fontSize: 11, background: PAPER, padding: "3px 7px", borderRadius: 6, color: INK }}>
                    {d}일: <strong>{combinedShiftInfo[sKey]?.label || sKey}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={applyImport} disabled={!parsedPreview} style={{ width: "100%", background: parsedPreview ? INK : MUTED, color: "#fff", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: parsedPreview ? "pointer" : "not-allowed" }}>
            내 달력에 스케줄 일괄 반영하기
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- DayModal ----------
function DayModal({ year, month, day, dayObj, settings, onClose, onAdd, onDelete, onMeta, onAddStorePreset, onAddTodo, todos, onToggleTodo, onDeleteTodo, onPatchSettings }) {
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState(EXPENSE_CATS[0].key);
  const [memo, setMemo] = useState("");
  const [dayMemo, setDayMemo] = useState(dayObj.memo || "");
  const [hours, setHours] = useState("8");
  const [units, setUnits] = useState("1");
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherAmt, setOtherAmt] = useState("");
  const [otherMemo, setOtherMemo] = useState("");

  const [todoInput, setTodoInput] = useState("");
  const [selCatId, setSelCatId] = useState(settings.todoCats?.[0]?.id || "c1");

  const [customLabelInput, setCustomLabelInput] = useState("");
  const [customShiftOpen, setCustomShiftOpen] = useState(false);
  const [newShiftKey, setNewShiftKey] = useState("");
  const [newShiftLabel, setNewShiftLabel] = useState("");
  const [newShiftTime, setNewShiftTime] = useState("");
  const [newShiftColor, setNewShiftColor] = useState(INDIGO);

  const dateStr = dateStrKey(year, month, day);
  const dateTodos = (todos || []).filter((t) => t.dateStr === dateStr);
  const todoCats = settings.todoCats || DEFAULT_TODO_CATS;
  const customLabels = settings.customLabels || [];
  const allLabels = [...DEFAULT_LABELS, ...customLabels];
  const combinedShiftInfo = { ...DEFAULT_SHIFT_INFO, ...(settings.customShifts || {}) };

  const hiddenStores = settings.hiddenStores || [];
  const activeDefaults = DEFAULT_STORE_PRESETS.filter((s) => !hiddenStores.includes(s.name));
  const activeCustoms = (settings.customStores || []).filter((s) => !hiddenStores.includes(s.name));
  const allStores = [...activeDefaults, ...activeCustoms];

  const [store, setStore] = useState(allStores[0]?.name || "");
  const [customStore, setCustomStore] = useState("");
  const [useCustomStore, setUseCustomStore] = useState(false);
  const [saveAsPreset, setSaveAsPreset] = useState(true);
  const [shift, setShift] = useState("A");
  const entries = dayObj.entries || [];
  const conflict = computeConflict(entries, combinedShiftInfo);

  const quickIncome = (label, amt, m = "") => onAdd({ id: uid(), type: "income", category: label, amount: amt, memo: m });
  const addExpense = () => {
    const n = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    if (!n) return;
    onAdd({ id: uid(), type: "expense", category: cat, amount: n, memo });
    setAmount(""); setMemo("");
  };
  const addOtherIncome = () => {
    const n = parseInt(otherAmt.replace(/[^0-9]/g, ""), 10);
    if (!n) return;
    onAdd({ id: uid(), type: "income", category: "기타수입", amount: n, memo: otherMemo });
    setOtherAmt(""); setOtherMemo(""); setOtherOpen(false);
  };
  const pickLabel = (key) => onMeta({ label: dayObj.label === key ? null : key });
  const blurDayMemo = () => { if (dayMemo !== (dayObj.memo || "")) onMeta({ memo: dayMemo }); };

  const handleAddCustomLabel = () => {
    const trimmed = customLabelInput.trim();
    if (!trimmed) return;
    if (allLabels.some((l) => l.key === trimmed)) {
      pickLabel(trimmed);
      setCustomLabelInput("");
      return;
    }
    const newLbl = { key: trimmed, color: "#4A7A8C" };
    const updated = [...customLabels, newLbl];
    onPatchSettings({ customLabels: updated });
    onMeta({ label: trimmed });
    setCustomLabelInput("");
  };

  const handleRegisterCustomShift = () => {
    const key = newShiftKey.trim().toUpperCase();
    const label = newShiftLabel.trim() || key;
    if (!key) return;
    const customShifts = settings.customShifts || {};
    const updated = {
      ...customShifts,
      [key]: { label, short: label, color: newShiftColor, time: newShiftTime.trim() }
    };
    onPatchSettings({ customShifts: updated });
    setShift(key);
    setCustomShiftOpen(false);
    setNewShiftKey(""); setNewShiftLabel(""); setNewShiftTime("");
  };

  const handleAddTodoSubmit = () => {
    if (!todoInput.trim()) return;
    onAddTodo(todoInput, selCatId);
    setTodoInput("");
  };

  const workType = settings.workType || "fixed";
  const hourlyPreview = (parseFloat(hours) || 0) * (settings.hourlyRate || DEFAULT_HOURLY);
  const dailyPreview = (parseFloat(units) || 0) * (settings.dailyRate || DEFAULT_DAILY);

  const registerShift = () => {
    let storeName = store;
    if (useCustomStore) {
      storeName = customStore.trim() || "직접입력 매장";
      if (saveAsPreset && onAddStorePreset) onAddStorePreset(storeName);
    }
    const sInfo = combinedShiftInfo[shift];
    const isCombo = COMBO_SHIFTS.has(shift) || shift.includes("/") || (sInfo?.time && sInfo.time.includes("\n"));
    const amt = isCombo ? (settings.fixedRates?.two || TWO_SHIFT) : (settings.fixedRates?.one || ONE_SHIFT);
    onAdd({ id: uid(), type: "income", category: storeName, shift, amount: amt, memo: "" });
    if (useCustomStore) { setUseCustomStore(false); setStore(storeName); setCustomStore(""); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", justifyContent: "center", alignItems: "flex-end", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", borderRadius: "18px 18px 0 0", animation: "slideUp 0.22s ease-out" }}>
        <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>{year}.{pad2(month + 1)}.{pad2(day)}</div>
          <button onClick={onClose} style={{ padding: 6, background: "transparent", border: "none" }}><X size={20} color={MUTED} /></button>
        </div>
        <TornEdge color={CARD} />

        <div style={{ padding: "8px 20px 24px" }}>
          {conflict && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FBEAE6", border: `1px solid ${EXPENSE}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
              <AlertTriangle size={16} color={EXPENSE} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: EXPENSE, fontWeight: 600 }}>⚠️ 시간대 중복 출근 — 같은 시간대에 근무가 두 건 이상 등록되어 있어요</span>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: 0.5 }}>오늘 라벨 (예비군, 중요 일정 등 직접 입력 가능)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {allLabels.map((l) => (
              <button key={l.key} onClick={() => pickLabel(l.key)} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.3px solid ${dayObj.label === l.key ? l.color : PAPER_LINE}`, background: dayObj.label === l.key ? l.color : "transparent", color: dayObj.label === l.key ? "#fff" : INK }}>{l.key}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input placeholder="새 라벨 직접 입력 (예: 예비군)" value={customLabelInput} onChange={(e) => setCustomLabelInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomLabel(); }} style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "7px 10px", fontSize: 12.5 }} />
            <button onClick={handleAddCustomLabel} style={{ background: INDIGO, color: "#fff", border: "none", borderRadius: 10, padding: "0 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>추가</button>
          </div>

          <input placeholder="오늘의 메모 (예: 면접 2차 통과)" value={dayMemo} onChange={(e) => setDayMemo(e.target.value)} onBlur={blurDayMemo}
            style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 20 }} />

          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: 0.5 }}>이 날 할 일(To-Do) 미리 등록</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <select value={selCatId} onChange={(e) => setSelCatId(e.target.value)} style={{ border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "0 8px", fontSize: 12, background: PAPER }}>
              {todoCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="할 일 입력" value={todoInput} onChange={(e) => setTodoInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddTodoSubmit(); }} style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 13 }} />
            <button onClick={handleAddTodoSubmit} style={{ background: INDIGO, color: "#fff", border: "none", borderRadius: 10, padding: "0 12px", fontWeight: 700, fontSize: 12 }}>추가</button>
          </div>

          {dateTodos.length > 0 && (
            <div style={{ marginBottom: 20, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "8px 12px" }}>
              {dateTodos.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                  <span onClick={() => onToggleTodo(t.id)} style={{ fontSize: 12.5, textDecoration: t.done ? "line-through" : "none", color: t.done ? MUTED : INK, cursor: "pointer" }}>
                    {t.done ? "●" : "○"} {t.text}
                  </span>
                  <button onClick={() => onDeleteTodo(t.id)} style={{ padding: 2, background: "transparent", border: "none" }}><Trash2 size={13} color="#C9BFA8" /></button>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: 0.5 }}>수입 입력</div>

          {workType === "fixed" && (
            <div style={{ border: `1px solid ${PAPER_LINE}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>매장</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {allStores.map((s) => (
                  <button key={s.name} onClick={() => { setStore(s.name); setUseCustomStore(false); }} style={{ padding: "6px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: `1.3px solid ${!useCustomStore && store === s.name ? s.color : PAPER_LINE}`, background: !useCustomStore && store === s.name ? s.color : "transparent", color: !useCustomStore && store === s.name ? "#fff" : INK }}>{s.name}</button>
                ))}
                <button onClick={() => setUseCustomStore(true)} style={{ padding: "6px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: `1.3px solid ${useCustomStore ? INDIGO : PAPER_LINE}`, background: useCustomStore ? INDIGO : "transparent", color: useCustomStore ? "#fff" : INK }}>+ 직접입력</button>
              </div>
              {useCustomStore && (
                <div style={{ marginBottom: 10 }}>
                  <input placeholder="매장명 직접 입력" value={customStore} onChange={(e) => setCustomStore(e.target.value)} style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 13, marginBottom: 6 }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTED }}>
                    <input type="checkbox" checked={saveAsPreset} onChange={(e) => setSaveAsPreset(e.target.checked)} />
                    이 매장 프리셋에 저장해두기 (다음에 바로 선택 가능)
                  </label>
                </div>
              )}
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: MUTED }}>근무 조 선택</div>
                <button onClick={() => setCustomShiftOpen((o) => !o)} style={{ fontSize: 11, color: INDIGO, fontWeight: 700, background: "transparent", border: "none", cursor: "pointer" }}>
                  {customShiftOpen ? "닫기" : "+ 새 조(Shift) 직접 만들기"}
                </button>
              </div>

              {customShiftOpen && (
                <div style={{ background: "#FFF", border: `1px solid ${INDIGO}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: INDIGO, marginBottom: 6 }}>커스텀 조 만들기 (예: A1/C1 등 시간 포함)</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input placeholder="조 코드 (예: A1C1)" value={newShiftKey} onChange={(e) => setNewShiftKey(e.target.value)} style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 8, padding: "6px 8px", fontSize: 12 }} />
                    <input placeholder="표시명 (예: A1/C1)" value={newShiftLabel} onChange={(e) => setNewShiftLabel(e.target.value)} style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 8, padding: "6px 8px", fontSize: 12 }} />
                    <input type="color" value={newShiftColor} onChange={(e) => setNewShiftColor(e.target.value)} style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer" }} />
                  </div>
                  <input placeholder="세부 시간 (예: 6:30-13:30 / 14:00-19:00)" value={newShiftTime} onChange={(e) => setNewShiftTime(e.target.value)} style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 8, padding: "6px 8px", fontSize: 12, marginBottom: 6 }} />
                  <button onClick={handleRegisterCustomShift} style={{ width: "100%", background: INDIGO, color: "#fff", border: "none", borderRadius: 8, padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>이 조 등록하고 선택하기</button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                {Object.entries(combinedShiftInfo).map(([key, info]) => (
                  <button key={key} onClick={() => setShift(key)} className="mono" style={{ padding: "8px 2px", borderRadius: 10, border: `1.3px solid ${shift === key ? (info.color || GOLD) : PAPER_LINE}`, background: shift === key ? (info.color || GOLD) : "transparent", color: shift === key ? "#fff" : INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{info.label || key}</span>
                    {info.time && (
                      <span style={{ fontSize: 8.5, opacity: shift === key ? 0.95 : 0.65, marginTop: 1, fontWeight: 500, whiteSpace: "pre-line", textAlign: "center" }}>
                        {info.time}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>단일 조는 1근, 복합/조합 조는 2근으로 계산돼요</div>
              <button onClick={registerShift} style={{ width: "100%", background: INCOME, color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 14 }}>근무 등록</button>
            </div>
          )}

          {workType === "hourly" && (
            <div style={{ border: `1px solid ${PAPER_LINE}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#6B6455" }}>근무 시간</span>
                <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className="mono" style={{ width: 64, border: `1px solid ${PAPER_LINE}`, borderRadius: 8, padding: "6px 8px", fontSize: 14, textAlign: "center" }} />
                <span style={{ fontSize: 13, color: "#6B6455" }}>시간 × {won(settings.hourlyRate || DEFAULT_HOURLY)}</span>
              </div>
              <button onClick={() => quickIncome("근무(시급제)", Math.round(hourlyPreview), `${hours}시간`)} style={{ width: "100%", background: INCOME, color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 14 }}>등록</button>
            </div>
          )}

          {workType === "daily" && (
            <div style={{ border: `1px solid ${PAPER_LINE}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#6B6455" }}>공수</span>
                <input inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} className="mono" style={{ width: 64, border: `1px solid ${PAPER_LINE}`, borderRadius: 8, padding: "6px 8px", fontSize: 14, textAlign: "center" }} />
                <span style={{ fontSize: 13, color: "#6B6455" }}>× {won(settings.dailyRate || DEFAULT_DAILY)}</span>
              </div>
              <button onClick={() => quickIncome("근무(일급제)", Math.round(dailyPreview), `${units}공수`)} style={{ width: "100%", background: INCOME, color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 14 }}>등록</button>
            </div>
          )}

          {!otherOpen ? (
            <button onClick={() => setOtherOpen(true)} style={{ fontSize: 12, color: INDIGO, fontWeight: 700, marginBottom: 18, background: "transparent", border: "none" }}>+ 기타 수입 추가</button>
          ) : (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input inputMode="numeric" placeholder="금액" value={otherAmt} onChange={(e) => setOtherAmt(e.target.value)} className="mono" style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 14 }} />
                <button onClick={addOtherIncome} style={{ background: INCOME, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px" }}><Plus size={18} /></button>
              </div>
              <input placeholder="메모 (예: 팁, 보너스)" value={otherMemo} onChange={(e) => setOtherMemo(e.target.value)} style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 13 }} />
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: 0.5 }}>지출 / 저축 추가</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {EXPENSE_CATS.map((c) => (
              <button key={c.key} onClick={() => setCat(c.key)} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.3px solid ${cat === c.key ? c.color : PAPER_LINE}`, background: cat === c.key ? c.color : "transparent", color: cat === c.key ? "#fff" : INK }}>{c.key}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input inputMode="numeric" placeholder="금액" value={amount} onChange={(e) => setAmount(e.target.value)} className="mono" style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 14 }} />
            <button onClick={addExpense} style={{ background: EXPENSE, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px" }}><Plus size={18} /></button>
          </div>
          <input placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 18 }} />

          {entries.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: 0.5 }}>오늘 기록</div>
              {entries.map((e) => {
                const sInfo = combinedShiftInfo[e.shift];
                return (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px dashed ${PAPER_LINE}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {e.shift && <span style={{ width: 6, height: 6, borderRadius: 6, background: storeColor(e.category), display: "inline-block" }} />}
                        {e.category}
                        {e.shift && <span style={{ fontSize: 10.5, color: sInfo?.color || INK, fontWeight: 700 }}>· {sInfo?.label || e.shift}</span>}
                        {e.recurringId && <span style={{ fontSize: 10, color: GOLD }}>고정</span>}
                      </div>
                      {e.memo && <div style={{ fontSize: 11, color: MUTED }}>{e.memo}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: e.type === "income" ? INCOME : EXPENSE }}>{e.type === "income" ? "+" : "-"}{won(e.amount)}</span>
                      <button onClick={() => onDelete(e.id)} style={{ padding: 4, background: "transparent", border: "none" }}><Trash2 size={15} color="#C9BFA8" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- DailyBudgetCard ----------
function DailyBudgetCard({ isCurrentMonth, monthTotals, expenseToDate, todaySpent, realToday, year, month, savingGoal }) {
  if (!isCurrentMonth) {
    return (
      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16, textAlign: "center", color: MUTED, fontSize: 12 }}>
        하루 권장 지출액 카드는 이번 달({realToday.getFullYear()}.{pad2(realToday.getMonth() + 1)})에서만 표시돼요
      </div>
    );
  }
  const dim = daysInMonth(year, month);
  const todayD = realToday.getDate();
  const remainingDays = Math.max(1, dim - todayD + 1);
  const fixedTotal = monthTotals.byCat[FIXED_CAT] || 0;
  
  const budget = (monthTotals.net - fixedTotal - (savingGoal || 0) - expenseToDate) / remainingDays;
  const over = budget < 0 || todaySpent > Math.max(budget, 0);

  return (
    <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 }}>오늘의 권장 지출액 · 남은 {remainingDays}일</div>
      <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: over ? EXPENSE : INCOME, marginBottom: 6 }}>{won(Math.max(budget, 0))}</div>
      <div style={{ fontSize: 12, color: "#8A8272" }}>
        {savingGoal > 0 && <span style={{ color: GOLD, fontWeight: 600 }}>[목표 저축액 {won(savingGoal)} 차감] </span>}
        오늘 권장 지출액은 <span className="mono" style={{ fontWeight: 700, color: INK }}>{won(Math.max(budget, 0))}</span>입니다.
        {" "}오늘 이미 <span className="mono" style={{ fontWeight: 700 }}>{won(todaySpent)}</span> 썼어요.{" "}
        {budget < 0 ? "이번 달 예산을 초과했어요." : over ? "오늘 권장액을 넘었어요, 내일은 조금 아껴볼까요?" : "잘 지키고 있어요, 이대로 좋아요!"}
      </div>
    </div>
  );
}

// ---------- ReportView ----------
function ReportView({ reportYear, reportMonth, changeReportMonth, isCurrentMonth, monthTotals, yearTotals, goal, savingGoal, achieveRate, remaining, goalEdit, setGoalEdit, goalInput, setGoalInput, commitGoal, savingGoalEdit, setSavingGoalEdit, savingGoalInput, setSavingGoalInput, commitSavingGoal, expenseToDate, todaySpent, realToday, taxMode, payday, prevNet }) {
  const fixedTotal = monthTotals.byCat[FIXED_CAT] || 0;
  const taxInfo = TAX_MODES[taxMode] || TAX_MODES["3.3"];
  const ws = monthTotals.workStats;

  const currentToday = new Date();
  let targetPayday = new Date(currentToday.getFullYear(), currentToday.getMonth(), payday);
  const isNextMonth = currentToday.getDate() > payday;
  if (isNextMonth) {
    targetPayday.setMonth(targetPayday.getMonth() + 1);
  }
  
  const diffDays = Math.ceil((targetPayday - currentToday) / (1000 * 60 * 60 * 24));
  const displayMonth = currentToday.getDate() > payday ? currentToday.getMonth() + 1 : currentToday.getMonth();

  return (
    <div style={{ padding: "16px 20px 100px" }}>
      <div style={{ background: INK, color: "#fff", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span>💰</span> {displayMonth}월 급여 입금일 (매달 {payday}일)
          </div>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>
            {diffDays === 0 ? "D-DAY 🎉" : `D-${diffDays}`}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#C9BFA8", marginTop: 2 }}>
          입금 예정 실수령액: <span className="mono" style={{ color: "#fff", fontWeight: 700 }}>{won(prevNet)}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 19, fontWeight: 700 }}>정산</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => changeReportMonth(-1)} style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer" }}><ChevronLeft size={20} color={INK} /></button>
          <span className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{reportYear}년 {reportMonth + 1}월</span>
          <button onClick={() => changeReportMonth(1)} style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer" }}><ChevronRight size={20} color={INK} /></button>
        </div>
      </div>

      <DailyBudgetCard isCurrentMonth={isCurrentMonth} monthTotals={monthTotals} expenseToDate={expenseToDate} todaySpent={todaySpent} realToday={realToday} year={reportYear} month={reportMonth} savingGoal={savingGoal} />

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}><Target size={12} /> 수입 목표</div>
            {goalEdit ? (
              <button onClick={commitGoal} style={{ fontSize: 11, fontWeight: 700, color: INDIGO, background: "transparent", border: "none" }}>저장</button>
            ) : (
              <button onClick={() => { setGoalEdit(true); setGoalInput(String(goal)); }} style={{ fontSize: 11, color: MUTED, background: "transparent", border: "none" }}>수정</button>
            )}
          </div>
          {goalEdit ? (
            <input autoFocus inputMode="numeric" defaultValue={goal} onChange={(e) => setGoalInput(e.target.value)} className="mono" style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 6, padding: "2px 4px", fontSize: 12 }} />
          ) : (
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: INDIGO }}>{won(goal)}</div>
          )}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>달성률 <span className="mono" style={{ fontWeight: 700, color: INK }}>{achieveRate.toFixed(0)}%</span></div>
        </div>

        <div style={{ flex: 1, background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}><PiggyBank size={12} color={GOLD} /> 적금/저축 목표</div>
            {savingGoalEdit ? (
              <button onClick={commitSavingGoal} style={{ fontSize: 11, fontWeight: 700, color: INDIGO, background: "transparent", border: "none" }}>저장</button>
            ) : (
              <button onClick={() => { setSavingGoalEdit(true); setSavingGoalInput(String(savingGoal)); }} style={{ fontSize: 11, color: MUTED, background: "transparent", border: "none" }}>수정</button>
            )}
          </div>
          {savingGoalEdit ? (
            <input autoFocus inputMode="numeric" defaultValue={savingGoal} onChange={(e) => setSavingGoalInput(e.target.value)} className="mono" style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 6, padding: "2px 4px", fontSize: 12 }} />
          ) : (
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{won(savingGoal)}</div>
          )}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>권장 예산 자동 차감</div>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8 }}>{reportMonth + 1}월 출근 현황</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <MiniStatCard label="A조" value={ws.countA} color={DEFAULT_SHIFT_INFO.A.color} />
        <MiniStatCard label="C조" value={ws.countC} color={DEFAULT_SHIFT_INFO.C.color} />
        <MiniStatCard label="A/C조" value={ws.countFull} color={DEFAULT_SHIFT_INFO.AC.color} />
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 16, marginTop: -8 }}>총 출근 <span className="mono" style={{ fontWeight: 700, color: INK }}>{ws.workDays}일</span> · 총 근무 <span className="mono" style={{ fontWeight: 700, color: INK }}>{ws.totalGeun}근</span> <span style={{ color: "#C9BFA8" }}>(복합조는 2근으로 계산)</span></div>

      <div className="display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{`<${reportMonth + 1}월 급여 실수령액>`}</div>
      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <Row label="세전 총수당" value={monthTotals.gross} color={INCOME} />
        <Row label={`${taxInfo.label} 공제`} value={-(monthTotals.gross * taxInfo.rate)} color={EXPENSE} />
        <Row label="세후 실수령액" value={monthTotals.net} color={INK} bold big />
        <div style={{ height: 1, background: PAPER_LINE, margin: "10px 0" }} />
        <Row label="고정비" value={-fixedTotal} color={EXPENSE} />
        <Row label="변동 지출" value={-(monthTotals.expense - fixedTotal)} color={EXPENSE} />
        <Row label="적금/투자" value={monthTotals.asset} color={GOLD} />
      </div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 10 }}>
          세금 모아보기
          <InfoTip text="매 수당에서 자동 공제되는 세액을 모아 보여드려요. 5월 종합소득세 신고 시 환급 또는 추가납부를 참고하는 용도예요." />
        </div>
        <Row label={`이번 달 ${taxInfo.label}`} value={monthTotals.gross * taxInfo.rate} color={EXPENSE} bold />
        <Row label={`${reportYear}년 누적 ${taxInfo.label}`} value={yearTotals.tax} color={INK} bold big />
      </div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 10 }}>{reportYear}년 연간 누적 (종합소득세 신고용)</div>
        <Row label="연간 세전 총수당" value={yearTotals.gross} color={INCOME} />
        <Row label="연간 실수령 추정" value={yearTotals.net} color={INK} bold big />
      </div>
    </div>
  );
}
function MiniStatCard({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: CARD, textAlign: "center", border: `1.3px solid ${color || GOLD}`, borderRadius: 14, padding: "12px 4px" }}>
      <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: color || GOLD }}>{value}<span style={{ fontSize: 12, fontWeight: 600 }}>회</span></div>
    </div>
  );
}

// ---------- Analysis ----------
function AnalysisView({ monthTotals, monthlySeries = [], yearTotals, year, yearScanLoaded }) {
  const data = EXPENSE_CATS.filter((c) => c.key !== ASSET_CAT && monthTotals.byCat[c.key] > 0).map((c) => ({ name: c.key, value: monthTotals.byCat[c.key] || 0, color: c.color }));
  const hasData = data.length > 0;
  const netOut = monthTotals.expense, saved = monthTotals.asset, total = netOut + saved || 1;
  const monthsWithPay = monthlySeries.filter((m) => m.gross > 0).length;
  const avgMonthly = monthsWithPay ? yearTotals.gross / monthsWithPay : 0;
  const hasYearData = monthsWithPay > 0;
  return (
    <div style={{ padding: "16px 20px 100px" }}>
      <div className="display" style={{ fontSize: 19, fontWeight: 700, marginBottom: 16 }}>소비 패턴 분석</div>

      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8 }}>{year}년 월별 급여 추이</div>
      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        {hasYearData ? (
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={monthlySeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={PAPER_LINE} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} axisLine={{ stroke: PAPER_LINE }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                <Tooltip formatter={(v) => won(v)} labelStyle={{ color: INK }} />
                <Bar dataKey="gross" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (<div style={{ textAlign: "center", color: MUTED, fontSize: 13, padding: "30px 0" }}>{yearScanLoaded ? `${year}년 수입 기록이 아직 없어요` : "불러오는 중…"}</div>)}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1, textAlign: "center", border: `1.3px solid ${GOLD}`, borderRadius: 12, padding: "10px 4px" }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 4 }}>연평균 월급여(세전)</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{won(avgMonthly)}</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", border: `1.3px solid ${INCOME}`, borderRadius: 12, padding: "10px 4px" }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 4 }}>올해 총 수령액(세후)</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: INCOME }}>{won(yearTotals.net)}</div>
          </div>
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 10 }}>카테고리별 지출 비중</div>
        {hasData ? (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {data.map((d, i) => <Cell key={i} fill={d.color} stroke={CARD} strokeWidth={2} />)}
                </Pie>
                <Tooltip formatter={(v) => won(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (<div style={{ textAlign: "center", color: MUTED, fontSize: 13, padding: "30px 0" }}>이번 달 지출 기록이 없어요</div>)}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8, justifyContent: "center" }}>
          {data.map((d) => (<div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: d.color, display: "inline-block" }} />{d.name} <span className="mono">{won(d.value)}</span></div>))}
        </div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 10 }}>사라지는 돈 vs 모이는 돈</div>
        <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ width: `${(netOut / total) * 100}%`, background: EXPENSE }} />
          <div style={{ width: `${(saved / total) * 100}%`, background: INCOME }} />
        </div>
        <Row label="순지출 (사라지는 돈)" value={-netOut} color={EXPENSE} />
        <Row label="적금/투자 (모이는 돈)" value={saved} color={INCOME} />
      </div>
    </div>
  );
}

// ---------- Settings modal ----------
function SettingsModal({ settings, onClose, onPatch, onAddRecurring, onToggleRecurring, onDeleteRecurring, onDeleteStorePreset, onResetStorePresets, onExportBackup, onImportBackup, onExportCSV }) {
  const fileRef = useRef(null);
  const [rOne, setROne] = useState(settings.fixedRates?.one || ONE_SHIFT);
  const [rTwo, setRTwo] = useState(settings.fixedRates?.two || TWO_SHIFT);
  const [rHourly, setRHourly] = useState(settings.hourlyRate || DEFAULT_HOURLY);
  const [rDaily, setRDaily] = useState(settings.dailyRate || DEFAULT_DAILY);
  const [paydayInput, setPaydayInput] = useState(settings.payday || DEFAULT_PAYDAY);

  const [type, setType] = useState("expense");
  const [category, setCategory] = useState(FIXED_CAT);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("25");
  const [memo, setMemo] = useState("");

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3B5BA5");

  const hiddenStores = settings.hiddenStores || [];
  const activeDefaults = DEFAULT_STORE_PRESETS.filter((s) => !hiddenStores.includes(s.name));
  const activeCustoms = (settings.customStores || []).filter((s) => !hiddenStores.includes(s.name));
  const allActiveStores = [...activeDefaults, ...activeCustoms];

  const todoCats = settings.todoCats || DEFAULT_TODO_CATS;
  const customLabels = settings.customLabels || [];
  const customShifts = settings.customShifts || {};

  const handleAddTodoCat = () => {
    if (!newCatName.trim()) return;
    const newCat = { id: uid(), name: newCatName.trim(), color: newCatColor };
    onPatch({ todoCats: [...todoCats, newCat] });
    setNewCatName("");
  };

  const handleDeleteTodoCat = (id) => {
    const filtered = todoCats.filter((c) => c.id !== id);
    onPatch({ todoCats: filtered });
  };

  const handleDeleteCustomLabel = (key) => {
    const next = customLabels.filter((l) => l.key !== key);
    onPatch({ customLabels: next });
  };

  const handleDeleteCustomShift = (key) => {
    const next = { ...customShifts };
    delete next[key];
    onPatch({ customShifts: next });
  };

  const submitRecurring = () => {
    const amt = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    const d = Math.min(31, Math.max(1, parseInt(day, 10) || 1));
    if (!amt) return;
    onAddRecurring({ type, category: type === "income" ? (category || "고정수입") : category, amount: amt, day: d, memo });
    setAmount(""); setMemo("");
  };

  const commitPayday = () => {
    const d = Math.min(31, Math.max(1, parseInt(paydayInput, 10) || DEFAULT_PAYDAY));
    onPatch({ payday: d });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,35,33,0.45)", display: "flex", justifyContent: "center", alignItems: "flex-end", zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", borderRadius: "18px 18px 0 0", animation: "slideUp 0.22s ease-out" }}>
        <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>설정</div>
          <button onClick={onClose} style={{ padding: 6, background: "transparent", border: "none" }}><X size={20} color={MUTED} /></button>
        </div>
        <TornEdge color={CARD} />

        <div style={{ padding: "8px 20px 30px" }}>
          {Object.keys(customShifts).length > 0 && (
            <>
              <SectionTitle>커스텀 조(Shift) 프리셋 관리</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                {Object.entries(customShifts).map(([key, info]) => (
                  <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.3px solid ${info.color || GOLD}`, color: info.color || GOLD }}>
                    {info.label || key} {info.time ? `(${info.time})` : ""}
                    <button onClick={() => handleDeleteCustomShift(key)} style={{ padding: 0, background: "transparent", border: "none", cursor: "pointer", display: "flex" }}><X size={12} color={info.color || GOLD} /></button>
                  </span>
                ))}
              </div>
            </>
          )}

          {customLabels.length > 0 && (
            <>
              <SectionTitle>커스텀 라벨 관리</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                {customLabels.map((l) => (
                  <span key={l.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.3px solid ${l.color}`, color: l.color }}>
                    {l.key}
                    <button onClick={() => handleDeleteCustomLabel(l.key)} style={{ padding: 0, background: "transparent", border: "none", cursor: "pointer", display: "flex" }}><X size={12} color={l.color} /></button>
                  </span>
                ))}
              </div>
            </>
          )}

          <SectionTitle>플래너 카테고리 관리 (투두메이트 방식)</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {todoCats.map((cat) => (
              <span key={cat.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.3px solid ${cat.color}`, color: cat.color }}>
                {cat.name}
                <button onClick={() => handleDeleteTodoCat(cat.id)} style={{ padding: 0, background: "transparent", border: "none", cursor: "pointer", display: "flex" }}><X size={12} color={cat.color} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            <input placeholder="새 카테고리 (예: 운동)" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5 }} />
            <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} style={{ width: 36, height: 36, border: "none", background: "transparent", cursor: "pointer" }} />
            <button onClick={handleAddTodoCat} style={{ background: INK, color: "#fff", border: "none", borderRadius: 10, padding: "0 12px", fontWeight: 700, fontSize: 12 }}>추가</button>
          </div>

          <SectionTitle>급여일 설정 (D-Day 카운트다운)</SectionTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: "#6B6455" }}>매달</span>
            <input inputMode="numeric" value={paydayInput} onChange={(e) => setPaydayInput(e.target.value.replace(/[^0-9]/g, ""))} onBlur={commitPayday} className="mono" style={{ width: 60, border: `1px solid ${PAPER_LINE}`, borderRadius: 8, padding: "6px 8px", fontSize: 14, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "#6B6455" }}>일이 급여 입금일이에요</span>
          </div>

          <SectionTitle>근무 유형</SectionTitle>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <SegButton active={settings.workType === "fixed"} onClick={() => onPatch({ workType: "fixed" })}>매장/조 고정수당형</SegButton>
            <SegButton active={settings.workType === "hourly"} onClick={() => onPatch({ workType: "hourly" })}>시급제</SegButton>
            <SegButton active={settings.workType === "daily"} onClick={() => onPatch({ workType: "daily" })}>일급/공수제</SegButton>
          </div>

          {settings.workType === "fixed" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <RateField label="단일조 (1근)" value={rOne} setValue={setROne} onCommit={() => onPatch({ fixedRates: { ...settings.fixedRates, one: parseInt(rOne, 10) || ONE_SHIFT } })} />
              <RateField label="조합/복합조 (2근)" value={rTwo} setValue={setRTwo} onCommit={() => onPatch({ fixedRates: { ...settings.fixedRates, two: parseInt(rTwo, 10) || TWO_SHIFT } })} />
            </div>
          )}
          {settings.workType === "hourly" && (
            <div style={{ marginBottom: 20 }}><RateField label="시급" value={rHourly} setValue={setRHourly} onCommit={() => onPatch({ hourlyRate: parseInt(rHourly, 10) || DEFAULT_HOURLY })} /></div>
          )}
          {settings.workType === "daily" && (
            <div style={{ marginBottom: 20 }}><RateField label="1공수 단가" value={rDaily} setValue={setRDaily} onCommit={() => onPatch({ dailyRate: parseInt(rDaily, 10) || DEFAULT_DAILY })} /></div>
          )}

          <SectionTitle>세금 공제율</SectionTitle>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            <SegButton active={settings.taxMode === "3.3"} onClick={() => onPatch({ taxMode: "3.3" })}>3.3% 원천징수</SegButton>
            <SegButton active={settings.taxMode === "4dae"} onClick={() => onPatch({ taxMode: "4dae" })}>4대보험 9.4%</SegButton>
            <SegButton active={settings.taxMode === "none"} onClick={() => onPatch({ taxMode: "none" })}>비과세/미공제</SegButton>
          </div>

          <SectionTitle>매장 프리셋 관리</SectionTitle>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>
            등록된 매장 옆의 ✕ 버튼을 누르면 목록에서 삭제돼요. 매장이 완전히 바뀔 때 편하게 정리해 보세요.
          </div>
          {allActiveStores.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {allActiveStores.map((s) => (
                <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: `1.3px solid ${s.color}`, color: s.color }}>
                  {s.name}
                  <button onClick={() => onDeleteStorePreset(s.name)} style={{ display: "flex", padding: 2, background: "transparent", border: "none", cursor: "pointer" }}><X size={12} color={s.color} /></button>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>등록된 매장이 없어요. 수입 입력에서 새 매장을 추가해 보세요.</div>
          )}
          {(hiddenStores.length > 0 || (settings.customStores || []).length > 0) && (
            <button onClick={onResetStorePresets} style={{ fontSize: 11.5, color: INDIGO, fontWeight: 700, background: "transparent", border: "none", padding: 0, marginBottom: 20, cursor: "pointer" }}>
              ↺ 기본 매장 목록으로 전체 복원하기
            </button>
          )}

          <SectionTitle>고정 항목 (매달 자동 등록)</SectionTitle>
          {(settings.recurring || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {settings.recurring.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px dashed ${PAPER_LINE}`, opacity: r.active ? 1 : 0.45 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.category} <span style={{ fontSize: 11, fontWeight: 500, color: MUTED }}>· 매달 {r.day}일</span></div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: r.type === "income" ? INCOME : EXPENSE }}>{r.type === "income" ? "+" : "-"}{won(r.amount)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => onToggleRecurring(r.id)} style={{ fontSize: 11, fontWeight: 700, color: r.active ? INDIGO : MUTED, border: `1px solid ${r.active ? INDIGO : PAPER_LINE}`, borderRadius: 20, padding: "4px 10px", background: "transparent" }}>{r.active ? "사용 중" : "꺼짐"}</button>
                    <button onClick={() => onDeleteRecurring(r.id)} style={{ padding: 4, background: "transparent", border: "none" }}><Trash2 size={16} color="#C9BFA8" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <SegButton active={type === "expense"} onClick={() => { setType("expense"); setCategory(FIXED_CAT); }}>고정 지출</SegButton>
            <SegButton active={type === "income"} onClick={() => { setType("income"); setCategory("고정수입"); }}>고정 수입</SegButton>
          </div>
          {type === "expense" ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {EXPENSE_CATS.filter((c) => c.key !== ASSET_CAT).map((c) => (
                <button key={c.key} onClick={() => setCategory(c.key)} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.3px solid ${category === c.key ? c.color : PAPER_LINE}`, background: category === c.key ? c.color : "transparent", color: category === c.key ? "#fff" : INK }}>{c.key}</button>
              ))}
            </div>
          ) : (
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="수입 이름 (예: 고정 출연료)" style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 10 }} />
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input inputMode="numeric" placeholder="금액" value={amount} onChange={(e) => setAmount(e.target.value)} className="mono" style={{ flex: 1, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 14 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "0 10px" }}>
              <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, ""))} className="mono" style={{ width: 30, border: "none", fontSize: 14, textAlign: "center" }} />
              <span style={{ fontSize: 13, color: MUTED }}>일</span>
            </div>
          </div>
          <input placeholder="메모 (예: 월세, 통신비)" value={memo} onChange={(e) => setMemo(e.target.value)} style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 12 }} />
          <button onClick={submitRecurring} style={{ width: "100%", background: INK, color: "#fff", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 24 }}>
            <RefreshCw size={14} /> 고정 항목 추가
          </button>

          <SectionTitle>데이터 관리</SectionTitle>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>평소 기록은 자동으로 저장돼요. 아래 버튼은 비상용 백업이나 세금 신고용 자료가 필요할 때만 눌러주세요.</div>
          <button onClick={onExportBackup} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1.3px solid ${INDIGO}`, color: INDIGO, background: "transparent", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, marginBottom: 8 }}><Download size={15} /> JSON 백업 다운로드</button>
          <button onClick={() => fileRef.current?.click()} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1.3px solid ${MUTED}`, color: INK, background: "transparent", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, marginBottom: 8 }}><Upload size={15} /> JSON 백업 복원</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) onImportBackup(e.target.files[0]); e.target.value = ""; }} />
          <button onClick={onExportCSV} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: GOLD, color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13 }}><FileSpreadsheet size={15} /> 종소세 증빙용 CSV 내보내기</button>
        </div>
      </div>
    </div>
  );
}
function SectionTitle({ children }) { return <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: 0.5 }}>{children}</div>; }
function RateField({ label, value, setValue, onCommit }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
      <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))} onBlur={onCommit} className="mono" style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 10px", fontSize: 14 }} />
    </div>
  );
}
