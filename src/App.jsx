import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Wind, Droplets, Eye, Gauge,
  Sunrise, Sunset, RefreshCw, AlertCircle,
  ArrowUpRight, ArrowUp, ArrowDown,
  Umbrella, Navigation,
} from "lucide-react";

// ─── API base — matches your Express server ───────────────────────────────────
const API_BASE = "http://localhost:5000/api/weather";

// ─── Theme by condition text (WeatherAPI uses text, not OWM codes) ────────────
const getTheme = (conditionText = "") => {
  const t = conditionText.toLowerCase();
  if (t.includes("sunny") || t.includes("clear"))
    return { accent: "#FFD447", bg: "#080600", particle: "#FFD44760" };
  if (t.includes("thunder") || t.includes("storm"))
    return { accent: "#C39BD3", bg: "#070410", particle: "#C39BD350" };
  if (t.includes("snow") || t.includes("sleet") || t.includes("blizzard"))
    return { accent: "#DFF0FF", bg: "#050810", particle: "#DFF0FF60" };
  if (t.includes("rain") || t.includes("shower"))
    return { accent: "#5DADE2", bg: "#04080F", particle: "#5DADE240" };
  if (t.includes("drizzle") || t.includes("mist") || t.includes("fog"))
    return { accent: "#7FC8F8", bg: "#05090F", particle: "#7FC8F840" };
  if (t.includes("cloud") || t.includes("overcast"))
    return { accent: "#A8C4FF", bg: "#060810", particle: "#A8C4FF50" };
  return { accent: "#FFD447", bg: "#080600", particle: "#FFD44750" };
};

