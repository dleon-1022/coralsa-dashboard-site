let charts = [];
let detailRows = [];
const DETAIL_PAGE_SIZE = 10;
let globalRankingData = null;
let globalDetailedData = [];
let currentIncidentPage = 1;
let isIncidentGalleryVisible = true;
const INCIDENT_PAGE_SIZE = 8;
let isPassImagesVisible = true;
let isFailImagesVisible = true;

async function fetchJson(path) { const res = await fetch(path); if (!res.ok) throw new Error(`No se pudo cargar ${path}`); return await res.json(); }
function verdictPill(veredicto) { const cls = veredicto === "PASS" ? "pass" : "fail"; return `<span class="pill ${cls}">${veredicto}</span>`; }
function safeUrl(url) { return typeof url === "string" && url.trim() ? url.trim() : ""; }
function safeImagePath(path) { if (typeof path !== "string") return ""; const clean = path.trim(); if (!clean) return ""; const normalized = clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("/") || clean.startsWith("./") || clean.startsWith("../") ? clean : `./${clean}`; return encodeURI(normalized); }
function percentage(value, total) { return total ? (value / total) * 100 : 0; }
function displayValue(value) { if (value === null || value === undefined || value === "") return "N/A"; if (String(value).toLowerCase() === "no_aplica") return "N/A"; return titleCase(String(value)); }
function normalizePizzaType(type) { const v = String(type || "desconocido").trim().toLowerCase(); const a = { pepperoni: "peperonni", peperoni: "peperonni", peperonni: "peperonni", queso: "queso", cheese: "queso", especial: "especiales", especiales: "especiales", lto: "especiales", special: "especiales", specials: "especiales" }; return a[v] || v; }
function pizzaTypeLabel(type) { const v = normalizePizzaType(type); return ({ peperonni: "Peperonni", queso: "Queso", especiales: "Especiales", desconocido: "Desconocido" }[v] || titleCase(v)); }

