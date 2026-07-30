import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Calendar, Gauge, PieChart as PieChartIcon,
  X, Plus, Trash2, Target, Settings as SettingsIcon, Info, RefreshCw,
  Download, Upload, FileSpreadsheet, Smartphone, Camera, AlertTriangle,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

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
const ONE_SHIFT = 140000; // 단일 조 (A1/A2/C) 단가
const TWO_SHIFT = 280000; // 조합 조 (A1/C, A2/C) 2근 단가
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

// 세분화된 근무 조: A1/A2/C는 단일 슬롯(1근), A1C/A2C는 오전+오후 연속(2근)
const SHIFT_INFO = {
  A1: { label: "A1조", short: "A1", color: GOLD },
  A2: { label: "A2조", short: "A2", color: "#C77B4A" },
  C: { label: "C조", short: "C", color: INDIGO },
  A1C: { label: "A1/C", short: "A1/C", color: INK },
  A2C: { label: "A2/C", short: "A2/C", color: "#6B5B4A" },
};
// 각 조가 점유하는 시간대 슬롯
const SHIFT_SLOTS = {
  A1: ["morning"],
  A2: ["morning"],
  C: ["afternoon"],
  A1C: ["morning", "afternoon"],
  A2C: ["morning", "afternoon"],
};
const COMBO_SHIFTS = new Set(["A1C", "A2C"]); // 2근(조합 조)

const STORE_PRESETS = [
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
const won = (n) => (n < 0 ? "-" : "") + Math.abs(Math.round(n || 0)).toLocaleString("ko-KR") + "원";
const uid = () => Math.random().toString(36).slice(2, 10);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const firstWeekday = (y, m) => new Date(y, m, 1).getDay();
const clampDay = (d, dim) => Math.min(Math.max(1, d), dim);
const emptyDay = () => ({ entries: [], label: null, memo: "" });

function storeColor(name, customStores = []) {
  const preset = STORE_PRESETS.find((s) => s.name === name) || customStores.find((s) => s.name === name);
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
  goal: DEFAULT_GOAL,
  recurring: [],
  workType: "fixed",
  taxMode: "3.3",
  fixedRates: { one: ONE_SHIFT, two: TWO_SHIFT },
  hourlyRate: DEFAULT_HOURLY,
  dailyRate: DEFAULT_DAILY,
  customStores: [], // 사용자가 추가한 매장 프리셋 [{name, color}]
};

// ---------- storage helpers ----------
async function loadMonth(y, m) {
  try {
    if (window.storage && window.storage.get) {
      const res = await window.storage.get(monthKey(y, m), false);
      if (res && res.value) return JSON.parse(res.value);
    } else {
      const res = localStorage.getItem(monthKey(y, m));
      if (res) return JSON.parse(res);
    }
  } catch (e) { /* empty */ }
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
  } catch (e) { /* default */ }
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

// ---------- recurring engine ----------
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

// ---------- wallpaper calendar PNG ----------
function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
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
    const wd = new Date(year, month, d).getDay();

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

    const maxTextW = cellW - 32;
    if (conflict) {
      ctx.fillStyle = EXPENSE;
      ctx.font = "700 20px sans-serif";
      ctx.fillText("⚠️ 시간대", x + 16, y + 68);
      ctx.fillText("중복", x + 16, y + 96);
    } else if (work.length) {
      const first = work[0];
      ctx.fillStyle = storeColor(first.category);
      ctx.font = "600 19px sans-serif";
      ctx.fillText(truncateToWidth(ctx, first.category, maxTextW), x + 16, y + 68);
      ctx.fillStyle = SHIFT_INFO[first.shift]?.color || INK;
      ctx.font = "700 22px sans-serif";
      const shiftText = SHIFT_INFO[first.shift]?.label + (work.length > 1 ? ` 외 ${work.length - 1}` : "");
      ctx.fillText(truncateToWidth(ctx, shiftText, maxTextW), x + 16, y + 98);
    } else if (dayObj && dayObj.label) {
      ctx.fillStyle = labelColorOf(dayObj.label);
      ctx.font = "600 20px sans-serif";
      ctx.fillText(dayObj.label, x + 16, y + 68);
      if (dayObj.memo) {
        ctx.fillStyle = MUTED;
        ctx.font = "500 16px sans-serif";
        ctx.fillText(truncateToWidth(ctx, dayObj.memo, maxTextW), x + 16, y + 94);
      }
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
}

// ---------- UI Components ----------
function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5" style={{ color: active ? INK : MUTED, border: "none", background: "transparent" }}>
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
      <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, letterSpacing: 0.2 }}>{label}</span>
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

