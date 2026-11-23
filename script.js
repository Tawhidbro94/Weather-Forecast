// ===== Weather Forecast App =====
// API: Open-Meteo (no API key needed)
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const DEFAULT_PLACE = { name: "Chattogram", country: "Bangladesh", latitude: 22.3569, longitude: 91.7832 };

// weather code -> [description, emoji]
const WEATHER_CODES = {
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  61: ["Light rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm, hail", "⛈️"], 99: ["Thunderstorm, hail", "⛈️"],
};

// ----- State -----
const state = {
  unit: "C",          // "C" or "F"
  place: null,        // selected place object
  data: null,         // raw API data (always Celsius, km/h)
  filter: "all",      // all | rainy | dry
  favorites: [],      // array of place objects
};

// ----- DOM -----
const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"), input: $("searchInput"), suggestions: $("suggestions"),
  favorites: $("favorites"), status: $("status"), weather: $("weather"),
  placeName: $("placeName"), placeMeta: $("placeMeta"), favBtn: $("favBtn"),
  curIcon: $("curIcon"), curTemp: $("curTemp"), curDesc: $("curDesc"),
  curFeels: $("curFeels"), curHumidity: $("curHumidity"), curWind: $("curWind"),
  forecast: $("forecast"), forecastEmpty: $("forecastEmpty"),
  unitC: $("unitC"), unitF: $("unitF"),
};

// ----- Local Storage helpers (safe) -----
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

// ----- Helpers -----
const samePlace = (a, b) =>
  Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

const convert = (c) => (state.unit === "C" ? c : (c * 9) / 5 + 32);
const fmtTemp = (c) => `${Math.round(convert(c))}°${state.unit}`;
const codeInfo = (code) => WEATHER_CODES[code] || ["Unknown", "❓"];
const placeLabel = (p) => [p.name, p.admin1, p.country].filter(Boolean).join(", ");

function showStatus(type, message) {
  els.status.hidden = false;
  els.status.className = "status" + (type === "error" ? " error" : "");
  els.status.innerHTML = type === "loading" ? `<span class="spinner"></span>${message}` : message;
}
function hideStatus() { els.status.hidden = true; }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// ----- Search (geocoding) -----
async function searchCity(query) {
  els.suggestions.hidden = true;
  showStatus("loading", "Searching cities...");
  try {
    const data = await fetchJSON(`${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`);
    hideStatus();
    const results = data.results || [];
    if (results.length === 0) {
      // empty state
      showStatus("empty", `No city found for "${query}". Try another name.`);
      return;
    }
    renderSuggestions(results);
  } catch (err) {
    showStatus("error", "Could not search cities. Check your internet connection and try again.");
  }
}

function renderSuggestions(results) {
  els.suggestions.innerHTML = "";
  results.forEach((place) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = placeLabel(place);
    btn.addEventListener("click", () => {
      els.suggestions.hidden = true;
      els.input.value = "";
      selectPlace(place);
    });
    els.suggestions.appendChild(btn);
  });
  els.suggestions.hidden = false;
}

// ----- Weather (forecast API) -----
async function selectPlace(place) {
  state.place = place;
  save("weather.lastPlace", place);
  showStatus("loading", `Loading weather for ${place.name}...`);
  els.weather.hidden = true;
  try {
    const url = `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=7`;
    state.data = await fetchJSON(url);
    hideStatus();
    renderWeather();
  } catch (err) {
    showStatus("error", "Could not load weather data. Please try again.");
  }
}

// ----- Rendering -----
function renderWeather() {
  if (!state.data || !state.place) return;
  const cur = state.data.current;
  const [desc, icon] = codeInfo(cur.weather_code);

  els.placeName.textContent = state.place.name;
  els.placeMeta.textContent = placeLabel(state.place);
  els.curIcon.textContent = icon;
  els.curTemp.textContent = fmtTemp(cur.temperature_2m);
  els.curDesc.textContent = desc;
  els.curFeels.textContent = fmtTemp(cur.apparent_temperature);
  els.curHumidity.textContent = `${cur.relative_humidity_2m}%`;
  els.curWind.textContent = `${Math.round(cur.wind_speed_10m)} km/h`;

  updateFavButton();
  renderForecast();
  els.weather.hidden = false;
}