function pizzaTypeBadge(type, confidence = null) {
  const v = normalizePizzaType(type); const pct = Number.isFinite(Number(confidence)) ? ` · ${(Number(confidence) * 100).toFixed(1)}%` : "";
  const bg = { peperonni: "#f9eded", queso: "#fff6d8", especiales: "#f1eefb", desconocido: "#eef2f7" }[v] || "#eef2f7";
  const color = { peperonni: "#b44848", queso: "#9c7325", especiales: "#6b4fb3", desconocido: "#516173" }[v] || "#516173";

  return `<span class="pill" style="background:${bg};border-color:${bg};color:${color};">${pizzaTypeLabel(v)}</span>`;
}
function titleCase(text) { return String(text || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("es").split(" ").map(w => w ? w.charAt(0).toLocaleUpperCase("es") + w.slice(1) : w).join(" "); }
function parseCsvContext(csvName) { const raw = String(csvName || "").replace(/\.csv$/i, "").trim(); let m = raw.match(/^PCSAPI[_\s-]*Distrito[_\s-]*(\d+)\s*-\s*(.+)$/i) || raw.match(/^Distrito[_\s-]*(\d+)\s*-\s*(.+)$/i); if (m) { const district = `Distrito ${String(parseInt(m[1], 10)).padStart(2, "0")}`; const location = titleCase(m[2]); return { client: "PCSAPI", district, location, display: `${district} · ${location}` }; } m = raw.match(/^LCPERU[_\s-]*(.+)$/i); if (m) return { client: "LCPERU", district: "", location: titleCase(m[1]), display: titleCase(m[1]) }; m = raw.match(/^LCPZ[_\s-]*(.+)$/i); if (m) return { client: "LCPZ", district: "", location: titleCase(m[1]), display: titleCase(m[1]) }; m = raw.match(/^CORALSA\s+Zona\s+\d+\s*-?\s*(.+)$/i) || raw.match(/^CORALSA[_\s-]+(.+)$/i); if (m) return { client: "CORALSA", district: "", location: titleCase(m[1]), display: titleCase(m[1]) }; return { client: "", district: "", location: titleCase(raw), display: titleCase(raw) }; }

//Llena info header
function updateBrandHeader(rankingData) {
  const ctx = parseCsvContext(rankingData.csv_name || "");
  const brandTitle = document.getElementById("brandTitle");
  const brandSubtitle = document.getElementById("brandSubtitle");

  if (!brandTitle || !brandSubtitle) return;

  if (ctx.client === "PCSAPI") {
    brandTitle.innerHTML = `Dashboard: <strong>${ctx.client} · ${ctx.district}</strong>`;
    brandSubtitle.innerHTML = `Locación: <strong>${ctx.location || "No especificada"}</strong>`;
  } else if (ctx.client) {
    brandTitle.innerHTML = `Dashboard: <strong>${ctx.client}</strong>`;
    brandSubtitle.innerHTML = `Locación: <strong>${ctx.location || "No especificada"}</strong>`;
  } else {
    brandTitle.innerHTML = "Dashboard: <strong>Quality Dashboard</strong>";
    brandSubtitle.innerHTML = `Locación: <strong>${ctx.location || "No especificada"}</strong>`;
  }

  document.title = `${ctx.client || "Quality"} ${ctx.district || ""} ${ctx.location || ""}`
    .replace(/\s+/g, " ")
    .trim();
}
function excelSerialToDate(serial) { const n = Number(serial); if (!Number.isFinite(n)) return null; const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return Number.isNaN(d.getTime()) ? null : d; }
function parseDateInfo(row) { const rawDate = String(row.fecha || "").trim(); const sourceUrl = safeUrl(row.source_url); const u = sourceUrl.match(/(\d{8})-(\d{6})/); if (u) { const y = Number(u[1].slice(0, 4)), mo = Number(u[1].slice(4, 6)) - 1, d = Number(u[1].slice(6, 8)), h = Number(u[2].slice(0, 2)), mi = Number(u[2].slice(2, 4)), s = Number(u[2].slice(4, 6)); const parsed = new Date(y, mo, d, h, mi, s); if (!Number.isNaN(parsed.getTime())) return parsed; } if (/^\d+(\.\d+)?$/.test(rawDate)) return excelSerialToDate(rawDate); if (rawDate) { const parsed = new Date(rawDate); if (!Number.isNaN(parsed.getTime())) return parsed; } return null; }
function formatDayLabel(date) { return date.toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "2-digit" }); }
function formatHourSlot(date) { return `${String(date.getHours()).padStart(2, "0")}:00 - ${String(date.getHours()).padStart(2, "0")}:59`; }
function formatShortSpanishDate(date) { const m = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."]; return `${m[date.getMonth()]} ${date.getDate()}`; }

function renderWeekRangeFromDetailed(detailedData) {
  const dates = detailedData
    .map(parseDateInfo)
    .filter(Boolean)
    .sort((a, b) => a - b);

  const target = document.getElementById("weekRange");
  if (!target) return;

  if (!dates.length) {
    target.innerHTML = "Período: <strong>-</strong>";
    return;
  }

  const startDate = formatShortSpanishDate(dates[0]);
  const endDate = formatShortSpanishDate(dates[dates.length - 1]);
  const year = dates[dates.length - 1].getFullYear();

  target.innerHTML = `Período: <strong>${startDate} - ${endDate}, ${year}</strong>`;
}
function buildIncidentTimeline(detailedData) { const dayCounts = new Map(), hourCounts = new Map(); for (const row of detailedData) { const incidentCount = (row.burbuja === "si" ? 1 : 0) + (row.grasa === "si" ? 1 : 0) + (row.bordes_sucios === "si" ? 1 : 0); if (!incidentCount) continue; const parsedDate = parseDateInfo(row); if (!parsedDate) continue; const dayKey = parsedDate.toISOString().slice(0, 10); const hourKey = `${dayKey}-${String(parsedDate.getHours()).padStart(2, "0")}`; dayCounts.set(dayKey, { label: formatDayLabel(parsedDate), total: (dayCounts.get(dayKey)?.total || 0) + incidentCount }); hourCounts.set(hourKey, { label: formatHourSlot(parsedDate), total: (hourCounts.get(hourKey)?.total || 0) + incidentCount }); } const sortedDays = [...dayCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v); const sortedHours = [...hourCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v); return { dayLabels: sortedDays.map(i => i.label), dayValues: sortedDays.map(i => i.total), dayHighlights: sortedDays, hourLabels: sortedHours.map(i => i.label), hourValues: sortedHours.map(i => i.total), hourHighlights: sortedHours }; }
function buildPizzaTypeCounts(detailedData) { const counts = { peperonni: 0, queso: 0, especiales: 0, desconocido: 0 }; for (const r of detailedData) { const t = normalizePizzaType(r.tipo_pizza); counts[t] = (counts[t] ?? counts.desconocido) + 1; if (!(t in counts)) counts.desconocido += 1; } return counts; }
function buildMetrics(detailedData) {
  const total = detailedData.length;
  const pass = detailedData.filter(x => x.veredicto === "PASS").length;
  const timeline = buildIncidentTimeline(detailedData);
  return {
    total,
    pass,
    fail: total - pass,
    burbuja: detailedData.filter(x => x.burbuja === "si").length,
    grasa: detailedData.filter(x => x.grasa === "si").length,
    bordes: detailedData.filter(x => x.bordes_sucios === "si").length,
    horneadoCritico: detailedData.filter(x => {
      const v = String(x.horneado || "").toLowerCase();
      return v && v !== "correcto" && v !== "no_aplica";
    }).length,
    distribucion: detailedData.filter(x => {
      const v = String(x.distribucion || "").toLowerCase();
      return v && v !== "correcto" && v !== "no_aplica";
    }).length,
    pizzaTypeCounts: buildPizzaTypeCounts(detailedData),
    dayIncidentLabels: timeline.dayLabels,
    dayIncidentValues: timeline.dayValues,
    dayHighlights: timeline.dayHighlights,
    hourIncidentLabels: timeline.hourLabels,
    hourIncidentValues: timeline.hourValues,
    hourHighlights: timeline.hourHighlights
  };
}
function renderPizzaTypeSummary(metrics) {
  const target = document.querySelector(".cards");
  if (!target) return;

  // Limpiar las tarjetas automáticas si ya existían (para evitar duplicados al recargar)
  document.querySelectorAll(".pizza-type-card-auto").forEach(e => e.remove());

  const c = metrics.pizzaTypeCounts || {};

  // Construir las 3 tarjetas y agregarlas al final del grid de Resumen
  const cardsHtml = `
    <div class="card pizza-type-card-auto">
      <div class="label">Pizzas Peperonni contadas</div>
      <div class="value">${c.peperonni || 0}</div>
    </div>
    <div class="card pizza-type-card-auto">
      <div class="label">Pizzas Queso contadas</div>
      <div class="value">${c.queso || 0}</div>
    </div>
    <div class="card pizza-type-card-auto">
      <div class="label">Pizzas Especiales contadas</div>
      <div class="value">${c.especiales || 0}</div>
    </div>
  `;

  target.insertAdjacentHTML("beforeend", cardsHtml);
}

function renderSummary(rankingData, metrics) {
  const ctx = parseCsvContext(rankingData.csv_name);

  const csvNameEl = document.getElementById("csvName");
  if (csvNameEl) csvNameEl.textContent = ctx.location || ctx.display || "-";

  const passKpiEl = document.getElementById("passKpi");
  if (passKpiEl) passKpiEl.textContent = String(metrics.pass);

  const failKpiEl = document.getElementById("failKpi");
  if (failKpiEl) failKpiEl.textContent = String(metrics.fail);

  const passRateKpiEl = document.getElementById("passRateKpi");
  const scoreCardEl = passRateKpiEl ? passRateKpiEl.closest(".summary-score") : null;
  const scoreLabelEl = scoreCardEl ? scoreCardEl.querySelector(".summary-subtitle-green") : null;

  if (passRateKpiEl) {
    const scoreVal = Number(rankingData.average_score ?? 0).toFixed(2);
    passRateKpiEl.innerHTML = `${scoreVal}`;

    if (scoreCardEl) {
      if (Number(rankingData.average_score ?? 0) >= 90) {
        scoreCardEl.style.backgroundColor = "rgb(238 250 248)";
        scoreCardEl.style.borderColor = "rgb(201 235 229)";
        if (scoreLabelEl) scoreLabelEl.style.color = "var(--good)";
        passRateKpiEl.style.color = "var(--good)";
      } else {
        scoreCardEl.style.backgroundColor = "#fdf2f2";
        scoreCardEl.style.borderColor = "#fde8e8";
        if (scoreLabelEl) scoreLabelEl.style.color = "var(--bad)";
        passRateKpiEl.style.color = "var(--bad)";
      }
    }
  }

  const totalPizzasKpiEl = document.getElementById("totalPizzasKpi");
  if (totalPizzasKpiEl) totalPizzasKpiEl.textContent = String(metrics.total);

  const passCountLabelEl = document.getElementById("passCountLabel");
  if (passCountLabelEl) passCountLabelEl.textContent = String(metrics.pass);

  const failCountLabelEl = document.getElementById("failCountLabel");
  if (failCountLabelEl) failCountLabelEl.textContent = String(metrics.fail);
}

function renderBulletChart(rankingData) {
  const avg = Number(rankingData.average_score ?? 0);
  const target = 90;
  const label = document.getElementById("bulletStatusLabel");

  document.getElementById("bulletBar").style.width = `${Math.max(0, Math.min(100, avg))}%`;
  document.getElementById("bulletTarget").style.left = `${target}%`;

  const valueLabelEl = document.getElementById("bulletValueLabel");
  if (valueLabelEl) {
    valueLabelEl.textContent = avg.toFixed(2);
    if (avg >= target) {
      valueLabelEl.style.color = "var(--good)";
    } else {
      valueLabelEl.style.color = "var(--bad)";
    }
  }

  const targetLabelEl = document.getElementById("bulletTargetLabel");
  if (targetLabelEl) {
    targetLabelEl.textContent = String(target);
    targetLabelEl.style.color = "";
  }

  document.getElementById("bulletBar").style.background = avg < 60
    ? "linear-gradient(90deg,#d76a6a,#b44848)"
    : avg < 90
      ? "linear-gradient(90deg,#e0c064,#b5842f)"
      : "linear-gradient(90deg,#3c8d72,#1f7a5a)";

  if (avg < 60) {
    label.textContent = "Bajo rendimiento";
    label.style.color = "#b44848";
  } else if (avg < 90) {
    label.textContent = "En evolución";
    label.style.color = "#9c7325";
  } else {
    label.textContent = "Buen rendimiento";
    label.style.color = "#1f7a5a";
  }
}
function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }
function commonChartOptions() { return { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#17324d", boxWidth: 18, boxHeight: 10 } }, tooltip: { titleColor: "#17324d", bodyColor: "#17324d", backgroundColor: "rgba(255,255,255,0.96)", borderColor: "#d6dee8", borderWidth: 1 } } }; }
function lightScales(xTicks = {}) { return { x: { ticks: { color: "#17324d", ...xTicks }, grid: { color: "#e4ebf2" } }, y: { beginAtZero: true, ticks: { color: "#17324d", precision: 0 }, grid: { color: "#e4ebf2" } } }; }
function highlightSeries(values, base, hi) { if (!values.length) return []; const max = Math.max(...values); return values.map(v => v === max ? hi : base); }
function renderCharts(metrics) {
  destroyCharts();

  const passFailCanvas = document.getElementById("passFailChart");
  if (passFailCanvas) {
    charts.push(new Chart(passFailCanvas, {
      type: "doughnut",
      data: {
        labels: ["PASS", "FAIL"],
        datasets: [{
          data: [metrics.pass, metrics.fail],
          backgroundColor: ["#1f7a5a", "#d98a8a"],
          borderWidth: 0
        }]
      },
      options: { ...commonChartOptions(), cutout: "68%" }
    }));
  }

  // Nuevo gráfico de Tipos de Pizza
  const pCounts = metrics.pizzaTypeCounts || {};
  const pizzaCanvas = document.getElementById("pizzaTypeChart");
  if (pizzaCanvas) {
    charts.push(new Chart(pizzaCanvas, {
      type: "doughnut",
      data: {
        labels: ["Peperonni", "Queso", "Especiales"],
        datasets: [{
          data: [pCounts.peperonni || 0, pCounts.queso || 0, pCounts.especiales || 0],
          backgroundColor: ["#b44848", "#9c7325", "#6b4fb3"],
          borderWidth: 0
        }]
      },
      options: {
        ...commonChartOptions(),
        cutout: "68%"
      }
    }));
  }

  const dayCanvas = document.getElementById("dayIncidentChart");
  if (dayCanvas) {
    charts.push(new Chart(dayCanvas, {
      type: "bar",
      data: {
        labels: metrics.dayIncidentLabels,
        datasets: [{
          label: "Incidentes",
          data: metrics.dayIncidentValues,
          backgroundColor: highlightSeries(metrics.dayIncidentValues, "#d9dde4", "#b44848"),
          borderRadius: 10
        }]
      },
      options: { ...commonChartOptions(), scales: lightScales() }
    }));
  }

  const hourCanvas = document.getElementById("hourIncidentChart");
  if (hourCanvas) {
    charts.push(new Chart(hourCanvas, {
      type: "bar",
      data: {
        labels: metrics.hourIncidentLabels,
        datasets: [{
          label: "Incidentes",
          data: metrics.hourIncidentValues,
          backgroundColor: highlightSeries(metrics.hourIncidentValues, "#d9dde4", "#2e6f95"),
          borderRadius: 10
        }]
      },
      options: { ...commonChartOptions(), scales: lightScales({ maxRotation: 45, minRotation: 45 }) }
    }));
  }
}
function renderOperationalInsights(metrics) {
  const worstDay = (metrics.dayHighlights || []).reduce((m, i) => i.total > (m?.total || 0) ? i : m, null);
  const worstHour = (metrics.hourHighlights || []).reduce((m, i) => i.total > (m?.total || 0) ? i : m, null);
  const worstDayEl = document.getElementById("worstDayInsight");
  if (worstDayEl) {
    worstDayEl.textContent = worstDay ? `Día con más incidentes: ${worstDay.label} con ${worstDay.total} incidentes` : "Sin incidentes relevantes";
  }
  const worstHourEl = document.getElementById("worstHourInsight");
  if (worstHourEl) {
    worstHourEl.textContent = worstHour ? `Franja crítica: ${worstHour.label} con ${worstHour.total} incidentes` : "Sin franja crítica detectada";
  }
}
function setRing(circleId, value, total, pctId, countId) { const circle = document.getElementById(circleId), pctEl = document.getElementById(pctId), countEl = document.getElementById(countId); if (!circle || !pctEl || !countEl) return; const r = 48, c = 2 * Math.PI * r, pct = total > 0 ? (value / total) * 100 : 0; circle.style.strokeDasharray = `${c}`; circle.style.strokeDashoffset = `${c * (1 - pct / 100)}`; pctEl.textContent = `${pct.toFixed(1)}%`; countEl.textContent = `${value} / ${total}`; }
function renderIncidentRings(metrics) {
  setRing("ring-burbuja", metrics.burbuja, metrics.total, "burbujaPct", "burbujaCount");
  setRing("ring-grasa", metrics.grasa, metrics.total, "grasaPct", "grasaCount");
  setRing("ring-bordes", metrics.bordes, metrics.total, "bordesPct", "bordesCount");
  setRing("ring-horneado", metrics.horneadoCritico, metrics.total, "horneadoPct", "horneadoCount");
  setRing("ring-distribucion", metrics.distribucion, metrics.total, "distribucionPct", "distribucionCount");

  const rings = [
    { id: "card-burbuja", count: metrics.burbuja },
    { id: "card-grasa", count: metrics.grasa },
    { id: "card-bordes", count: metrics.bordes },
    { id: "card-horneado", count: metrics.horneadoCritico },
    { id: "card-distribucion", count: metrics.distribucion }
  ];

  let visibleCount = 0;
  rings.forEach(ring => {
    const el = document.getElementById(ring.id);
    if (el) {
      if (ring.count > 0) {
        el.style.display = "flex";
        visibleCount++;
      } else {
        el.style.display = "none";
      }
    }
  });

  const gridEl = document.querySelector(".rings-grid");
  let noIncidentsEl = document.getElementById("no-incidents-msg");
  if (visibleCount === 0) {
    if (gridEl) gridEl.style.display = "none";
    const panelEl = gridEl ? gridEl.closest(".panel") : null;
    if (panelEl) {
      if (!noIncidentsEl) {
        noIncidentsEl = document.createElement("div");
        noIncidentsEl.id = "no-incidents-msg";
        noIncidentsEl.style.padding = "24px";
        noIncidentsEl.style.textAlign = "center";
        noIncidentsEl.style.color = "var(--muted)";
        noIncidentsEl.style.fontSize = "15px";
        noIncidentsEl.textContent = "Excelente, no se detectaron incidentes en este grupo.";
        panelEl.appendChild(noIncidentsEl);
      } else {
        noIncidentsEl.style.display = "block";
      }
    }
  } else {
    if (gridEl) gridEl.style.display = "flex";
    if (noIncidentsEl) noIncidentsEl.style.display = "none";
  }
}

//Funcion para filtrar metricas por items  
function metricDetailsForItem(item) {
  const type = normalizePizzaType(item.tipo_pizza);
  const metrics = [
    { label: "Burbuja", val: displayValue(item.burbuja) },
    { label: "Grasa", val: type === "peperonni" ? displayValue(item.grasa) : "N/A" },
    { label: "Bordes sucios", val: type === "peperonni" ? displayValue(item.bordes_sucios) : "N/A" },
    { label: "Horneado", val: type === "peperonni" ? displayValue(item.horneado) : "N/A" },
    { label: "Distribución", val: type === "peperonni" ? displayValue(item.distribucion) : "N/A" }
  ];
  return metrics
    //Filtro de que si es N/A, no se muestre nada 
    .filter(m => m.val !== "N/A")
    .map(m => `<div class="small"><strong>${m.label}:</strong> ${m.val}</div>`)
    .join("");

}

//Funcion para renderizar cards
function renderRankingList(containerId, rankingData, detailedData, verdict) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (verdict === "PASS") {
    const btn = document.getElementById("togglePassImagesBtn");
    if (btn) btn.textContent = isPassImagesVisible ? "Ocultar imágenes" : "Mostrar imágenes";
  } else if (verdict === "FAIL") {
    const btn = document.getElementById("toggleFailImagesBtn");
    if (btn) btn.textContent = isFailImagesVisible ? "Ocultar imágenes" : "Mostrar imágenes";
  }

  const showImage = verdict === "PASS" ? isPassImagesVisible : isFailImagesVisible;
  if (!showImage) {
    container.style.display = "none";
    return;
  }
  container.style.display = "";

  const sorted = (rankingData.ranking || [])
    .filter(i => i.veredicto === verdict)
    .sort((a, b) => verdict === "FAIL" ? a.score - b.score : b.score - a.score);

  // Limitar a máx 2 especiales en el top 10
  const top = [];
  let especialesCount = 0;
  for (const item of sorted) {
    if (top.length >= 10) break;
    if (normalizePizzaType(item.tipo_pizza) === "especiales") {
      if (especialesCount >= 2) continue;
      especialesCount++;
    }
    top.push(item);
  }

  if (!top.length) {
    container.innerHTML = '<div class="card"><div class="small">No hay registros para este veredicto.</div></div>';
    return;
  }

  for (const item of top) {
    const detail = (detailedData || []).find(d => d.crop_image === item.crop_image);
    const sourceUrl = safeUrl(detail?.source_url || item.source_url || "");
    const cropImage = safeImagePath(item.crop_image);

    const img = cropImage ? `<img src="${cropImage}" alt="crop pizza" class="incident-gallery-img" style="cursor: pointer;">` : `<div class="small" style="padding:16px;">Sin preview</div>`;

    const link = sourceUrl
      ? `<div class="small"><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Ver imagen original</a></div>`
      : '<div class="small">Sin URL original</div>';

    const el = document.createElement("div");
    el.className = `pizza-card ${verdict === "PASS" ? "pass-card" : "fail-card"}`;

    // Aqui se define la distribucion de la tarjeta
    el.innerHTML = `
     
      <div class="content">
        <p class="card-pizzatype tipo-${normalizePizzaType(item.tipo_pizza)}">
          ${titleCase(item.tipo_pizza)}
        </p>
         ${img}
        <div class="card-container">
            <p class="card-title"> Veredicto </p>
            <div class="card-primary">  
                ${(item.veredicto)}
            <div class="card-score">${item.score}.pts</div>
            </div>
        </div>
        <div class="card-container">
            <p class="card-title"> Información </p>
            <div class="card-secondary">
                <div class="small">Fecha: ${item.fecha || "-"}</div>
                <div class="small">Locación: ${item.locacion || "-"}</div>
            </div>
        </div>
        <div class="card-container hover-details">
            <p class="card-title"> Métricas </p>
            <div >
                ${metricDetailsForItem(item)}
                ${link}
            </div>
        </div>      
      </div>
    `;

    container.appendChild(el);
  }
}
function updatePaginationTabs(currentPage, totalPages) {
  const c = document.getElementById("detailPagination");
  if (!c) return;
  c.innerHTML = "";
  if (totalPages <= 1) return;

  // Botón Anterior
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "pagination-tab";
  prevBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  `;
  if (currentPage === 1) {
    prevBtn.disabled = true;
    prevBtn.classList.add("disabled");
  } else {
    prevBtn.addEventListener("click", () => renderDetailPage(currentPage - 1));
  }
  c.appendChild(prevBtn);

  // Botón Siguiente
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "pagination-tab";
  nextBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  `;
  if (currentPage === totalPages) {
    nextBtn.disabled = true;
    nextBtn.classList.add("disabled");
  } else {
    nextBtn.addEventListener("click", () => renderDetailPage(currentPage + 1));
  }
  c.appendChild(nextBtn);
}
function renderDetailPage(page) {
  const tbody = document.getElementById("detailBody");
  const resultsBadge = document.getElementById("detailResultsBadge");
  const pageBadge = document.getElementById("detailPageBadge");
  if (!tbody) return;

  tbody.innerHTML = "";
  const total = detailRows.length;
  const totalPages = Math.max(1, Math.ceil(total / DETAIL_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * DETAIL_PAGE_SIZE;
  const end = Math.min(start + DETAIL_PAGE_SIZE, total);
  const rows = detailRows.slice(start, end);

  if (resultsBadge) {
    resultsBadge.textContent = total ? `${start + 1} - ${end} de ${total}` : "0 - 0 de 0";
  }
  if (pageBadge) {
    pageBadge.textContent = `Página ${safePage} de ${totalPages}`;
  }
  updatePaginationTabs(safePage, totalPages);

  for (const row of rows) {
    const sourceUrl = safeUrl(row.source_url);
    const cropImage = safeImagePath(row.crop_image);
    const originalCell = sourceUrl ? `<a class="table-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Ver original</a>` : '<span class="small">Sin URL</span>';
    const cropCell = cropImage ? `<img src="${cropImage}" alt="crop" class="thumb">` : `<span class="small">Sin preview</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${cropCell}</td><td>${row.fecha || "-"}</td><td>${row.locacion || "-"}</td><td>${pizzaTypeBadge(row.tipo_pizza, row.tipo_pizza_confidence)}</td><td><strong>${row.score ?? "-"}</strong></td><td>${verdictPill(row.veredicto || "-")}</td><td>${displayValue(row.burbuja)}</td><td>${displayValue(row.grasa)}</td><td>${displayValue(row.bordes_sucios)}</td><td>${displayValue(row.horneado)}</td><td>${displayValue(row.distribucion)}</td><td>${originalCell}</td>`;
    tbody.appendChild(tr);
  }
}
function setupDetailPagination(detailedData) { detailRows = [...detailedData]; renderDetailPage(1); }
function buildOptionLabel(csvName) { const ctx = parseCsvContext(csvName); if (ctx.client === "PCSAPI") return `${ctx.district} · ${ctx.location}`; if (ctx.location) return ctx.location; return ctx.display || "Dataset"; }

function renderIncidentGallery(detailedData, selectedIncident) {
  const container = document.getElementById("incidentPizzasGrid");
  const sep = document.getElementById("incident-sep");
  const header = document.getElementById("incident-gallery-header");
  const paginationContainer = document.getElementById("incidentPagination");
  if (!container) return;

  container.innerHTML = "";

  const matchesIncident = (row, type) => {
    const hasBurbuja = row.burbuja === "si";
    const hasGrasa = row.grasa === "si";
    const hasBordes = row.bordes_sucios === "si";
    const vHorneado = String(row.horneado || "").toLowerCase();
    const hasHorneado = vHorneado && vHorneado !== "correcto" && vHorneado !== "no_aplica";
    const vDistribucion = String(row.distribucion || "").toLowerCase();
    const hasDistribucion = vDistribucion && vDistribucion !== "correcto" && vDistribucion !== "no_aplica";

    if (type === "all") return hasBurbuja || hasGrasa || hasBordes || hasHorneado || hasDistribucion;
    if (type === "burbuja") return hasBurbuja;
    if (type === "grasa") return hasGrasa;
    if (type === "bordes") return hasBordes;
    if (type === "horneado") return hasHorneado;
    if (type === "distribucion") return hasDistribucion;
    return false;
  };

  const filtered = detailedData.filter(row => matchesIncident(row, selectedIncident));

  if (filtered.length === 0) {
    if (sep) sep.style.display = "none";
    if (header) header.style.display = "none";
    container.style.display = "none";
    if (paginationContainer) paginationContainer.style.display = "none";
    return;
  }

  if (sep) sep.style.display = "block";
  if (header) header.style.display = "flex";

  const toggleBtn = document.getElementById("toggleIncidentGalleryBtn");
  if (toggleBtn) {
    toggleBtn.textContent = isIncidentGalleryVisible ? "Ocultar imágenes" : "Mostrar imágenes";
  }

  const desc = header ? header.querySelector("p") : null;
  if (desc) {
    desc.style.display = isIncidentGalleryVisible ? "block" : "none";
  }

  if (!isIncidentGalleryVisible) {
    container.style.display = "none";
    if (paginationContainer) paginationContainer.style.display = "none";
    return;
  }

  container.style.display = "grid";

  // Paginación
  const totalPages = Math.ceil(filtered.length / INCIDENT_PAGE_SIZE);
  currentIncidentPage = Math.min(Math.max(1, currentIncidentPage), totalPages);

  const start = (currentIncidentPage - 1) * INCIDENT_PAGE_SIZE;
  const end = start + INCIDENT_PAGE_SIZE;
  const itemsToShow = filtered.slice(start, end);

  itemsToShow.forEach(item => {
    const cropImage = safeImagePath(item.crop_image);
    const imgHtml = cropImage
      ? `<img src="${cropImage}" alt="crop pizza" class="incident-gallery-img" style="width:100%; height:140px; object-fit:cover; display:block; background:#000; cursor:pointer;">`
      : `<div class="small" style="padding:16px; text-align:center; background:#eee; height:140px; display:flex; align-items:center; justify-content:center;">Sin preview</div>`;

    const badges = [];
    if (item.burbuja === "si") {
      badges.push('<span class="pill" style="font-size:10px; padding:2px 6px; background:rgba(46,111,149,0.1); color:#2e6f95; border:1px solid rgba(46,111,149,0.2); font-weight:600;">Burbuja</span>');
    }
    if (item.grasa === "si") {
      badges.push('<span class="pill" style="font-size:10px; padding:2px 6px; background:rgba(181,132,47,0.1); color:#b5842f; border:1px solid rgba(181,132,47,0.2); font-weight:600;">Grasa</span>');
    }
    if (item.bordes_sucios === "si") {
      badges.push('<span class="pill" style="font-size:10px; padding:2px 6px; background:rgba(95,111,138,0.1); color:#5f6f8a; border:1px solid rgba(95,111,138,0.2); font-weight:600;">Bordes</span>');
    }
    const vHorneado = String(item.horneado || "").toLowerCase();
    if (vHorneado && vHorneado !== "correcto" && vHorneado !== "no_aplica") {
      badges.push('<span class="pill" style="font-size:10px; padding:2px 6px; background:rgba(43,122,120,0.1); color:#2b7a78; border:1px solid rgba(43,122,120,0.2); font-weight:600;">Horneado</span>');
    }
    const vDistribucion = String(item.distribucion || "").toLowerCase();
    if (vDistribucion && vDistribucion !== "correcto" && vDistribucion !== "no_aplica") {
      badges.push('<span class="pill" style="font-size:10px; padding:2px 6px; background:rgba(186,107,87,0.1); color:#ba6b57; border:1px solid rgba(186,107,87,0.2); font-weight:600;">Distribución</span>');
    }

    const el = document.createElement("div");
    el.className = "pizza-card";
    el.style.alignSelf = "stretch";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.overflow = "hidden";

    el.innerHTML = `
      ${imgHtml}
      <div class="content" style="padding:10px; flex-grow:1; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <p class="card-pizzatype tipo-${normalizePizzaType(item.tipo_pizza)}" style="margin: 0 0 6px 0; font-size:14px; font-weight:bold;">
            ${titleCase(item.tipo_pizza)}
          </p>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
          ${badges.join("")}
        </div>
      </div>
    `;
    container.appendChild(el);
  });

  if (paginationContainer) {
    paginationContainer.innerHTML = "";
    if (totalPages > 1) {
      paginationContainer.style.display = "flex";

      // Botón Anterior
      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "pagination-tab";
      prevBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      `;
      if (currentIncidentPage === 1) {
        prevBtn.disabled = true;
        prevBtn.classList.add("disabled");
      } else {
        prevBtn.addEventListener("click", () => {
          currentIncidentPage = currentIncidentPage - 1;
          renderAll();
        });
      }
      paginationContainer.appendChild(prevBtn);

      // Botón Siguiente
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "pagination-tab";
      nextBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      `;
      if (currentIncidentPage === totalPages) {
        nextBtn.disabled = true;
        nextBtn.classList.add("disabled");
      } else {
        nextBtn.addEventListener("click", () => {
          currentIncidentPage = currentIncidentPage + 1;
          renderAll();
        });
      }
      paginationContainer.appendChild(nextBtn);
    } else {
      paginationContainer.style.display = "none";
    }
  }
}

//Renderizado general
function renderAll() {
  const rd = globalRankingData;
  const dd = globalDetailedData;
  if (!rd || !dd.length) return;

  const filterEl = document.getElementById("pizzaTypeFilter");
  const selectedType = filterEl ? filterEl.value : "all";

  const incidentFilterEl = document.getElementById("incidentFilter");
  const selectedIncident = incidentFilterEl ? incidentFilterEl.value : "all";

  // 1. Filtrar los datos detallados base según el tipo de pizza
  const ddTypeFiltered = selectedType === "all"
    ? dd
    : dd.filter(row => normalizePizzaType(row.tipo_pizza) === selectedType);

  // 2. Filtrar el ranking base según el tipo de pizza
  const rankingTypeFiltered = selectedType === "all"
    ? (rd.ranking || [])
    : (rd.ranking || []).filter(item => normalizePizzaType(item.tipo_pizza) === selectedType);

  // 3. Aplicar el filtro de incidentes sobre los datos ya filtrados por tipo para la lista de visualización y tabla
  const filteredDd = ddTypeFiltered.filter(row => {
    let matchesIncident = true;
    if (selectedIncident === "burbuja") {
      matchesIncident = row.burbuja === "si";
    } else if (selectedIncident === "grasa") {
      matchesIncident = row.grasa === "si";
    } else if (selectedIncident === "bordes") {
      matchesIncident = row.bordes_sucios === "si";
    } else if (selectedIncident === "horneado") {
      const v = String(row.horneado || "").toLowerCase();
      matchesIncident = v && v !== "correcto" && v !== "no_aplica";
    } else if (selectedIncident === "distribucion") {
      const v = String(row.distribucion || "").toLowerCase();
      matchesIncident = v && v !== "correcto" && v !== "no_aplica";
    }
    return matchesIncident;
  });

  // 4. Aplicar el filtro de incidentes sobre el ranking
  const filteredRankingList = rankingTypeFiltered.filter(item => {
    let matchesIncident = true;
    const detailItem = dd.find(d => d.crop_image === item.crop_image);
    if (detailItem) {
      if (selectedIncident === "burbuja") {
        matchesIncident = detailItem.burbuja === "si";
      } else if (selectedIncident === "grasa") {
        matchesIncident = detailItem.grasa === "si";
      } else if (selectedIncident === "bordes") {
        matchesIncident = detailItem.bordes_sucios === "si";
      } else if (selectedIncident === "horneado") {
        const v = String(detailItem.horneado || "").toLowerCase();
        matchesIncident = v && v !== "correcto" && v !== "no_aplica";
      } else if (selectedIncident === "distribucion") {
        const v = String(detailItem.distribucion || "").toLowerCase();
        matchesIncident = v && v !== "correcto" && v !== "no_aplica";
      }
    } else if (selectedIncident !== "all") {
      matchesIncident = false;
    }
    return matchesIncident;
  });

  const avgFiltered = filteredDd.length > 0
    ? (filteredDd.reduce((acc, row) => acc + Number(row.score ?? 0), 0) / filteredDd.length)
    : 0;

  const filteredRd = {
    ...rd,
    ranking: filteredRankingList,
    average_score: avgFiltered
  };

  // Los indicadores y anillos de incidentes muestran el resumen general del tipo de pizza seleccionado
  const metrics = buildMetrics(ddTypeFiltered);
  // Las métricas específicas para la tabla, KPI de conteos y listas se basan en el filtro combinado final
  const listMetrics = buildMetrics(filteredDd);

  updateBrandHeader(filteredRd);
  renderWeekRangeFromDetailed(filteredDd);

  // Renderizamos el resumen KPI (aprobadas, críticas, total) usando listMetrics
  renderSummary(filteredRd, listMetrics);
  renderBulletChart(filteredRd);
  renderCharts(listMetrics);
  renderOperationalInsights(listMetrics);

  // Los anillos de incidentes muestran el estado general del tipo seleccionado
  renderIncidentRings(metrics);

  renderRankingList("passGrid", filteredRd, filteredDd, "PASS");
  renderRankingList("failGrid", filteredRd, filteredDd, "FAIL");
  setupDetailPagination(filteredDd);

  // Renderizar la galeria de incidentes con las imagenes y badges
  renderIncidentGallery(ddTypeFiltered, selectedIncident);
}

function updateIncidentFilterOptions() {
  const typeFilter = document.getElementById("pizzaTypeFilter");
  const incidentFilter = document.getElementById("incidentFilter");
  if (!typeFilter || !incidentFilter) return;

  const selectedType = typeFilter.value;
  const isQuesoOrEspecial = selectedType === "queso" || selectedType === "especiales";

  const options = incidentFilter.options;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (opt.value !== "all" && opt.value !== "burbuja") {
      if (isQuesoOrEspecial) {
        opt.disabled = true;
        opt.style.display = "none";
      } else {
        opt.disabled = false;
        opt.style.display = "";
      }
    }
  }

  // Reset selected incident filter if it is now disabled
  if (isQuesoOrEspecial && incidentFilter.value !== "all" && incidentFilter.value !== "burbuja") {
    incidentFilter.value = "all";
  }
}

async function loadDataset(dataset) {
  const [rankingData, detailedData] = await Promise.all([fetchJson(dataset.ranking_json), fetchJson(dataset.detailed_json)]);
  globalRankingData = rankingData;
  globalDetailedData = detailedData;

  const filterEl = document.getElementById("pizzaTypeFilter");
  if (filterEl) filterEl.value = "all";

  const incidentFilterEl = document.getElementById("incidentFilter");
  if (incidentFilterEl) incidentFilterEl.value = "all";

  updateIncidentFilterOptions();

  currentIncidentPage = 1;
  renderAll();
}
async function main() {
  const manifest = await fetchJson("./manifest.json");
  const datasets = manifest.datasets || [];
  const select = document.getElementById("datasetSelect");
  if (!datasets.length) { if (select) select.innerHTML = "<option>No hay datasets</option>"; return; }
  if (select) {
    datasets.forEach((ds, idx) => { const option = document.createElement("option"); option.value = idx; option.textContent = buildOptionLabel(ds.csv_name); select.appendChild(option); });
    if (datasets.length <= 1) { const wrap = select.closest(".dataset-select-wrap"); if (wrap) wrap.style.display = "none"; }
    else { select.addEventListener("change", async () => { await loadDataset(datasets[Number(select.value)]); }); }
  }

  const filterEl = document.getElementById("pizzaTypeFilter");
  if (filterEl) {
    filterEl.addEventListener("change", () => {
      updateIncidentFilterOptions();
      currentIncidentPage = 1;
      renderAll();
    });
  }

  const incidentFilterEl = document.getElementById("incidentFilter");
  if (incidentFilterEl) {
    incidentFilterEl.addEventListener("change", () => {
      currentIncidentPage = 1;
      renderAll();
    });
  }

  document.body.addEventListener("click", e => {
    if (e.target && e.target.id === "toggleIncidentGalleryBtn") {
      isIncidentGalleryVisible = !isIncidentGalleryVisible;
      renderAll();
    }
    if (e.target && e.target.id === "togglePassImagesBtn") {
      isPassImagesVisible = !isPassImagesVisible;
      renderAll();
    }
    if (e.target && e.target.id === "toggleFailImagesBtn") {
      isFailImagesVisible = !isFailImagesVisible;
      renderAll();
    }
    // Open lightbox when clicking on a gallery image
    if (e.target && e.target.classList.contains("incident-gallery-img")) {
      const src = e.target.src;
      const lightbox = document.getElementById("imageLightbox");
      const lightboxImg = document.getElementById("lightboxImage");
      if (lightbox && lightboxImg) {
        lightboxImg.src = src;
        lightbox.style.display = "flex";
        lightbox.offsetHeight; // force reflow
        lightbox.classList.add("active");
      }
    }
  });

  // Close lightbox
  const lightbox = document.getElementById("imageLightbox");
  if (lightbox) {
    lightbox.addEventListener("click", e => {
      if (e.target.id === "imageLightbox" || e.target.classList.contains("lightbox-close")) {
        lightbox.classList.remove("active");
        setTimeout(() => {
          if (!lightbox.classList.contains("active")) {
            lightbox.style.display = "none";
          }
        }, 300);
      }
    });
  }

  await loadDataset(datasets[0]);
}
main().catch((err) => { console.error(err); alert(`Error cargando dashboard: ${err.message}`); });


//LOGICA BOTON ATRAS
let goBackButton = document.getElementById("goBackButton")

goBackButton.addEventListener("click", () => {
  history.back();
})