// ---------- root App ----------
export default function App() {
  const realToday = new Date();
  const [year, setYear] = useState(realToday.getFullYear());
  const [month, setMonth] = useState(realToday.getMonth());
  const [tab, setTab] = useState("calendar");
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedDay, setSelectedDay] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalEdit, setGoalEdit] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [toast, setToast] = useState("");

  const cacheRef = useRef({});
  useEffect(() => { cacheRef.current = cache; }, [cache]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); }, [toast]);

  const mk = (y, m) => `${y}-${pad2(m + 1)}`;
  const taxRate = (TAX_MODES[settings.taxMode] || TAX_MODES["3.3"]).rate;

  const ensureMonth = useCallback(async (y, m) => {
    const k = mk(y, m);
    const existing = cacheRef.current[k];
    const data = existing || (await loadMonth(y, m));
    const { data: applied, changed } = applyRecurringToMonth(y, m, data, settings.recurring || [], new Date());
    if (!existing || changed) {
      cacheRef.current = { ...cacheRef.current, [k]: applied };
      setCache((prev) => ({ ...prev, [k]: applied }));
    }
    if (changed) await saveMonth(y, m, applied);
  }, [settings]);

  useEffect(() => { (async () => { setLoading(true); setSettings(await loadSettings()); setLoading(false); })(); }, []);
  useEffect(() => { if (!loading) ensureMonth(year, month); }, [year, month, ensureMonth, loading]);

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
        const data = all[`month:${year}-${pad2(m)}`];
        let gross = 0;
        if (data) Object.values(data.days || {}).forEach((day) => (day.entries || []).forEach((e) => { if (e.type === "income") gross += e.amount; }));
        perMonth[pad2(m)] = gross;
      }
      setYearScan(perMonth);
      setYearScanLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tab, year]);

  const curData = cache[mk(year, month)] || { days: {} };

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  const mutateDay = async (dayNum, mutator) => {
    const k = mk(year, month);
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
    Object.entries(curData.days).forEach(([dk, d]) => (d.entries || []).forEach((e) => {
      if (e.type === "income") {
        gross += e.amount;
        if (e.shift && SHIFT_SLOTS[e.shift]) {
          workDaySet.add(dk);
          if (COMBO_SHIFTS.has(e.shift)) countFull++;
          else if (e.shift === "C") countC++;
          else countA++;
        }
      } else {
        if (e.category === ASSET_CAT) asset += e.amount; else expense += e.amount;
        byCat[e.category] = (byCat[e.category] || 0) + e.amount;
      }
    }));
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
    Object.entries(curData.days).forEach(([dk, d]) => { if (parseInt(dk, 10) <= todayD) (d.entries || []).forEach((e) => { if (e.type === "expense" && e.category !== ASSET_CAT) sum += e.amount; }); });
    return sum;
  }, [curData, isCurrentMonth]);
  const todaySpent = useMemo(() => {
    if (!isCurrentMonth) return 0;
    const d = curData.days[pad2(realToday.getDate())];
    if (!d) return 0;
    return d.entries.filter((e) => e.type === "expense" && e.category !== ASSET_CAT).reduce((a, e) => a + e.amount, 0);
  }, [curData, isCurrentMonth]);

  const goal = settings.goal || DEFAULT_GOAL;
  const achieveRate = Math.min(100, (monthTotals.gross / goal) * 100);
  const remaining = Math.max(0, goal - monthTotals.gross);
  const shiftsNeeded = remaining > 0 ? Math.ceil(remaining / (settings.fixedRates?.two || TWO_SHIFT)) : 0;

  const commitGoal = async () => {
    const n = parseInt(goalInput.replace(/[^0-9]/g, ""), 10);
    if (n > 0) { const s = { ...settings, goal: n }; setSettings(s); await saveSettings(s); }
    setGoalEdit(false);
  };

  const patchSettings = async (patch) => { const s = { ...settings, ...patch }; setSettings(s); await saveSettings(s); };
  const saveRecurring = (list) => patchSettings({ recurring: list });
  const addRecurring = (item) => saveRecurring([...(settings.recurring || []), { id: uid(), active: true, ...item }]);
  const toggleRecurring = (id) => saveRecurring((settings.recurring || []).map((r) => (r.id === id ? { ...r, active: !r.active } : r)));
  const deleteRecurring = (id) => saveRecurring((settings.recurring || []).filter((r) => r.id !== id));

  const addStorePreset = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const already = STORE_PRESETS.some((s) => s.name === trimmed) || (settings.customStores || []).some((s) => s.name === trimmed);
    if (already) return;
    patchSettings({ customStores: [...(settings.customStores || []), { name: trimmed, color: storeColor(trimmed) }] });
  };
  const deleteStorePreset = (name) => patchSettings({ customStores: (settings.customStores || []).filter((s) => s.name !== name) });

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
      Object.entries(data.days || {}).forEach(([dk, dayObj]) => {
        (dayObj.entries || []).forEach((e) => {
          const memo = (e.memo || "").replace(/"/g, "'");
          rows.push([`${ym}-${dk}`, e.type === "income" ? "수입" : "지출", e.category, e.shift ? SHIFT_INFO[e.shift]?.label || "" : "", e.amount, `"${memo}"`]);
        });
      });
    });
    const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    downloadText(`모으다_${realToday.getFullYear()}_증빙.csv`, "text/csv;charset=utf-8", csv);
    setToast("CSV 파일을 다운로드했어요");
  };
  const saveWallpaper = () => {
    try {
      const dataUrl = generateCalendarPNG(year, month, curData.days);
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

      <div className="app-root" style={{ width: "100%", maxWidth: 480, minHeight: "100vh", position: "relative", background: PAPER }}>
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
              <CalendarView year={year} month={month} changeMonth={changeMonth} daysData={curData.days} onSelectDay={setSelectedDay} onSaveWallpaper={saveWallpaper} />
            )}
            {tab === "report" && (
              <ReportView
                year={year} setYear={setYear} month={month} isCurrentMonth={isCurrentMonth}
                monthTotals={monthTotals} yearTotals={yearTotals} goal={goal}
                achieveRate={achieveRate} remaining={remaining} shiftsNeeded={shiftsNeeded}
                goalEdit={goalEdit} setGoalEdit={setGoalEdit} goalInput={goalInput} setGoalInput={setGoalInput} commitGoal={commitGoal}
                expenseToDate={expenseToDate} todaySpent={todaySpent} realToday={realToday}
                taxMode={settings.taxMode}
              />
            )}
            {tab === "analysis" && <AnalysisView monthTotals={monthTotals} monthlySeries={monthlySeries} yearTotals={yearTotals} year={year} yearScanLoaded={yearScanLoaded} />}
          </>
        )}

        <div style={{ position: "sticky", bottom: 0, display: "flex", background: PAPER, borderTop: `1px solid ${PAPER_LINE}`, boxShadow: "0 -4px 16px rgba(0,0,0,0.04)" }}>
          <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={Calendar} label="캘린더" />
          <TabButton active={tab === "report"} onClick={() => setTab("report")} icon={Gauge} label="정산" />
          <TabButton active={tab === "analysis"} onClick={() => setTab("analysis")} icon={PieChartIcon} label="분석" />
        </div>

        {selectedDay && (
          <DayModal
            year={year} month={month} day={selectedDay}
            dayObj={curData.days[pad2(selectedDay)] || emptyDay()}
            settings={settings}
            onClose={() => setSelectedDay(null)}
            onAdd={(entry) => addEntry(selectedDay, entry)}
            onDelete={(id) => deleteEntry(selectedDay, id)}
            onMeta={(meta) => updateDayMeta(selectedDay, meta)}
            onAddStorePreset={addStorePreset}
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

// ---------- CalendarView ----------
function CalendarView({ year, month, changeMonth, daysData, onSelectDay, onSaveWallpaper }) {
  const dim = daysInMonth(year, month);
  const fw = firstWeekday(year, month);
  const cells = [];
  for (let i = 0; i < fw; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  const isToday = (d) => { const t = new Date(); return d === t.getDate() && month === t.getMonth() && year === t.getFullYear(); };

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => changeMonth(-1)} style={{ padding: 8, background: "transparent", border: "none" }}><ChevronLeft size={20} color={INK} /></button>
        <div className="display" style={{ fontSize: 19, fontWeight: 700 }}>{year}년 {month + 1}월</div>
        <button onClick={() => changeMonth(1)} style={{ padding: 8, background: "transparent", border: "none" }}><ChevronRight size={20} color={INK} /></button>
      </div>

      <button onClick={onSaveWallpaper} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1.3px solid ${GOLD}`, color: GOLD, background: "transparent", borderRadius: 12, padding: "10px 0", fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
        <Camera size={16} /> 배경화면 이미지 저장
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
        {WEEK_LABELS.map((w) => <div key={w} style={{ textAlign: "center", fontSize: 11, color: MUTED, fontWeight: 600, padding: "4px 0" }}>{w}</div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, width: "100%", boxSizing: "border-box" }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} style={{ minHeight: 92 }} />;
          const dk = pad2(d);
          const dayObj = daysData[dk];
          const work = dayObj ? (dayObj.entries || []).filter((e) => e.shift) : [];
          const conflict = dayObj ? computeConflict(dayObj.entries) : false;
          const hasContent = !!(dayObj && (dayObj.entries.length || dayObj.label));
          const wd = new Date(year, month, d).getDay();

          return (
            <button key={i} onClick={() => onSelectDay(d)} className="cell-tap" style={{
              minHeight: 92, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", overflow: "hidden",
              border: conflict ? `1.6px solid ${EXPENSE}` : isToday(d) ? `1.6px solid ${GOLD}` : `1px solid ${PAPER_LINE}`,
              borderRadius: 10, background: hasContent ? "#FCFAF5" : "transparent", display: "flex", flexDirection: "column",
              alignItems: "flex-start", justifyContent: "flex-start", padding: "8px 6px", position: "relative", textAlign: "left",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 14, fontWeight: isToday(d) ? 700 : 600, color: isToday(d) ? GOLD : (wd === 0 ? EXPENSE : wd === 6 ? INDIGO : INK), whiteSpace: "nowrap" }}>
                  {d}
                </span>
                {dayObj?.label && <span style={{ width: 7, height: 7, borderRadius: 7, background: labelColorOf(dayObj.label), flexShrink: 0, marginLeft: 4 }} />}
              </div>

              <div style={{ marginTop: 6, width: "100%", minWidth: 0, lineHeight: 1.3 }}>
                {conflict ? (
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: EXPENSE }}>⚠️ 시간대<br />중복</div>
                ) : work.length ? (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: storeColor(work[0].category), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{work[0].category}</div>
                    <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: SHIFT_INFO[work[0].shift]?.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                      {SHIFT_INFO[work[0].shift]?.label}{work.length > 1 ? ` 외${work.length - 1}` : ""}
                    </div>
                  </>
                ) : dayObj?.label ? (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: labelColorOf(dayObj.label), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{dayObj.label}</div>
                    {dayObj.memo && <div style={{ fontSize: 9.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{dayObj.memo}</div>}
                  </>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {LABELS.map((l) => (<div key={l.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: MUTED }}><span style={{ width: 6, height: 6, borderRadius: 6, background: l.color, display: "inline-block" }} />{l.key}</div>))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: MUTED, textAlign: "center" }}>날짜를 눌러 근무·지출·일정을 기록하세요 · 금액은 정산 탭에서 확인해요</div>
    </div>
  );
}

// ---------- DayModal ----------
function DayModal({ year, month, day, dayObj, settings, onClose, onAdd, onDelete, onMeta, onAddStorePreset }) {
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState(EXPENSE_CATS[0].key);
  const [memo, setMemo] = useState("");
  const [dayMemo, setDayMemo] = useState(dayObj.memo || "");
  const [hours, setHours] = useState("8");
  const [units, setUnits] = useState("1");
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherAmt, setOtherAmt] = useState("");
  const [otherMemo, setOtherMemo] = useState("");
  const allStores = [...STORE_PRESETS, ...(settings.customStores || [])];
  const [store, setStore] = useState(allStores[0]?.name || "");
  const [customStore, setCustomStore] = useState("");
  const [useCustomStore, setUseCustomStore] = useState(false);
  const [saveAsPreset, setSaveAsPreset] = useState(true);
  const [shift, setShift] = useState("A1");
  const entries = dayObj.entries || [];
  const conflict = computeConflict(entries);

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

  const workType = settings.workType || "fixed";
  const hourlyPreview = (parseFloat(hours) || 0) * (settings.hourlyRate || DEFAULT_HOURLY);
  const dailyPreview = (parseFloat(units) || 0) * (settings.dailyRate || DEFAULT_DAILY);

  const registerShift = () => {
    let storeName = store;
    if (useCustomStore) {
      storeName = customStore.trim() || "직접입력 매장";
      if (saveAsPreset && onAddStorePreset) onAddStorePreset(storeName);
    }
    const amt = COMBO_SHIFTS.has(shift) ? (settings.fixedRates?.two || TWO_SHIFT) : (settings.fixedRates?.one || ONE_SHIFT);
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

          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: 0.5 }}>오늘 라벨</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {LABELS.map((l) => (
              <button key={l.key} onClick={() => pickLabel(l.key)} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.3px solid ${dayObj.label === l.key ? l.color : PAPER_LINE}`, background: dayObj.label === l.key ? l.color : "transparent", color: dayObj.label === l.key ? "#fff" : INK }}>{l.key}</button>
            ))}
          </div>
          <input placeholder="오늘의 메모 (예: 면접 2차 통과)" value={dayMemo} onChange={(e) => setDayMemo(e.target.value)} onBlur={blurDayMemo}
            style={{ width: "100%", border: `1px solid ${PAPER_LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, marginBottom: 20 }} />

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
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>근무 조</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                {Object.entries(SHIFT_INFO).map(([key, info]) => (
                  <button key={key} onClick={() => setShift(key)} className="mono" style={{ padding: "10px 4px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, border: `1.3px solid ${shift === key ? info.color : PAPER_LINE}`, background: shift === key ? info.color : "transparent", color: shift === key ? "#fff" : INK }}>
                    {info.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>단일 조(A1·A2·C)는 1근, 조합 조(A1/C·A2/C)는 2근으로 계산돼요</div>
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
              {entries.map((e) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px dashed ${PAPER_LINE}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {e.shift && <span style={{ width: 6, height: 6, borderRadius: 6, background: storeColor(e.category), display: "inline-block" }} />}
                      {e.category}
                      {e.shift && <span style={{ fontSize: 10.5, color: SHIFT_INFO[e.shift]?.color, fontWeight: 700 }}>· {SHIFT_INFO[e.shift]?.label}</span>}
                      {e.recurringId && <span style={{ fontSize: 10, color: GOLD }}>고정</span>}
                    </div>
                    {e.memo && <div style={{ fontSize: 11, color: MUTED }}>{e.memo}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: e.type === "income" ? INCOME : EXPENSE }}>{e.type === "income" ? "+" : "-"}{won(e.amount)}</span>
                    <button onClick={() => onDelete(e.id)} style={{ padding: 4, background: "transparent", border: "none" }}><Trash2 size={15} color="#C9BFA8" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- DailyBudgetCard ----------
function DailyBudgetCard({ isCurrentMonth, monthTotals, expenseToDate, todaySpent, realToday, year, month }) {
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
  const budget = (monthTotals.net - fixedTotal - monthTotals.asset - expenseToDate) / remainingDays;
  const over = budget < 0 || todaySpent > Math.max(budget, 0);

  return (
    <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 }}>오늘의 권장 지출액 · 남은 {remainingDays}일</div>
      <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: over ? EXPENSE : INCOME, marginBottom: 6 }}>{won(Math.max(budget, 0))}</div>
      <div style={{ fontSize: 12, color: "#8A8272" }}>
        오늘 권장 지출액은 <span className="mono" style={{ fontWeight: 700, color: INK }}>{won(Math.max(budget, 0))}</span>입니다.
        {" "}오늘 이미 <span className="mono" style={{ fontWeight: 700 }}>{won(todaySpent)}</span> 썼어요.{" "}
        {budget < 0 ? "이번 달 예산을 초과했어요." : over ? "오늘 권장액을 넘었어요, 내일은 조금 아껴볼까요?" : "잘 지키고 있어요, 이대로 좋아요!"}
      </div>
    </div>
  );
}

// ---------- Report ----------
function ReportView({ year, setYear, month, isCurrentMonth, monthTotals, yearTotals, goal, achieveRate, remaining, shiftsNeeded, goalEdit, setGoalEdit, goalInput, setGoalInput, commitGoal, expenseToDate, todaySpent, realToday, taxMode }) {
  const fixedTotal = monthTotals.byCat[FIXED_CAT] || 0;
  const taxInfo = TAX_MODES[taxMode] || TAX_MODES["3.3"];
  const ws = monthTotals.workStats;
  return (
    <div style={{ padding: "16px 20px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 19, fontWeight: 700 }}>정산</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setYear(year - 1)} style={{ padding: 4, background: "transparent", border: "none" }}><ChevronLeft size={16} /></button>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{year}년</span>
          <button onClick={() => setYear(year + 1)} style={{ padding: 4, background: "transparent", border: "none" }}><ChevronRight size={16} /></button>
        </div>
      </div>

      <DailyBudgetCard isCurrentMonth={isCurrentMonth} monthTotals={monthTotals} expenseToDate={expenseToDate} todaySpent={todaySpent} realToday={realToday} year={year} month={month} />

      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8 }}>이번 달 출근 현황</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <MiniStatCard label="A조" value={ws.countA} color={SHIFT_INFO.A1.color} />
        <MiniStatCard label="C조" value={ws.countC} color={SHIFT_INFO.C.color} />
        <MiniStatCard label="A/C조" value={ws.countFull} color={SHIFT_INFO.A1C.color} />
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 16, marginTop: -8 }}>총 출근 <span className="mono" style={{ fontWeight: 700, color: INK }}>{ws.workDays}일</span> · 총 근무 <span className="mono" style={{ fontWeight: 700, color: INK }}>{ws.totalGeun}근</span> <span style={{ color: "#C9BFA8" }}>(A/C조는 2근으로 계산)</span></div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: MUTED }}><Target size={14} /> 이번 달 목표</div>
          {goalEdit ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input autoFocus inputMode="numeric" defaultValue={goal} onChange={(e) => setGoalInput(e.target.value)} className="mono" style={{ width: 100, border: `1px solid ${PAPER_LINE}`, borderRadius: 8, padding: "4px 8px", fontSize: 12 }} />
              <button onClick={commitGoal} style={{ fontSize: 12, fontWeight: 700, color: INDIGO, background: "transparent", border: "none" }}>저장</button>
            </div>
          ) : (
            <button onClick={() => { setGoalEdit(true); setGoalInput(String(goal)); }} className="mono" style={{ fontSize: 12, fontWeight: 700, color: INDIGO, background: "transparent", border: "none" }}>{won(goal)} 수정</button>
          )}
        </div>
        <div style={{ height: 10, background: "#EFEADD", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${achieveRate}%`, background: INDIGO, borderRadius: 6, transition: "width 0.3s" }} />
        </div>
        <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: INDIGO }}>{achieveRate.toFixed(0)}%</div>
        <div style={{ fontSize: 12, color: "#8A8272", marginTop: 4 }}>
          {remaining > 0 ? (<>목표까지 <span className="mono" style={{ fontWeight: 700, color: INK }}>{won(remaining)}</span> 남음 · 조합조 기준 <span className="mono" style={{ fontWeight: 700, color: INK }}>{shiftsNeeded}회</span> 더 필요</>) : "이번 달 목표를 달성했어요 🎉"}
        </div>
      </div>

      <div className="display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{`<${month + 1}월 급여>`}</div>
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
          <InfoTip text="매 수당에서 자동 공제되는 세액을 모아 보여드려요. 5월 종합소득세 신고 시 환급 또는 추가납부를 참고하는 용도예요. 실제 세액은 소득공제 등에 따라 달라질 수 있어요." />
        </div>
        <Row label={`이번 달 ${taxInfo.label}`} value={monthTotals.gross * taxInfo.rate} color={EXPENSE} bold />
        <Row label={`${year}년 누적 ${taxInfo.label}`} value={yearTotals.tax} color={INK} bold big />
      </div>

      <div style={{ background: CARD, border: `1px solid ${PAPER_LINE}`, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 10 }}>{year}년 연간 누적 (종합소득세 신고용)</div>
        <Row label="연간 세전 총수당" value={yearTotals.gross} color={INCOME} />
        <Row label="연간 실수령 추정" value={yearTotals.net} color={INK} bold big />
      </div>
    </div>
  );
}
function MiniStatCard({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: CARD, textAlign: "center", border: `1.3px solid ${color}`, borderRadius: 14, padding: "12px 4px" }}>
      <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color }}>{value}<span style={{ fontSize: 12, fontWeight: 600 }}>회</span></div>
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
function SettingsModal({ settings, onClose, onPatch, onAddRecurring, onToggleRecurring, onDeleteRecurring, onDeleteStorePreset, onExportBackup, onImportBackup, onExportCSV }) {
  const fileRef = useRef(null);
  const [rOne, setROne] = useState(settings.fixedRates?.one || ONE_SHIFT);
  const [rTwo, setRTwo] = useState(settings.fixedRates?.two || TWO_SHIFT);
  const [rHourly, setRHourly] = useState(settings.hourlyRate || DEFAULT_HOURLY);
  const [rDaily, setRDaily] = useState(settings.dailyRate || DEFAULT_DAILY);

  const [type, setType] = useState("expense");
  const [category, setCategory] = useState(FIXED_CAT);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("25");
  const [memo, setMemo] = useState("");

  const submitRecurring = () => {
    const amt = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    const d = Math.min(31, Math.max(1, parseInt(day, 10) || 1));
    if (!amt) return;
    onAddRecurring({ type, category: type === "income" ? (category || "고정수입") : category, amount: amt, day: d, memo });
    setAmount(""); setMemo("");
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
          <SectionTitle>근무 유형</SectionTitle>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <SegButton active={settings.workType === "fixed"} onClick={() => onPatch({ workType: "fixed" })}>매장/조 고정수당형</SegButton>
            <SegButton active={settings.workType === "hourly"} onClick={() => onPatch({ workType: "hourly" })}>시급제</SegButton>
            <SegButton active={settings.workType === "daily"} onClick={() => onPatch({ workType: "daily" })}>일급/공수제</SegButton>
          </div>

          {settings.workType === "fixed" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <RateField label="단일조 A1/A2/C (1근)" value={rOne} setValue={setROne} onCommit={() => onPatch({ fixedRates: { ...settings.fixedRates, one: parseInt(rOne, 10) || ONE_SHIFT } })} />
              <RateField label="조합조 A1C/A2C (2근)" value={rTwo} setValue={setRTwo} onCommit={() => onPatch({ fixedRates: { ...settings.fixedRates, two: parseInt(rTwo, 10) || TWO_SHIFT } })} />
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
            기본 매장 5곳은 항상 유지되고, 캘린더에서 "+ 직접입력"으로 추가한 매장은 여기서 삭제할 수 있어요.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {STORE_PRESETS.map((s) => (
              <span key={s.name} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: `1.3px solid ${s.color}`, color: s.color }}>{s.name}</span>
            ))}
          </div>
          {(settings.customStores || []).length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
              {settings.customStores.map((s) => (
                <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, border: `1.3px solid ${s.color}`, color: s.color }}>
                  {s.name}
                  <button onClick={() => onDeleteStorePreset(s.name)} style={{ display: "flex", padding: 2, background: "transparent", border: "none" }}><X size={12} color={s.color} /></button>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 20 }}>아직 직접 추가한 매장이 없어요.</div>
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