function renderForecast() {
  const d = state.data.daily;
  // build array of day objects from parallel arrays
  let days = d.time.map((date, i) => ({
    date,
    code: d.weather_code[i],
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    rain: d.precipitation_probability_max[i] ?? 0,
  }));

  // filter
  if (state.filter === "rainy") days = days.filter((day) => day.rain >= 40);
  if (state.filter === "dry") days = days.filter((day) => day.rain < 40);

  els.forecast.innerHTML = "";
  els.forecastEmpty.hidden = days.length > 0;

  days.forEach((day) => {
    const dt = new Date(day.date + "T00:00:00");
    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <div class="name">${dt.toLocaleDateString("en-US", { weekday: "short" })}</div>
      <div class="date">${dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
      <div class="icon" title="${codeInfo(day.code)[0]}">${codeInfo(day.code)[1]}</div>
      <div><span class="hi">${fmtTemp(day.max)}</span> <span class="lo">${fmtTemp(day.min)}</span></div>
      <div class="rain">💧 ${day.rain}%</div>`;
    els.forecast.appendChild(el);
  });
}

// ----- Favorites (localStorage) -----
function renderFavorites() {
  els.favorites.innerHTML = "";
  if (state.favorites.length === 0) {
    els.favorites.innerHTML = '<span class="none">No saved cities yet. Search a city and press Save.</span>';
    return;
  }
  state.favorites.forEach((place) => {
    const chip = document.createElement("span");
    chip.className = "chip";

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = place.name;
    open.addEventListener("click", () => selectPlace(place));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", `Remove ${place.name}`);
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      state.favorites = state.favorites.filter((p) => !samePlace(p, place));
      save("weather.favorites", state.favorites);
      renderFavorites();
      updateFavButton();
    });

    chip.append(open, remove);
    els.favorites.appendChild(chip);
  });
}

function updateFavButton() {
  if (!state.place) return;
  const saved = state.favorites.find((p) => samePlace(p, state.place));
  els.favBtn.textContent = saved ? "★ Saved" : "☆ Save";
  els.favBtn.classList.toggle("saved", Boolean(saved));
}

function toggleFavorite() {
  if (!state.place) return;
  const exists = state.favorites.find((p) => samePlace(p, state.place));
  if (exists) {
    state.favorites = state.favorites.filter((p) => !samePlace(p, state.place));
  } else {
    const { name, admin1, country, latitude, longitude } = state.place;
    state.favorites.push({ name, admin1, country, latitude, longitude });
  }
  save("weather.favorites", state.favorites);
  renderFavorites();
  updateFavButton();
}

// ----- Unit toggle -----
function setUnit(unit) {
  state.unit = unit;
  save("weather.unit", unit);
  els.unitC.classList.toggle("active", unit === "C");
  els.unitF.classList.toggle("active", unit === "F");
  renderWeather();
}

// ----- Event listeners -----
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (q) searchCity(q);
});
els.favBtn.addEventListener("click", toggleFavorite);
els.unitC.addEventListener("click", () => setUnit("C"));
els.unitF.addEventListener("click", () => setUnit("F"));
document.querySelectorAll(".filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.filter = btn.dataset.filter;
    document.querySelectorAll(".filter").forEach((b) => b.classList.toggle("active", b === btn));
    if (state.data) renderForecast();
  });
});

// ----- Init -----
(function init() {
  state.favorites = load("weather.favorites", []);
  state.unit = load("weather.unit", "C");
  els.unitC.classList.toggle("active", state.unit === "C");
  els.unitF.classList.toggle("active", state.unit === "F");
  renderFavorites();
  selectPlace(load("weather.lastPlace", DEFAULT_PLACE));
})();
