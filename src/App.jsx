import { useState, useMemo, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, BarChart, Bar, Cell
} from "recharts";

// ─── Константы ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — опытный трейдинг-коуч и риск-менеджер. Анализируй сделки честно и конкретно.
Оцени: RR, дисциплину, эмоциональные ошибки, что исправить, что сделано правильно.
Будь прямым. Профессиональная терминология. Отвечай на русском. Короткие абзацы.`;

const REPORT_PROMPT = `Ты — опытный трейдинг-коуч. Проанализируй все сделки за период.
Структура: 1) ОБЩАЯ ОЦЕНКА 2) СИЛЬНЫЕ СТОРОНЫ 3) ГЛАВНЫЕ ОШИБКИ (топ-3) 4) ЭМОЦИОНАЛЬНЫЙ ПРОФИЛЬ 5) РЕКОМЕНДАЦИИ (3-5 действий).
Ссылайся на конкретные сделки. Отвечай на русском.`;

const DEMO_TRADES = [
  { id: 1, date: "2024-01-10", ticker: "BTCUSDT", direction: "LONG", entry: 42300, exit: 43800, size: 0.1, stopLoss: 41500, takeProfit: 45000, reason: "Пробой сопротивления на объёме", emotion: "Уверен", exchange: "Demo", result: 150, aiAnalysis: null },
  { id: 2, date: "2024-01-13", ticker: "ETHUSDT", direction: "SHORT", entry: 2240, exit: 2310, size: 1, stopLoss: 2300, takeProfit: 2100, reason: "Дивергенция RSI", emotion: "Нервничал", exchange: "Demo", result: -70, aiAnalysis: null },
  { id: 3, date: "2024-01-16", ticker: "SOLUSDT", direction: "LONG", entry: 88.5, exit: 96.2, size: 10, stopLoss: 84, takeProfit: 100, reason: "Отскок от поддержки", emotion: "Спокоен", exchange: "Demo", result: 77, aiAnalysis: null },
  { id: 4, date: "2024-01-19", ticker: "BTCUSDT", direction: "LONG", entry: 41800, exit: 40200, size: 0.05, stopLoss: 40000, takeProfit: 45000, reason: "FOMO после новостей", emotion: "FOMO", exchange: "Demo", result: -80, aiAnalysis: null },
  { id: 5, date: "2024-01-23", ticker: "BNBUSDT", direction: "LONG", entry: 312, exit: 338, size: 2, stopLoss: 300, takeProfit: 345, reason: "Накопление у уровня", emotion: "Спокоен", exchange: "Demo", result: 52, aiAnalysis: null },
  { id: 6, date: "2024-01-27", ticker: "ETHUSDT", direction: "SHORT", entry: 2380, exit: 2290, size: 1.5, stopLoss: 2430, takeProfit: 2200, reason: "Пробой трендовой линии", emotion: "Уверен", exchange: "Demo", result: 135, aiAnalysis: null },
  { id: 7, date: "2024-01-30", ticker: "BTCUSDT", direction: "SHORT", entry: 43100, exit: 44200, size: 0.05, stopLoss: 44000, takeProfit: 40000, reason: "Месть рынку за убыток", emotion: "Жадность", exchange: "Demo", result: -55, aiAnalysis: null },
];

const EMOTIONS = ["Спокоен", "Уверен", "Нервничал", "Страх", "Жадность", "FOMO"];
const EXCHANGES = ["Binance", "Bybit", "Ватага", "Demo"];
const EXCHANGE_COLORS = { Binance: "#f0b90b", Bybit: "#f7931a", "Ватага": "#4fc3f7", Demo: "#8b949e" };

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function calcResult(trade) {
  const dir = trade.direction === "LONG" ? 1 : -1;
  return Math.round((trade.exit - trade.entry) * dir * trade.size * 100) / 100;
}

function calcRR(trade) {
  const risk = Math.abs(trade.entry - trade.stopLoss);
  const reward = Math.abs(trade.takeProfit - trade.entry);
  return risk > 0 ? (reward / risk).toFixed(2) : "—";
}

function fmt(n) {
  const num = Number(n);
  if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toFixed(2);
}

function exportCSV(trades) {
  const header = "Дата,Биржа,Тикер,Направление,Вход,Выход,Стоп,Тейк,Размер,RR,Результат,Эмоции,Причина";
  const rows = trades.map(t => [
    t.date, t.exchange, t.ticker, t.direction, t.entry, t.exit,
    t.stopLoss, t.takeProfit, t.size, calcRR(t), t.result, t.emotion,
    `"${(t.reason || "").replace(/"/g, "'")}"`
  ].join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tradelog.csv";
  a.click();
}