// ─── Particle background ──────────────────────────────────────────────────────
function ParticleCanvas({ color }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const W = canvas.width, H = canvas.height;
    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.6 + 0.4,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      o: Math.random() * 0.4 + 0.1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      pts.forEach(p => {
        p.x = (p.x + p.vx + W) % W;
        p.y = (p.y + p.vy + H) % H;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = p.o;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return (
    <canvas
      ref={ref}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Backend already returns temp_c and temp_f — no conversion needed
const displayTemp = (c, f, unit) => {
  const val = unit === "C" ? c : f;
  return val != null ? Math.round(val) : "--";
};

// Forecast maxTemp/minTemp are always °C from backend
const displayForecastTemp = (c, unit) => {
  if (c == null) return "--";
  return unit === "C" ? Math.round(c) : Math.round(c * 9 / 5 + 32);
};

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const fmtDay = (dateStr) => DAYS[new Date(dateStr).getDay()];

// ─── Stat pill ────────────────────────────────────────────────────────────────
const StatPill = ({ icon: Icon, label, value, accent }) => (
  <div style={{
    border: `1px solid ${accent}20`, borderRadius: "10px",
    padding: "12px 16px", display: "flex", flexDirection: "column", gap: "6px",
    background: `${accent}08`, flex: "1 1 110px", minWidth: 0,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <Icon size={12} color={accent} />
      <span style={{ fontSize: "9px", letterSpacing: "0.14em", color: "#888", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
    </div>
    <span style={{ fontSize: "19px", fontWeight: 700, color: "#fff", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}>{value}</span>
  </div>
);

// ─── Forecast card — uses WeatherAPI icon URL directly ────────────────────────
const ForecastCard = ({ day, condition, icon, maxTemp, minTemp, chanceOfRain, accent, unit }) => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center", gap: "7px",
    flex: "1 1 0", minWidth: "54px", padding: "14px 6px",
    borderLeft: "1px solid #ffffff08",
  }}>
    <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", color: "#888", textTransform: "uppercase" }}>{day}</span>
    {/* WeatherAPI provides icon URLs directly */}
    <img
      src={`https:${icon}`}
      alt={condition}
      title={condition}
      style={{ width: "32px", height: "32px", objectFit: "contain" }}
    />
    <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "'Bebas Neue', sans-serif" }}>
      {displayForecastTemp(maxTemp, unit)}°
    </span>
    <span style={{ fontSize: "12px", color: "#666", fontFamily: "'Bebas Neue', sans-serif" }}>
      {displayForecastTemp(minTemp, unit)}°
    </span>
    {chanceOfRain > 0 && (
      <span style={{ fontSize: "9px", color: accent, letterSpacing: "0.04em" }}>{chanceOfRain}%</span>
    )}
  </div>
);

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery]         = useState("");
  const [weather, setWeather]     = useState(null);   // formattedData from /current/:city
  const [forecast, setForecast]   = useState(null);   // array from /forecast/:city
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [unit, setUnit]           = useState("C");
  const [lastCity, setLastCity]   = useState("");
  const [time, setTime]           = useState(new Date());
  const [revealed, setRevealed]   = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchWeather = useCallback(async (city) => {
    if (!city.trim()) return;
    setLoading(true); setError(null); setRevealed(false);
    try {
      // Matches your routes: GET /api/weather/current/:city  &  GET /api/weather/forecast/:city
      const [wRes, fRes] = await Promise.all([
        fetch(`${API_BASE}/current/${encodeURIComponent(city)}`),
        fetch(`${API_BASE}/forecast/${encodeURIComponent(city)}`),
      ]);

      if (!wRes.ok) {
        // Your errorHandler returns { success: false, message }
        const err = await wRes.json().catch(() => ({}));
        throw new Error(err.message || "City not found.");
      }

      const wData = await wRes.json();           // { location, current }
      const fData = fRes.ok ? await fRes.json() : [];  // [ { date, maxTemp, minTemp, condition, icon, chanceOfRain, maxWind } ]

      setWeather(wData);
      setForecast(Array.isArray(fData) ? fData : []);
      setLastCity(city);
      setTimeout(() => setRevealed(true), 50);
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setWeather(null); setForecast(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e) => { e.preventDefault(); fetchWeather(query); };

  // Derive theme from condition text (WeatherAPI style)
  const conditionText = weather?.current?.condition?.text || "";
  const { accent, bg, particle } = getTheme(conditionText);

  const fade = (delay = 0) => ({
    opacity: revealed ? 1 : 0,
    transform: revealed ? "translateY(0)" : "translateY(14px)",
    transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
  });

  return (
    <div style={{ minHeight: "100vh", background: bg, transition: "background 1.5s ease", fontFamily: "'DM Mono', monospace", position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet" />

      <ParticleCanvas color={particle} />

      {/* Glow blobs */}
      <div style={{ position: "fixed", top: "-200px", right: "-200px", width: "560px", height: "560px", borderRadius: "50%", background: `radial-gradient(circle, ${accent}15 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0, transition: "background 1.5s ease" }} />
      <div style={{ position: "fixed", bottom: "-200px", left: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: `radial-gradient(circle, ${accent}08 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0, transition: "background 1.5s ease" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "820px", margin: "0 auto", padding: "clamp(20px,5vw,52px)" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "44px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Reactive dot */}
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, transition: "background 1.2s", flexShrink: 0 }} />
            {/* Logo */}
            <img
              src="/logo.png"
              alt="weatherbylovely logo"
              style={{ width: "28px", height: "28px", objectFit: "contain", borderRadius: "6px" }}
            />
            {/* Brand name: weatherby in off-white, lovely in gold */}
            <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "0.01em", fontFamily: "'DM Mono', monospace" }}>
              <span style={{ color: "#F0EDE6" }}>weatherby</span><span style={{ color: "#FFD447" }}>lovely</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <span style={{ fontSize: "11px", color: "#888", letterSpacing: "0.08em", fontVariantNumeric: "tabular-nums" }}>
              {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <button onClick={() => setUnit(u => u === "C" ? "F" : "C")} style={{
              background: "transparent", border: `1px solid ${accent}40`, borderRadius: "6px",
              padding: "4px 10px", color: accent, fontSize: "10px", fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.1em", fontFamily: "inherit",
            }}>°{unit} ⇄</button>
            {lastCity && (
              <button onClick={() => fetchWeather(lastCity)} style={{ background: "transparent", border: "none", cursor: "pointer", lineHeight: 0 }}>
                <RefreshCw size={13} color="#888" style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ marginBottom: "52px" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={14} color="#666" style={{ position: "absolute", left: 0, pointerEvents: "none" }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="enter city name..."
              style={{
                flex: 1, background: "transparent", border: "none",
                borderBottom: `1px solid ${accent}30`, outline: "none",
                color: "#fff", fontSize: "clamp(22px,5vw,40px)",
                fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.06em",
                padding: "8px 40px 8px 26px", caretColor: accent,
              }}
            />
            <button type="submit" disabled={loading || !query.trim()} style={{
              position: "absolute", right: 0, background: "transparent", border: "none",
              cursor: loading ? "wait" : "pointer", opacity: !query.trim() ? 0.25 : 1, lineHeight: 0,
            }}>
              <ArrowUpRight size={22} color={accent} />
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px", padding: "10px 0", borderTop: "1px solid #ff444420", borderBottom: "1px solid #ff444420" }}>
            <AlertCircle size={13} color="#ff5555" />
            <span style={{ fontSize: "11px", color: "#ff5555", letterSpacing: "0.05em" }}>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "88px 0" }}>
            <RefreshCw size={26} color={accent} style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: "10px", color: "#888", marginTop: "18px", letterSpacing: "0.2em" }}>FETCHING DATA...</p>
          </div>
        )}

        {/* ── Weather display ── */}
        {weather && !loading && (
          <>
            {/* Location */}
            <div style={{ ...fade(0), display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <div style={{ fontSize: "10px", color: "#888", letterSpacing: "0.16em", marginBottom: "4px", textTransform: "uppercase" }}>
                  {weather.location.country}  ·  {time.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </div>
                <h1 style={{ fontSize: "clamp(32px,8vw,72px)", fontFamily: "'Bebas Neue', sans-serif", color: "#fff", margin: 0, lineHeight: 1, letterSpacing: "0.03em" }}>
                  {weather.location.name.toUpperCase()}
                </h1>
              </div>
              {/* WeatherAPI condition icon */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", letterSpacing: "0.22em", color: accent, fontWeight: 600, marginBottom: "4px", textTransform: "uppercase" }}>
                  {conditionText.toUpperCase()}
                </div>
                <img
                  src={`https:${weather.current.condition.icon}`}
                  alt={conditionText}
                  style={{ width: "52px", height: "52px", objectFit: "contain" }}
                />
              </div>
            </div>

            {/* Giant temperature */}
            <div style={{ ...fade(80) }}>
              <div style={{ fontSize: "clamp(96px,20vw,200px)", fontFamily: "'Bebas Neue', sans-serif", color: "#fff", lineHeight: 0.82, letterSpacing: "-0.02em", display: "inline-block" }}>
                {/* Backend gives us both units — no conversion needed */}
                {unit === "C" ? Math.round(weather.current.temp_c) : Math.round(weather.current.temp_f)}
                <span style={{ fontSize: "38%", color: accent, verticalAlign: "super", marginLeft: "6px" }}>°{unit}</span>
              </div>
            </div>

            {/* Feels like */}
            <div style={{ ...fade(140), display: "flex", alignItems: "center", gap: "16px", margin: "6px 0 36px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#888", letterSpacing: "0.04em" }}>
                feels like {unit === "C" ? Math.round(weather.current.feelslike_c) : Math.round(weather.current.feelslike_c * 9 / 5 + 32)}°{unit}
              </span>
            </div>

            <div style={{ ...fade(180), borderTop: `1px solid ${accent}20`, marginBottom: "22px" }} />

            {/* Stats — all fields from your formattedData */}
            <div style={{ ...fade(220), display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "30px" }}>
              <StatPill icon={Droplets}   label="Humidity"   value={`${weather.current.humidity}%`}          accent={accent} />
              <StatPill icon={Wind}       label="Wind"       value={`${Math.round(weather.current.wind_kph)} km/h`} accent={accent} />
              <StatPill icon={Gauge}      label="Pressure"   value={`${weather.current.pressure_mb} mb`}      accent={accent} />
            </div>

            {/* Local time from WeatherAPI */}
            <div style={{ ...fade(260), marginBottom: "36px" }}>
              <span style={{ fontSize: "9px", color: "#888", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                Local time · {weather.location.localTime}
              </span>
            </div>

            <div style={{ ...fade(290), borderTop: `1px solid ${accent}20`, marginBottom: "22px" }} />

            {/* 5-day forecast — array from your controller */}
            {forecast && forecast.length > 0 && (
              <div style={{ ...fade(330) }}>
                <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#888", textTransform: "uppercase", marginBottom: "10px" }}>
                  {forecast.length}-Day Forecast
                </div>
                <div style={{ border: `1px solid ${accent}18`, borderRadius: "12px", overflow: "hidden", display: "flex" }}>
                  {forecast.map((day, i) => (
                    <ForecastCard
                      key={i}
                      day={fmtDay(day.date)}
                      condition={day.condition}
                      icon={day.icon}
                      maxTemp={day.maxTemp}
                      minTemp={day.minTemp}
                      chanceOfRain={day.chanceOfRain}
                      accent={accent}
                      unit={unit}
                    />
                  ))}
                </div>
                {/* Rain chance legend */}
                <div style={{ fontSize: "9px", color: "#666", letterSpacing: "0.12em", marginTop: "8px" }}>
                  % = chance of rain
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!weather && !loading && !error && (
          <div style={{ paddingTop: "60px" }}>
            <div style={{ fontSize: "clamp(52px,14vw,130px)", fontFamily: "'Bebas Neue', sans-serif", color: "#333", lineHeight: 0.9, letterSpacing: "0.02em", marginBottom: "28px" }}>
              WHAT'S<br />THE<br />WEATHER?
            </div>
            <p style={{ fontSize: "10px", color: "#666", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Type a city name above and press Enter
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #444; }
        button:active { opacity: 0.7 !important; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #ffffff0f; border-radius: 2px; }
      `}</style>
    </div>
  );
}