import { useEffect, useRef, useState } from "react";

export default function TradeChart({ trade, onClose }) {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // Конвертируем дату сделки в timestamp
        const tradeDate = new Date(trade.date);
        const startMs = tradeDate.getTime() - 2 * 60 * 60 * 1000; // -2ч
        const endMs = tradeDate.getTime() + 6 * 60 * 60 * 1000;   // +6ч

        const resp = await fetch(`/api/candles?symbol=${trade.ticker}&start=${startMs}&end=${endMs}`);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        setCandles(data.candles || []);
      } catch (e) {
        setError(e.message);
      }
      setLoading(false);
    }
    load();
  }, [trade]);

  useEffect(() => {
    if (!candles.length || !canvasRef.current) return;
    drawChart();
  }, [candles]);

  function drawChart() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 20, right: 80, bottom: 40, left: 10 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    if (!candles.length) return;

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const maxP = Math.max(...highs, trade.entry, trade.exit);
    const minP = Math.min(...lows, trade.entry, trade.exit);
    const range = maxP - minP || 1;

    const toX = i => PAD.left + (i / (candles.length - 1)) * chartW;
    const toY = p => PAD.top + chartH - ((p - minP) / range) * chartH;
    const candleW = Math.max(2, Math.floor(chartW / candles.length) - 1);

    // Grid
    ctx.strokeStyle = "#161b22";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      const price = maxP - (range / 4) * i;
      ctx.fillStyle = "#8b949e";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(price.toFixed(price > 100 ? 1 : 4), W - PAD.right + 4, y + 4);
    }

    // Свечи
    candles.forEach((c, i) => {
      const x = toX(i);
      const isGreen = c.close >= c.open;
      const color = isGreen ? "#39d353" : "#f85149";
      const bodyTop = toY(Math.max(c.open, c.close));
      const bodyBot = toY(Math.min(c.open, c.close));
      const bodyH = Math.max(1, bodyBot - bodyTop);

      // Тень
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      // Тело
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });

    // Линия входа
    const entryY = toY(trade.entry);
    ctx.strokeStyle = "#39d353";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, entryY); ctx.lineTo(W - PAD.right, entryY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#39d353";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`ВХОД ${trade.entry}`, W - PAD.right + 4, entryY + 4);

    // Линия выхода
    if (trade.exit && trade.exit !== trade.entry) {
      const exitY = toY(trade.exit);
      const exitColor = Number(trade.result) >= 0 ? "#39d353" : "#f85149";
      ctx.strokeStyle = exitColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(PAD.left, exitY); ctx.lineTo(W - PAD.right, exitY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = exitColor;
      ctx.fillText(`ВЫХОД ${trade.exit}`, W - PAD.right + 4, exitY + 4);
    }

    // Стоп
    if (trade.stopLoss && trade.stopLoss > 0) {
      const slY = toY(trade.stopLoss);
      ctx.strokeStyle = "#f85149";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.left, slY); ctx.lineTo(W - PAD.right, slY); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }

    // Тейк
    if (trade.takeProfit && trade.takeProfit > 0) {
      const tpY = toY(trade.takeProfit);
      ctx.strokeStyle = "#39d353";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.left, tpY); ctx.lineTo(W - PAD.right, tpY); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }

    // Дата снизу
    ctx.fillStyle = "#8b949e";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    [0, Math.floor(candles.length/4), Math.floor(candles.length/2), Math.floor(candles.length*3/4), candles.length-1].forEach(i => {
      if (candles[i]) {
        const d = new Date(candles[i].time * 1000);
        const label = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        ctx.fillText(label, toX(i), H - PAD.bottom + 14);
      }
    });
  }

  const pnl = Number(trade.result);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 24, width: "min(900px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: "bold", fontFamily: "monospace" }}>{trade.ticker}</span>
            <span style={{ background: trade.direction === "LONG" ? "#0d2e0d" : "#2e0d0d", color: trade.direction === "LONG" ? "#39d353" : "#f85149", padding: "2px 8px", borderRadius: 3, fontSize: 11 }}>{trade.direction}</span>
            <span style={{ fontSize: 13, fontWeight: "bold", color: pnl >= 0 ? "#39d353" : "#f85149" }}>{pnl >= 0 ? "+" : ""}{pnl} USDT</span>
            <span style={{ fontSize: 11, color: "#8b949e" }}>{trade.date}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 20, fontFamily: "monospace" }}>×</button>
        </div>

        {/* Легенда */}
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 10, fontFamily: "monospace" }}>
          <span style={{ color: "#39d353" }}>── ВХОД {trade.entry}</span>
          <span style={{ color: pnl >= 0 ? "#39d353" : "#f85149" }}>── ВЫХОД {trade.exit}</span>
          {trade.stopLoss > 0 && <span style={{ color: "#f85149", opacity: 0.6 }}>- - СТОП {trade.stopLoss}</span>}
          {trade.takeProfit > 0 && <span style={{ color: "#39d353", opacity: 0.6 }}>- - ТЕЙК {trade.takeProfit}</span>}
        </div>

        {/* График */}
        {loading && <div style={{ textAlign: "center", padding: 60, color: "#58a6ff", fontFamily: "monospace", fontSize: 12 }}>ЗАГРУЖАЮ СВЕЧИ...</div>}
        {error && <div style={{ textAlign: "center", padding: 60, color: "#f85149", fontFamily: "monospace", fontSize: 12 }}>⚠ {error}<br/><span style={{color:"#8b949e",fontSize:10}}>График доступен только для сделок с Bybit</span></div>}
        {!loading && !error && (
          <canvas ref={canvasRef} width={860} height={400} style={{ width: "100%", borderRadius: 4, border: "1px solid #21262d" }} />
        )}

        {/* Инфо */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 16 }}>
          {[
            ["ВХОД", trade.entry],
            ["ВЫХОД", trade.exit],
            ["СТОП", trade.stopLoss || "—"],
            ["ТЕЙК", trade.takeProfit || "—"],
            ["RR", `1:${trade.stopLoss ? (Math.abs(trade.takeProfit - trade.entry) / Math.abs(trade.entry - trade.stopLoss)).toFixed(2) : "—"}`],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "#161b22", borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: 2, marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: "bold" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
