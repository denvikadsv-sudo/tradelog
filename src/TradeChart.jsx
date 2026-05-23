import { useEffect, useRef, useState } from "react";

const TIMEFRAMES = [
  { label: "1м", interval: "1" },
  { label: "5м", interval: "5" },
  { label: "15м", interval: "15" },
  { label: "30м", interval: "30" },
  { label: "1ч", interval: "60" },
  { label: "4ч", interval: "240" },
  { label: "1д", interval: "D" },
];

export default function TradeChart({ trade, onClose }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [tf, setTf] = useState("15");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pct, setPct] = useState(null);

  // Вычисляем % между входом и выходом
  useEffect(() => {
    if (trade.entry && trade.exit) {
      const dir = trade.direction === "LONG" ? 1 : -1;
      const p = ((trade.exit - trade.entry) / trade.entry * 100 * dir);
      setPct(p.toFixed(2));
    }
  }, [trade]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Если библиотека уже загружена — сразу инициализируем
    if (window.LightweightCharts) {
      initChart();
      return;
    }

    // Иначе загружаем
    const existing = document.getElementById("lwc-script");
    if (existing) {
      existing.addEventListener("load", initChart);
      return () => existing.removeEventListener("load", initChart);
    }

    const script = document.createElement("script");
    script.id = "lwc-script";
    script.src = "https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js";
    script.onload = () => initChart();
    document.head.appendChild(script);

    return () => {
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && seriesRef.current) loadCandles();
  }, [tf]);

  function initChart() {
    if (!containerRef.current || !window.LightweightCharts) return;

    const chart = window.LightweightCharts.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: { background: { color: "#0d1117" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#161b22" }, horzLines: { color: "#161b22" } },
      crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#21262d" },
      timeScale: { borderColor: "#21262d", timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#39d353",
      downColor: "#f85149",
      borderUpColor: "#39d353",
      borderDownColor: "#f85149",
      wickUpColor: "#39d353",
      wickDownColor: "#f85149",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    loadCandles();
  }

  async function loadCandles() {
    if (!seriesRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const tradeDate = new Date(trade.date);
      const startMs = tradeDate.getTime() - 3 * 24 * 60 * 60 * 1000;
      const endMs = tradeDate.getTime() + 3 * 24 * 60 * 60 * 1000;

      const resp = await fetch(`/api/candles?symbol=${trade.ticker}&start=${startMs}&end=${endMs}&interval=${tf}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      if (!data.candles?.length) throw new Error("Нет данных по этому тикеру");

      seriesRef.current.setData(data.candles);

      // Маркеры входа и выхода
      const entryTime = Math.floor(new Date(trade.date).getTime() / 1000);
      // Находим ближайшую свечу к дате сделки
      const nearest = data.candles.reduce((prev, cur) =>
        Math.abs(cur.time - entryTime) < Math.abs(prev.time - entryTime) ? cur : prev
      );

      const markers = [];

      // Вход
      markers.push({
        time: nearest.time,
        position: trade.direction === "LONG" ? "belowBar" : "aboveBar",
        color: "#39d353",
        shape: trade.direction === "LONG" ? "arrowUp" : "arrowDown",
        text: `ВХОД ${trade.entry}`,
        size: 2,
      });

      // Выход (если есть и отличается от входа)
      if (trade.exit && trade.exit !== trade.entry) {
        // Ищем свечу чуть позже входа
        const exitCandle = data.candles.find(c => c.time > nearest.time) || nearest;
        markers.push({
          time: exitCandle.time,
          position: trade.direction === "LONG" ? "aboveBar" : "belowBar",
          color: Number(trade.result) >= 0 ? "#39d353" : "#f85149",
          shape: trade.direction === "LONG" ? "arrowDown" : "arrowUp",
          text: `ВЫХОД ${trade.exit}`,
          size: 2,
        });
      }

      seriesRef.current.setMarkers(markers);

      // Линии входа/выхода/стопа/тейка
      const lines = [];
      if (trade.entry) lines.push({
        price: trade.entry,
        color: "#39d353",
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: "ВХОД",
      });
      if (trade.exit && trade.exit !== trade.entry) lines.push({
        price: trade.exit,
        color: Number(trade.result) >= 0 ? "#39d353" : "#f85149",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "ВЫХОД",
      });
      if (trade.stopLoss > 0) lines.push({
        price: trade.stopLoss,
        color: "#f85149",
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: "СТОП",
      });
      if (trade.takeProfit > 0) lines.push({
        price: trade.takeProfit,
        color: "#39d353",
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: "ТЕЙК",
      });

      lines.forEach(l => seriesRef.current.createPriceLine(l));

      // Фитируем видимую область вокруг сделки
      chartRef.current.timeScale().fitContent();

    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const pnl = Number(trade.result);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 20, width: "min(1000px, 96vw)", maxHeight: "92vh", overflow: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: "bold", fontFamily: "monospace" }}>{trade.ticker}</span>
            <span style={{ background: trade.direction === "LONG" ? "#0d2e0d" : "#2e0d0d", color: trade.direction === "LONG" ? "#39d353" : "#f85149", padding: "2px 8px", borderRadius: 3, fontSize: 11, fontFamily: "monospace" }}>{trade.direction}</span>
            <span style={{ fontSize: 13, fontWeight: "bold", color: pnl >= 0 ? "#39d353" : "#f85149", fontFamily: "monospace" }}>{pnl >= 0 ? "+" : ""}{pnl} USDT</span>
            {pct !== null && (
              <span style={{ background: "#161b22", border: `1px solid ${Number(pct) >= 0 ? "#39d353" : "#f85149"}`, color: Number(pct) >= 0 ? "#39d353" : "#f85149", padding: "2px 10px", borderRadius: 3, fontSize: 12, fontFamily: "monospace", fontWeight: "bold" }}>
                {Number(pct) >= 0 ? "+" : ""}{pct}%
              </span>
            )}
            <span style={{ fontSize: 11, color: "#8b949e", fontFamily: "monospace" }}>{trade.date}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 22 }}>×</button>
        </div>

        {/* Таймфреймы */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {TIMEFRAMES.map(t => (
            <button key={t.interval} onClick={() => setTf(t.interval)} style={{
              padding: "4px 12px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace", fontSize: 11,
              background: tf === t.interval ? "#21262d" : "transparent",
              border: `1px solid ${tf === t.interval ? "#58a6ff" : "#21262d"}`,
              color: tf === t.interval ? "#58a6ff" : "#8b949e",
            }}>{t.label}</button>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 10, color: "#8b949e", alignSelf: "center", fontFamily: "monospace" }}>
            🖱 колесо — масштаб · перетащить — прокрутка
          </div>
        </div>

        {/* График */}
        <div style={{ position: "relative", borderRadius: 4, overflow: "hidden", border: "1px solid #21262d" }}>
          <div ref={containerRef} style={{ width: "100%", minHeight: 420 }} />
          {loading && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(13,17,23,0.8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#58a6ff", fontFamily: "monospace", fontSize: 12 }}>
              ЗАГРУЖАЮ СВЕЧИ...
            </div>
          )}
          {error && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(13,17,23,0.9)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <div style={{ color: "#f85149", fontFamily: "monospace", fontSize: 12 }}>⚠ {error}</div>
              <div style={{ color: "#8b949e", fontFamily: "monospace", fontSize: 10 }}>График доступен только для сделок с Bybit</div>
            </div>
          )}
        </div>

        {/* Инфо */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 14 }}>
          {[
            ["ВХОД", trade.entry, "#e6edf3"],
            ["ВЫХОД", trade.exit, "#e6edf3"],
            ["ИЗМЕНЕНИЕ", pct !== null ? `${Number(pct) >= 0 ? "+" : ""}${pct}%` : "—", Number(pct) >= 0 ? "#39d353" : "#f85149"],
            ["СТОП", trade.stopLoss || "—", "#f85149"],
            ["ТЕЙК", trade.takeProfit || "—", "#39d353"],
            ["RR", trade.stopLoss > 0 && trade.takeProfit > 0 ? `1:${(Math.abs(trade.takeProfit - trade.entry) / Math.abs(trade.entry - trade.stopLoss)).toFixed(2)}` : "—", "#58a6ff"],
          ].map(([k, v, color]) => (
            <div key={k} style={{ background: "#161b22", borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 4, fontFamily: "monospace" }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: "bold", color, fontFamily: "monospace" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
