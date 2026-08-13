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
  { key: "식비", color: "#B5432E" },
  { key: "쇼핑", color: "#C77B4A" },
  { key: "교통", color: "#8C7A5B" },
  { key: "고정비", color: "#6B5B4A" },
  { key: "적금/투자", color: "#0F6B5C" },
  { key: "기타", color: "#9A9284" },
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

const LABELS = [
  { key: "휴무", color: "#6B7A8F" },
  { key: "면접", color: "#3B5BA5" },
  { key: "스터디", color: "#0F6B5C" },
  { key: "알바", color: "#B08D57" },
  { key: "기타", color: "#9A9284" },
];

const TAX_MODES = {
  "3.3": { label: "원천징수 3.3%", rate: 0.033 },
  "4dae": { label: "4대보험 9.4%", rate: 0.094 },
  none: { label: "비과세/미공제", rate: 0 },
};

const SHIFT_INFO = {
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
function labelColorOf(name) { return (LABELS.find((l) => l.key === name) || {}).color || MUTED; }

function computeConflict(entries) {
  const work = (entries || []).filter((e) => e.shift && SHIFT_SLOTS[e.shift]);
  let morning = 0, afternoon = 0;
  work.forEach((e) => {
    SHIFT_SLOTS[e.shift].forEach((slot) => { if (slot === "morning") morning++; else afternoon++; });
  });
  return morning > 1 || afternoon > 1;
}

const DEFAULT_SETTINGS = {
  goal: DEFAULT_GOAL, savingGoal: DEFAULT_SAVING_GOAL, payday: DEFAULT_PAYDAY,
  recurring: [], workType: "fixed", taxMode: "3.3",
  fixedRates: { one: ONE_SHIFT, two: TWO_SHIFT },
  hourlyRate: DEFAULT_HOURLY, dailyRate: DEFAULT_DAILY,
  customStores: [], hiddenStores: [],
  todoCats: DEFAULT_TODO_CATS,
  routines: [], 
  todos: [], 
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
  const days = { ...monthData.days };
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

function generateCalendarPNG(year, month, daysData) {
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
    const dayObj = daysData[dk];
    const work = dayObj ? (dayObj.entries || []).filter((e) => e.shift) : [];
    const conflict = dayObj ? computeConflict(dayObj.entries) : false;

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
      ctx.fillStyle = SHIFT_INFO[first.shift]?.color || INK;
      ctx.font = "700 20px sans-serif";
      const shiftText = SHIFT_INFO[first.shift]?.label + (work.length > 1 ? ` 외${work.length - 1}` : "");
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
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
      const { data: applied, changed } = applyRecurringToMonth(y, m, data, settings.recurring || [], new Date());
      cacheRef.current = { ...cacheRef.current, [k]: applied };
      setCache((prev) => ({ ...prev, [k]: applied }));
      if (changed) await saveMonth(y, m, applied);
      return applied;
    }
    return existing;
  }, [settings]);

  useEffect(() => { (async () => { setLoading(true); setSettings(await loadSettings()); setLoading(false); })(); }, []);
  
  useEffect(() => { if (!loading) ensureMonth(year, month); }, [year, month, ensureMonth, loading]);
  
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
        const data = all[monthKey(year, m - 1)];
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

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  const mutateDay = async (dayNum, mutator) => {
    const k = monthKey(year, month);
    const data = cache[k] || { days: {} };
    const dk = pad2(dayNum);
    const dayObj = data.days[dk] || emptyDay();
    const nextDay = mutator(dayObj);
    const next = { ...data, days: { ...data.days, [dk]: nextDay } };
    setCache((prev) => ({ ...prev, [k]: next }));
    await saveMonth(year, month, next);
  };

  const addEntry = (dayNum, entry) => mutateDay(dayNum, (d) => ({ ...d, entries: [...d.entries, entry] }));
  const deleteEntry = (dayNum, id) => mutateDay(dayNum, (d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
  const updateDayMeta = (dayNum, meta) => mutateDay(dayNum, (d) => ({ ...d, ...meta }));

  const monthTotals = useMemo(() => {
    let gross = 0, expense = 0, asset = 0, countA = 0, countC = 0, countFull = 0;
    const workDaySet = new Set();
    const byCat = {};
    if (curData && curData.days) {
      Object.entries(curData.days).forEach(([dk, d]) => (d.entries || []).forEach((e) => {
        if (e.type === "income") {
          gross += e.amount;
          if (e.shift && SHIFT_SLOTS[e.shift]) {
            workDaySet.add(dk);
            if (COMBO_SHIFTS.has(e.shift)) {
              countFull++;
            } else if (e.shift === "C") {
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
    return d.entries.filter((e) => e.type === "expense" && e.category !== ASSET_CAT).reduce((a, e) => a + e.amount, 0);
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
    const nextDays = { ...data.days };

    Object.entries(parsedMap).forEach(([dayNumStr, shiftKey]) => {
      const dk = pad2(parseInt(dayNumStr, 10));
      const existing = nextDays[dk] || emptyDay();
      
      if (shiftKey === "OFF") {
        nextDays[dk] = { ...existing, label: "휴무" };
      } else if (SHIFT_INFO[shiftKey]) {
        const amt = COMBO_SHIFTS.has(shiftKey) ? (settings.fixedRates?.two || TWO_SHIFT) : (settings.fixedRates?.one || ONE_SHIFT);
        const newEntry = { id: uid(), type: "income", category: storeName, shift: shiftKey, amount: amt, memo: "" };
        const cleanEntries = existing.entries.filter((e) => !e.shift);
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
            rows.push([`${ym}-${dk}`, e.type === "income" ? "수입" : "지출", e.category, e.shift ? SHIFT_INFO[e.shift]?.label || "" : "", e.amount, `"${memo}"`]);
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
      const dataUrl = generateCalendarPNG(year, month, curData.days || {});
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
                year={year} setYear={setYear} month={month} isCurrentMonth={isCurrentMonth}
                monthTotals={monthTotals} yearTotals={yearTotals} goal={goal} savingGoal={savingGoal}
                achieveRate={achieveRate} remaining={remaining} shiftsNeeded={shiftsNeeded}
                goalEdit={goalEdit} setGoalEdit={setGoalEdit} goalInput={goalInput} setGoalInput={setGoalInput} commitGoal={commitGoal}
                savingGoalEdit={savingGoalEdit} setSavingGoalEdit={setSavingGoalEdit} savingGoalInput={savingGoalInput} setSavingGoalInput={setSavingGoalInput} commitSavingGoal={commitSavingGoal}
                expenseToDate={expenseToDate} todaySpent={todaySpent} realToday={realToday}
                taxMode={settings.taxMode} payday={settings.payday || DEFAULT_PAYDAY} prevNet={prevNet}
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

  const [selY, selM, selD] = selectedDateStr.split("-").map((x) => parseInt(x, 10));
  
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
        {selM}월 {selD}일 ({WEEK_LABELS[new Date(selY, selM - 1, selD).getDay()]})
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
                <span className="mono" style={{ fontSize: 13.5, fontWeight: isSel ? 700 : 500, color: INK, marginTop: 2 }}>
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
            <span style={{ fontSize: 14, fontWeight: 700, color: SHIFT_INFO[workEntries[0].shift]?.color }}>
              · {SHIFT_INFO[workEntries[0].shift]?.label}
            </span>
          </div>
        ) : selDayData.label ? (
          <div style={{ fontSize: 14, fontWeight: 700, color: labelColorOf(selDayData.label) }}>{selDayData.label}</div>
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
      </div>
    </div>
  );
}