// ─── Вспомогательные компоненты ───────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, padding: "10px 14px", fontFamily: "monospace" }}>
      <div style={{ fontSize: 10, color: "#8b949e", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: "bold", color: val >= 0 ? "#39d353" : "#f85149" }}>
        {val >= 0 ? "+" : ""}{fmt(val)}
      </div>
    </div>
  );
};

// ─── Модалка подключения биржи ────────────────────────────────────────────────

function ExchangeModal({ onClose, onImport }) {
  const [exchange, setExchange] = useState("Binance");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState("30");

  const inp = {
    background: "#0d1117", border: "1px solid #21262d", color: "#e6edf3",
    padding: "9px 12px", borderRadius: 4, fontSize: 13, width: "100%",
    fontFamily: "monospace", outline: "none", boxSizing: "border-box"
  };

  async function handleImport() {
    if (!apiKey) return setError("Введите API Key");
    if (exchange !== "Ватага" && !apiSecret) return setError("Введите API Secret");
    setLoading(true);
    setError("");

    const endTime = Date.now();
    const startTime = endTime - parseInt(days) * 24 * 60 * 60 * 1000;

    try {
      let endpoint = "";
      let body = {};

      if (exchange === "Binance") {
        endpoint = "/api/binance";
        body = { apiKey, apiSecret, startTime, endTime };
      } else if (exchange === "Bybit") {
        endpoint = "/api/bybit";
        body = { apiKey, apiSecret, startTime, endTime, category: "linear" };
      } else if (exchange === "Ватага") {
        endpoint = "/api/vataga";
        body = {
          apiKey,
          dateFrom: new Date(startTime).toISOString(),
          dateTo: new Date(endTime).toISOString(),
        };
      }

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка API");

      onImport(data.trades, exchange);
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 32, width: 480, maxWidth: "95vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ fontSize: 11, color: "#58a6ff", letterSpacing: 3 }}>ПОДКЛЮЧИТЬ БИРЖУ</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        {/* Exchange selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["Binance", "Bybit", "Ватага"].map(ex => (
            <button key={ex} onClick={() => setExchange(ex)} style={{
              flex: 1, padding: "8px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11,
              background: exchange === ex ? "#161b22" : "transparent",
              border: `1px solid ${exchange === ex ? EXCHANGE_COLORS[ex] : "#21262d"}`,
              color: exchange === ex ? EXCHANGE_COLORS[ex] : "#8b949e",
            }}>{ex}</button>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>API KEY</div>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Вставьте API Key" style={inp} />
        </div>

        {exchange !== "Ватага" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>API SECRET</div>
            <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Вставьте API Secret" style={inp} />
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>ПЕРИОД ИМПОРТА</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["7", "30", "90", "180"].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{
                flex: 1, padding: "7px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 11,
                background: days === d ? "#21262d" : "transparent",
                border: `1px solid ${days === d ? "#58a6ff" : "#21262d"}`,
                color: days === d ? "#58a6ff" : "#8b949e",
              }}>{d}д</button>
            ))}
          </div>
        </div>

        {/* Security note */}
        <div style={{ background: "#161b22", borderRadius: 4, padding: "10px 12px", marginBottom: 20, fontSize: 11, color: "#8b949e", lineHeight: 1.5 }}>
          🔒 Ключи передаются на сервер только для подписи запроса и нигде не сохраняются. Используйте ключи только с правом <strong style={{ color: "#e6edf3" }}>Read Only</strong>.
        </div>

        {error && <div style={{ color: "#f85149", fontSize: 12, marginBottom: 12 }}>⚠ {error}</div>}

        <button onClick={handleImport} disabled={loading} style={{
          width: "100%", padding: 12, borderRadius: 4, cursor: loading ? "wait" : "pointer",
          background: "#0a1628", border: "1px solid #58a6ff", color: loading ? "#8b949e" : "#58a6ff",
          fontSize: 11, letterSpacing: 2, fontFamily: "monospace"
        }}>{loading ? "ИМПОРТИРУЮ..." : `⚡ ИМПОРТИРОВАТЬ С ${exchange.toUpperCase()}`}</button>
      </div>
    </div>
  );
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function App() {
  const [trades, setTrades] = useState(() => {
    try {
      const s = localStorage.getItem("tradelog_v2");
      return s ? JSON.parse(s) : DEMO_TRADES;
    } catch { return DEMO_TRADES; }
  });

  const [view, setView] = useState("journal");
  const [loading, setLoading] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [filterExchange, setFilterExchange] = useState("ALL");
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    ticker: "", direction: "LONG", entry: "", exit: "", size: "",
    stopLoss: "", takeProfit: "", reason: "", emotion: "Спокоен", exchange: "Demo"
  });

  useEffect(() => {
    try { localStorage.setItem("tradelog_v2", JSON.stringify(trades)); } catch {}
  }, [trades]);

  const filtered = useMemo(() =>
    filterExchange === "ALL" ? trades : trades.filter(t => t.exchange === filterExchange),
    [trades, filterExchange]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => a.date.localeCompare(b.date)), [filtered]);

  const totalPnL = filtered.reduce((s, t) => s + Number(t.result || 0), 0);
  const wins = filtered.filter(t => Number(t.result) > 0).length;
  const losses = filtered.filter(t => Number(t.result) < 0).length;
  const winRate = filtered.length ? ((wins / filtered.length) * 100).toFixed(0) : 0;
  const avgWin = wins ? (filtered.filter(t => Number(t.result) > 0).reduce((s, t) => s + Number(t.result), 0) / wins) : 0;

  const maxDD = useMemo(() => {
    let cum = 0, peak = 0, dd = 0;
    sorted.forEach(t => {
      cum += Number(t.result);
      if (cum > peak) peak = cum;
      const cur = peak - cum;
      if (cur > dd) dd = cur;
    });
    return dd;
  }, [sorted]);

  const chartData = useMemo(() => {
    let cum = 0;
    return sorted.map(t => {
      cum += Number(t.result);
      return { date: t.date.slice(5), cumPnL: Math.round(cum * 100) / 100, ticker: t.ticker };
    });
  }, [sorted]);

  const isPos = chartData.length ? chartData[chartData.length - 1].cumPnL >= 0 : true;

  const emotionStats = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      if (!map[t.emotion]) map[t.emotion] = { total: 0, pnl: 0 };
      map[t.emotion].total++;
      map[t.emotion].pnl += Number(t.result);
    });
    return Object.entries(map)
      .map(([e, d]) => ({ emotion: e, ...d, avg: Math.round(d.pnl / d.total) }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const tickerStats = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      if (!map[t.ticker]) map[t.ticker] = { total: 0, pnl: 0, wins: 0 };
      map[t.ticker].total++;
      map[t.ticker].pnl += Number(t.result);
      if (Number(t.result) > 0) map[t.ticker].wins++;
    });
    return Object.entries(map)
      .map(([ticker, d]) => ({ ticker, ...d, wr: Math.round(d.wins / d.total * 100) }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [filtered]);

  // Уникальные биржи в данных
  const usedExchanges = useMemo(() => ["ALL", ...new Set(trades.map(t => t.exchange))], [trades]);

  async function callClaude(system, messages, maxTokens = 1200) {
    // В продакшене — через /api/claude
    // В dev — напрямую (нужен ключ в .env)
    const isDev = window.location.hostname === "localhost";
    const url = isDev
      ? "https://api.anthropic.com/v1/messages"
      : "/api/claude";

    const headers = { "Content-Type": "application/json" };
    const body = isDev
      ? JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages })
      : JSON.stringify({ system, messages, max_tokens: maxTokens });

    const resp = await fetch(url, { method: "POST", headers, body });
    const data = await resp.json();
    return data.content?.[0]?.text || "Ошибка";
  }

  async function analyzeWithAI(trade) {
    setLoading(trade.id);
    const prompt = `Проанализируй сделку:
Инструмент: ${trade.ticker} (${trade.exchange})
Направление: ${trade.direction} | Вход: ${trade.entry} | Выход: ${trade.exit}
Стоп: ${trade.stopLoss} | Тейк: ${trade.takeProfit} | Размер: ${trade.size}
Результат: ${trade.result} | RR: ${calcRR(trade)}
Причина: ${trade.reason} | Эмоции: ${trade.emotion}`;
    try {
      const analysis = await callClaude(SYSTEM_PROMPT, [{ role: "user", content: prompt }]);
      setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, aiAnalysis: analysis } : t));
      setSelectedTrade({ ...trade, aiAnalysis: analysis });
      setView("analysis");
    } catch { alert("Ошибка ИИ"); }
    setLoading(null);
  }

  async function generateReport() {
    setReportLoading(true);
    const text = sorted.map((t, i) =>
      `${i + 1}. ${t.date} | ${t.exchange} | ${t.ticker} ${t.direction} | ${t.entry}→${t.exit} | RR 1:${calcRR(t)} | ${Number(t.result) >= 0 ? "+" : ""}${t.result} | ${t.emotion} | ${t.reason}`
    ).join("\n");
    const prompt = `Сделки трейдера:\n\n${text}\n\nСтатистика: ${filtered.length} сделок, WR ${winRate}%, итого ${totalPnL >= 0 ? "+" : ""}${fmt(totalPnL)}, просадка ${fmt(maxDD)}`;
    try {
      const r = await callClaude(REPORT_PROMPT, [{ role: "user", content: prompt }], 1500);
      setReport(r);
    } catch { alert("Ошибка"); }
    setReportLoading(false);
  }

  function addTrade() {
    if (!form.ticker || !form.entry || !form.exit) return;
    const t = {
      ...form, id: Date.now(),
      entry: Number(form.entry), exit: Number(form.exit),
      size: Number(form.size) || 1,
      stopLoss: Number(form.stopLoss), takeProfit: Number(form.takeProfit),
      aiAnalysis: null,
    };
    t.result = calcResult(t);
    setTrades(prev => [...prev, t]);
    setView("journal");
    setForm({ date: new Date().toISOString().split("T")[0], ticker: "", direction: "LONG", entry: "", exit: "", size: "", stopLoss: "", takeProfit: "", reason: "", emotion: "Спокоен", exchange: "Demo" });
  }

  function importTrades(newTrades, exchange) {
    const withIds = newTrades.map(t => ({ ...t, id: t.id || `${exchange}_${Date.now()}_${Math.random()}` }));
    setTrades(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const fresh = withIds.filter(t => !existingIds.has(t.id));
      return [...prev, ...fresh];
    });
  }

  // Styles
  const inp = { background: "#0d1117", border: "1px solid #21262d", color: "#e6edf3", padding: "8px 12px", borderRadius: 4, fontSize: 13, width: "100%", fontFamily: "monospace", outline: "none", boxSizing: "border-box" };
  const navItems = [
    { key: "journal", label: "ЖУРНАЛ" },
    { key: "chart", label: "ГРАФИК" },
    { key: "stats", label: "СТАТИСТИКА" },
    { key: "report", label: "AI-ОТЧЁТ" },
    { key: "add", label: "+ СДЕЛКА" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#010409", color: "#e6edf3", fontFamily: "monospace", backgroundImage: "radial-gradient(ellipse at 20% 50%, #0d1f0d 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #0a1628 0%, transparent 50%)" }}>
      {showModal && <ExchangeModal onClose={() => setShowModal(false)} onImport={importTrades} />}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #21262d", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(13,17,23,0.95)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#39d353", boxShadow: "0 0 8px #39d353" }} />
          <span style={{ fontSize: 13, letterSpacing: 4, color: "#e6edf3", fontWeight: "bold" }}>TRADELOG</span>
          <span style={{ fontSize: 9, color: "#58a6ff", background: "#0a1628", border: "1px solid #1f3a5f", padding: "2px 8px", borderRadius: 3 }}>AI-POWERED</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {navItems.map(({ key, label }) => (
            <button key={key} onClick={() => setView(key)} style={{
              background: view === key ? "#21262d" : "transparent",
              border: `1px solid ${view === key ? "#58a6ff" : "#21262d"}`,
              color: view === key ? "#58a6ff" : "#8b949e",
              padding: "5px 14px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 1.5, fontFamily: "monospace"
            }}>{label}</button>
          ))}
          <button onClick={() => setShowModal(true)} style={{ background: "#0d2e0d", border: "1px solid #39d353", color: "#39d353", padding: "5px 14px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 1, fontFamily: "monospace" }}>⚡ ИМПОРТ</button>
          <button onClick={() => exportCSV(filtered)} style={{ background: "transparent", border: "1px solid #21262d", color: "#8b949e", padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>↓ CSV</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>

        {/* Exchange filter */}
        {view !== "add" && view !== "analysis" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {usedExchanges.map(ex => (
              <button key={ex} onClick={() => setFilterExchange(ex)} style={{
                padding: "4px 14px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 10,
                background: filterExchange === ex ? "#21262d" : "transparent",
                border: `1px solid ${filterExchange === ex ? (EXCHANGE_COLORS[ex] || "#58a6ff") : "#21262d"}`,
                color: filterExchange === ex ? (EXCHANGE_COLORS[ex] || "#58a6ff") : "#8b949e",
              }}>{ex === "ALL" ? "ВСЕ БИРЖИ" : ex}</button>
            ))}
          </div>
        )}

        {/* Stats bar */}
        {view !== "add" && view !== "analysis" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 20 }}>
            {[
              { label: "СДЕЛОК", value: filtered.length, color: "#e6edf3" },
              { label: "ВИНРЕЙТ", value: `${winRate}%`, color: Number(winRate) >= 50 ? "#39d353" : "#f85149" },
              { label: "ПРИБЫЛЬНЫХ", value: wins, color: "#39d353" },
              { label: "УБЫТОЧНЫХ", value: losses, color: "#f85149" },
              { label: "СР. ВЫИГРЫШ", value: `+${fmt(avgWin)}`, color: "#39d353" },
              { label: "МАКС. ПРОСАДКА", value: `-${fmt(maxDD)}`, color: "#f85149" },
              { label: "ИТОГО P&L", value: `${totalPnL >= 0 ? "+" : ""}${fmt(totalPnL)}`, color: totalPnL >= 0 ? "#39d353" : "#f85149" },
            ].map(s => (
              <div key={s.label} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: "12px 14px" }}>
                <div style={{ fontSize: 8, color: "#8b949e", letterSpacing: 2, marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: "bold", color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* JOURNAL */}
        {view === "journal" && (
          <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 70px 65px 80px 80px 70px 85px 1fr 115px 28px", padding: "9px 16px", background: "#161b22", borderBottom: "1px solid #21262d" }}>
              {["ДАТА", "БИРЖА", "ТИКЕР", "НАП.", "ВХОД", "ВЫХОД", "RR", "P&L", "ПРИЧИНА", "", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 9, color: "#8b949e", letterSpacing: 1 }}>{h}</div>
              ))}
            </div>
            {[...filtered].sort((a, b) => b.date.localeCompare(a.date)).map((trade, i, arr) => {
              const pnl = Number(trade.result);
              return (
                <div key={trade.id}
                  style={{ display: "grid", gridTemplateColumns: "90px 80px 70px 65px 80px 80px 70px 85px 1fr 115px 28px", padding: "11px 16px", borderBottom: i < arr.length - 1 ? "1px solid #161b22" : "none", alignItems: "center" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#161b22"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontSize: 11, color: "#8b949e" }}>{trade.date}</div>
                  <div style={{ fontSize: 10, color: EXCHANGE_COLORS[trade.exchange] || "#8b949e" }}>{trade.exchange}</div>
                  <div style={{ fontSize: 12, fontWeight: "bold" }}>{trade.ticker}</div>
                  <div><span style={{ background: trade.direction === "LONG" ? "#0d2e0d" : "#2e0d0d", color: trade.direction === "LONG" ? "#39d353" : "#f85149", padding: "2px 6px", borderRadius: 3, fontSize: 9 }}>{trade.direction}</span></div>
                  <div style={{ fontSize: 11 }}>{trade.entry}</div>
                  <div style={{ fontSize: 11 }}>{trade.exit}</div>
                  <div style={{ fontSize: 11, color: "#58a6ff" }}>1:{calcRR(trade)}</div>
                  <div style={{ fontSize: 13, fontWeight: "bold", color: pnl >= 0 ? "#39d353" : "#f85149" }}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</div>
                  <div style={{ fontSize: 10, color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{trade.reason || "—"}</div>
                  <div>
                    {trade.aiAnalysis
                      ? <button onClick={() => { setSelectedTrade(trade); setView("analysis"); }} style={{ background: "#0d2e1a", border: "1px solid #39d353", color: "#39d353", padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>✓ РАЗБОР</button>
                      : <button onClick={() => analyzeWithAI(trade)} disabled={loading === trade.id} style={{ background: "#0a1628", border: "1px solid #58a6ff", color: loading === trade.id ? "#8b949e" : "#58a6ff", padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>
                        {loading === trade.id ? "..." : "⚡ AI"}
                      </button>}
                  </div>
                  <button onClick={() => setTrades(prev => prev.filter(t => t.id !== trade.id))}
                    style={{ background: "none", border: "none", color: "#3d4450", cursor: "pointer", fontSize: 16 }}
                    onMouseEnter={e => e.target.style.color = "#f85149"}
                    onMouseLeave={e => e.target.style.color = "#3d4450"}>×</button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#8b949e", fontSize: 12 }}>
                Нет сделок. Нажмите «⚡ ИМПОРТ» или «+ СДЕЛКА».
              </div>
            )}
          </div>
        )}

        {/* CHART */}
        {view === "chart" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: isPos ? "#39d353" : "#f85149", boxShadow: `0 0 6px ${isPos ? "#39d353" : "#f85149"}` }} />
                  <span style={{ fontSize: 10, color: "#8b949e", letterSpacing: 3 }}>КРИВАЯ ДОХОДНОСТИ</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: "bold", color: totalPnL >= 0 ? "#39d353" : "#f85149" }}>{totalPnL >= 0 ? "+" : ""}{fmt(totalPnL)}</div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPos ? "#39d353" : "#f85149"} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={isPos ? "#39d353" : "#f85149"} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#161b22" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#21262d" }} tickLine={false} />
                  <YAxis tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={v => `${v >= 0 ? "+" : ""}${fmt(v)}`} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#30363d" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="cumPnL" stroke={isPos ? "#39d353" : "#f85149"} strokeWidth={2} fill="url(#g)" dot={{ fill: isPos ? "#39d353" : "#f85149", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: "#fff", stroke: isPos ? "#39d353" : "#f85149", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 24 }}>
              <div style={{ fontSize: 10, color: "#8b949e", letterSpacing: 2, marginBottom: 16 }}>РЕЗУЛЬТАТ ПО СДЕЛКАМ</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={sorted.map(t => ({ name: t.ticker, pnl: Number(t.result), date: t.date.slice(5) }))} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#30363d" />
                  <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                    {sorted.map((t, i) => <Cell key={i} fill={Number(t.result) >= 0 ? "#39d353" : "#f85149"} opacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* STATS */}
        {view === "stats" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 20 }}>
              <div style={{ fontSize: 10, color: "#8b949e", letterSpacing: 2, marginBottom: 16 }}>ЭМОЦИИ → РЕЗУЛЬТАТ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 55px 80px 80px", marginBottom: 8 }}>
                {["ЭМОЦИЯ", "СДЕЛ.", "P&L", "СР."].map(h => <div key={h} style={{ fontSize: 9, color: "#8b949e", letterSpacing: 1, paddingBottom: 8, borderBottom: "1px solid #21262d" }}>{h}</div>)}
              </div>
              {emotionStats.map(e => (
                <div key={e.emotion} style={{ display: "grid", gridTemplateColumns: "1fr 55px 80px 80px", padding: "8px 0", borderBottom: "1px solid #0d1117" }}>
                  <div style={{ fontSize: 12 }}>{e.emotion}</div>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>{e.total}</div>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: e.pnl >= 0 ? "#39d353" : "#f85149" }}>{e.pnl >= 0 ? "+" : ""}{fmt(e.pnl)}</div>
                  <div style={{ fontSize: 12, color: e.avg >= 0 ? "#39d353" : "#f85149" }}>{e.avg >= 0 ? "+" : ""}{fmt(e.avg)}</div>
                </div>
              ))}
              {emotionStats.filter(e => e.avg < 0).length > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: "#161b22", borderRadius: 4, fontSize: 11, color: "#c9d1d9", lineHeight: 1.6 }}>
                  ⚠️ Убыточные состояния: <strong style={{ color: "#f85149" }}>{emotionStats.filter(e => e.avg < 0).map(e => e.emotion).join(", ")}</strong>. Рассмотри правило — не входить в рынок в этих состояниях.
                </div>
              )}
            </div>

            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 20 }}>
              <div style={{ fontSize: 10, color: "#8b949e", letterSpacing: 2, marginBottom: 16 }}>ТОП ТИКЕРЫ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 55px 65px 75px", marginBottom: 8 }}>
                {["ТИКЕР", "СДЕЛ.", "WR%", "P&L"].map(h => <div key={h} style={{ fontSize: 9, color: "#8b949e", letterSpacing: 1, paddingBottom: 8, borderBottom: "1px solid #21262d" }}>{h}</div>)}
              </div>
              {tickerStats.map(t => (
                <div key={t.ticker} style={{ display: "grid", gridTemplateColumns: "1fr 55px 65px 75px", padding: "8px 0", borderBottom: "1px solid #0d1117" }}>
                  <div style={{ fontSize: 12, fontWeight: "bold" }}>{t.ticker}</div>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>{t.total}</div>
                  <div style={{ fontSize: 12, color: t.wr >= 50 ? "#39d353" : "#f85149" }}>{t.wr}%</div>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: t.pnl >= 0 ? "#39d353" : "#f85149" }}>{t.pnl >= 0 ? "+" : ""}{fmt(t.pnl)}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 20 }}>
              <div style={{ fontSize: 10, color: "#8b949e", letterSpacing: 2, marginBottom: 16 }}>LONG vs SHORT</div>
              {["LONG", "SHORT"].map(dir => {
                const dt = filtered.filter(t => t.direction === dir);
                const dw = dt.filter(t => Number(t.result) > 0).length;
                const dpnl = dt.reduce((s, t) => s + Number(t.result), 0);
                const wr = dt.length ? Math.round(dw / dt.length * 100) : 0;
                return (
                  <div key={dir} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: dir === "LONG" ? "#39d353" : "#f85149", fontSize: 13, fontWeight: "bold" }}>{dir}</span>
                      <span style={{ fontSize: 13, color: dpnl >= 0 ? "#39d353" : "#f85149" }}>{dpnl >= 0 ? "+" : ""}{fmt(dpnl)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#8b949e", marginBottom: 6 }}>Сделок: {dt.length} · WR: {wr}%</div>
                    <div style={{ height: 4, background: "#21262d", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${wr}%`, background: dir === "LONG" ? "#39d353" : "#f85149", borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 20 }}>
              <div style={{ fontSize: 10, color: "#8b949e", letterSpacing: 2, marginBottom: 16 }}>ЛУЧШАЯ / ХУДШАЯ СДЕЛКА</div>
              {[
                { label: "🏆 ЛУЧШАЯ", trade: [...filtered].sort((a, b) => Number(b.result) - Number(a.result))[0], color: "#39d353" },
                { label: "💀 ХУДШАЯ", trade: [...filtered].sort((a, b) => Number(a.result) - Number(b.result))[0], color: "#f85149" },
              ].map(({ label, trade, color }) => trade && (
                <div key={label} style={{ marginBottom: 14, padding: 14, background: "#161b22", borderRadius: 4, borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontSize: 9, color: "#8b949e", marginBottom: 6 }}>{label}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: "bold" }}>{trade.ticker} {trade.direction}</span>
                    <span style={{ fontSize: 14, fontWeight: "bold", color }}>{Number(trade.result) >= 0 ? "+" : ""}{fmt(Number(trade.result))}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#8b949e" }}>{trade.date} · {trade.exchange} · {trade.emotion}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI REPORT */}
        {view === "report" && (
          <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 28, maxWidth: 800 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#58a6ff", boxShadow: "0 0 6px #58a6ff" }} />
                <span style={{ fontSize: 10, color: "#58a6ff", letterSpacing: 3 }}>AI-ОТЧЁТ ПО ВСЕМ СДЕЛКАМ</span>
              </div>
              <button onClick={generateReport} disabled={reportLoading} style={{ background: "#0a1628", border: "1px solid #58a6ff", color: reportLoading ? "#8b949e" : "#58a6ff", padding: "8px 20px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace" }}>
                {reportLoading ? "АНАЛИЗИРУЮ..." : "⚡ СГЕНЕРИРОВАТЬ ОТЧЁТ"}
              </button>
            </div>
            {!report && !reportLoading && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#8b949e" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
                <div style={{ fontSize: 12 }}>ИИ проанализирует все {filtered.length} сделок и найдёт паттерны ошибок</div>
              </div>
            )}
            {reportLoading && <div style={{ textAlign: "center", padding: "60px 0", color: "#58a6ff", fontSize: 12, letterSpacing: 2 }}>АНАЛИЗИРУЮ {filtered.length} СДЕЛОК...</div>}
            {report && <div style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{report}</div>}
          </div>
        )}

        {/* ADD */}
        {view === "add" && (
          <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 28, maxWidth: 700 }}>
            <div style={{ fontSize: 11, color: "#58a6ff", letterSpacing: 3, marginBottom: 24 }}>НОВАЯ СДЕЛКА</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { label: "ДАТА", key: "date", type: "date" },
                { label: "ТИКЕР", key: "ticker", placeholder: "BTCUSDT, SBER..." },
                { label: "ЦЕНА ВХОДА", key: "entry", type: "number", placeholder: "42300" },
                { label: "ЦЕНА ВЫХОДА", key: "exit", type: "number", placeholder: "43800" },
                { label: "СТОП-ЛОСС", key: "stopLoss", type: "number", placeholder: "41500" },
                { label: "ТЕЙК-ПРОФИТ", key: "takeProfit", type: "number", placeholder: "45000" },
                { label: "РАЗМЕР", key: "size", type: "number", placeholder: "0.1" },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>{f.label}</div>
                  <input type={f.type || "text"} placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inp} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>НАПРАВЛЕНИЕ</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["LONG", "SHORT"].map(d => (
                    <button key={d} onClick={() => setForm(p => ({ ...p, direction: d }))} style={{ flex: 1, padding: 8, borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 12, letterSpacing: 2, background: form.direction === d ? (d === "LONG" ? "#0d2e0d" : "#2e0d0d") : "#0d1117", border: `1px solid ${form.direction === d ? (d === "LONG" ? "#39d353" : "#f85149") : "#21262d"}`, color: form.direction === d ? (d === "LONG" ? "#39d353" : "#f85149") : "#8b949e" }}>{d}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live preview */}
            {form.entry && form.exit && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#161b22", borderRadius: 4, display: "flex", gap: 24, fontSize: 12 }}>
                {form.stopLoss && form.takeProfit && <span style={{ color: "#8b949e" }}>RR: <strong style={{ color: "#58a6ff" }}>1:{calcRR({ entry: Number(form.entry), stopLoss: Number(form.stopLoss), takeProfit: Number(form.takeProfit) })}</strong></span>}
                <span style={{ color: "#8b949e" }}>Результат: <strong style={{ color: calcResult({ entry: Number(form.entry), exit: Number(form.exit), direction: form.direction, size: Number(form.size) || 1 }) >= 0 ? "#39d353" : "#f85149" }}>{calcResult({ entry: Number(form.entry), exit: Number(form.exit), direction: form.direction, size: Number(form.size) || 1 }) >= 0 ? "+" : ""}{fmt(calcResult({ entry: Number(form.entry), exit: Number(form.exit), direction: form.direction, size: Number(form.size) || 1 }))}</strong></span>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>БИРЖА</div>
              <div style={{ display: "flex", gap: 8 }}>
                {EXCHANGES.map(ex => (
                  <button key={ex} onClick={() => setForm(p => ({ ...p, exchange: ex }))} style={{ padding: "6px 14px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 10, background: form.exchange === ex ? "#21262d" : "transparent", border: `1px solid ${form.exchange === ex ? (EXCHANGE_COLORS[ex] || "#58a6ff") : "#21262d"}`, color: form.exchange === ex ? (EXCHANGE_COLORS[ex] || "#58a6ff") : "#8b949e" }}>{ex}</button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>ПРИЧИНА ВХОДА</div>
              <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Почему вошёл?" rows={3} style={{ ...inp, resize: "vertical" }} />
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 6 }}>ЭМОЦИОНАЛЬНОЕ СОСТОЯНИЕ</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {EMOTIONS.map(e => (
                  <button key={e} onClick={() => setForm(p => ({ ...p, emotion: e }))} style={{ padding: "6px 14px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 11, background: form.emotion === e ? "#21262d" : "transparent", border: `1px solid ${form.emotion === e ? "#58a6ff" : "#21262d"}`, color: form.emotion === e ? "#58a6ff" : "#8b949e" }}>{e}</button>
                ))}
              </div>
            </div>
            <button onClick={addTrade} style={{ marginTop: 24, width: "100%", padding: 12, borderRadius: 4, background: "#0a1628", border: "1px solid #58a6ff", color: "#58a6ff", cursor: "pointer", fontSize: 11, letterSpacing: 3, fontFamily: "monospace" }}>ДОБАВИТЬ СДЕЛКУ →</button>
          </div>
        )}

        {/* ANALYSIS */}
        {view === "analysis" && selectedTrade && (
          <div>
            <button onClick={() => setView("journal")} style={{ background: "transparent", border: "1px solid #21262d", color: "#8b949e", padding: "6px 16px", borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 2, fontFamily: "monospace", marginBottom: 16 }}>← НАЗАД</button>
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 20 }}>
                <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 16 }}>ПАРАМЕТРЫ СДЕЛКИ</div>
                {[
                  ["БИРЖА", selectedTrade.exchange],
                  ["ТИКЕР", selectedTrade.ticker],
                  ["НАПРАВЛЕНИЕ", selectedTrade.direction],
                  ["ВХОД", selectedTrade.entry],
                  ["ВЫХОД", selectedTrade.exit],
                  ["СТОП", selectedTrade.stopLoss],
                  ["ТЕЙК", selectedTrade.takeProfit],
                  ["RR", `1:${calcRR(selectedTrade)}`],
                  ["РЕЗУЛЬТАТ", `${Number(selectedTrade.result) >= 0 ? "+" : ""}${fmt(Number(selectedTrade.result))}`],
                  ["ЭМОЦИИ", selectedTrade.emotion],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #161b22" }}>
                    <span style={{ fontSize: 9, color: "#8b949e", letterSpacing: 1 }}>{k}</span>
                    <span style={{ fontSize: 12, color: k === "РЕЗУЛЬТАТ" ? (Number(selectedTrade.result) >= 0 ? "#39d353" : "#f85149") : "#e6edf3" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#58a6ff", boxShadow: "0 0 6px #58a6ff" }} />
                  <span style={{ fontSize: 9, color: "#58a6ff", letterSpacing: 3 }}>AI-РАЗБОР СДЕЛКИ</span>
                </div>
                <div style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{selectedTrade.aiAnalysis}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
