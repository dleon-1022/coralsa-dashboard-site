let charts = [];
let detailRows = [];
const DETAIL_PAGE_SIZE = 10;

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return await res.json();
}

function verdictPill(veredicto) {
  const cls = veredicto === "PASS" ? "pass" : "fail";
  return `<span class="pill ${cls}">${veredicto}</span>`;
}

function safeUrl(url) {
  return typeof url === "string" && url.trim() ? url.trim() : "";
}

function safeImagePath(path) {
  if (typeof path !== "string") return "";
  const clean = path.trim();
  if (!clean) return "";

  const normalized =
    clean.startsWith("http://") ||
    clean.startsWith("https://") ||
    clean.startsWith("/") ||
    clean.startsWith("./") ||
    clean.startsWith("../")
      ? clean
      : `./${clean}`;

  return encodeURI(normalized);
}

function percentage(value, total) {
  return total ? (value / total) * 100 : 0;
}

function titleCase(text) {
  return String(text || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseCsvContext(csvName) {
  const raw = String(csvName || "").replace(/\.csv$/i, "").trim();

  let client = "";
  let district = "";
  let location = "";

  let match = raw.match(/^PCSAPI[_\s-]*Distrito[_\s-]*(\d+)\s*-\s*(.+)$/i);
  if (match) {
    client = "PCSAPI";
    district = `Distrito ${String(parseInt(match[1], 10)).padStart(2, "0")}`;
    location = titleCase(match[2]);
    return { client, district, location, display: `${district} · ${location}` };
  }

  match = raw.match(/^Distrito[_\s-]*(\d+)\s*-\s*(.+)$/i);
  if (match) {
    client = "PCSAPI";
    district = `Distrito ${String(parseInt(match[1], 10)).padStart(2, "0")}`;
    location = titleCase(match[2]);
    return { client, district, location, display: `${district} · ${location}` };
  }

  match = raw.match(/^LCPERU[_\s-]*(.+)$/i);
  if (match) {
    client = "LCPERU";
    location = titleCase(match[1]);
    return { client, district: "", location, display: location };
  }

  match = raw.match(/^LCPZ[_\s-]*(.+)$/i);
  if (match) {
    client = "LCPZ";
    location = titleCase(match[1]);
    return { client, district: "", location, display: location };
  }

  location = titleCase(raw);
  return { client: "", district: "", location, display: location };
}

function updateBrandHeader(rankingData) {
  const ctx = parseCsvContext(rankingData.csv_name || "");
  const brandTitle = document.getElementById("brandTitle");
  const brandSubtitle = document.getElementById("brandSubtitle");

  if (!brandTitle || !brandSubtitle) return;

  if (ctx.client === "PCSAPI") {
    brandTitle.textContent = `${ctx.client} · ${ctx.district}`;
    brandSubtitle.textContent = ctx.location || "Dashboard ejecutivo de calidad";
  } else if (ctx.client) {
    brandTitle.textContent = ctx.client;
    brandSubtitle.textContent = ctx.location || "Dashboard ejecutivo de calidad";
  } else {
    brandTitle.textContent = "Quality Dashboard";
    brandSubtitle.textContent = ctx.location || "Dashboard ejecutivo de calidad";
  }

  document.title = `${ctx.client || "Quality"} ${ctx.district || ""} ${ctx.location || ""}`.replace(/\s+/g, " ").trim();
}

function excelSerialToDate(serial) {
  const numeric = Number(serial);
  if (!Number.isFinite(numeric)) return null;
  const excelEpoch = Date.UTC(1899, 11, 30);
  const millis = excelEpoch + numeric * 24 * 60 * 60 * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateInfo(row) {
  const rawDate = String(row.fecha || "").trim();
  const sourceUrl = safeUrl(row.source_url);

  const urlMatch = sourceUrl.match(/(\d{8})-(\d{6})/);
  if (urlMatch) {
    const [, yyyymmdd, hhmmss] = urlMatch;
    const year = Number(yyyymmdd.slice(0, 4));
    const month = Number(yyyymmdd.slice(4, 6)) - 1;
    const day = Number(yyyymmdd.slice(6, 8));
    const hour = Number(hhmmss.slice(0, 2));
    const minute = Number(hhmmss.slice(2, 4));
    const second = Number(hhmmss.slice(4, 6));
    const parsed = new Date(year, month, day, hour, minute, second);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (/^\d+(\.\d+)?$/.test(rawDate)) {
    return excelSerialToDate(rawDate);
  }

  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function formatDayLabel(date) {
  return date.toLocaleDateString("es-EC", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatHourSlot(date) {
  const hour = String(date.getHours()).padStart(2, "0");
  return `${hour}:00 - ${hour}:59`;
}

function formatShortSpanishDate(date) {
  const months = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function renderWeekRangeFromDetailed(detailedData) {
  const dates = detailedData
    .map((row) => parseDateInfo(row))
    .filter(Boolean)
    .sort((a, b) => a - b);

  const target = document.getElementById("weekRange");
  if (!target) return;

  if (!dates.length) {
    target.textContent = "Período: -";
    return;
  }

  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  target.textContent =
    `Período: ${formatShortSpanishDate(minDate)} - ${formatShortSpanishDate(maxDate)}, ${maxDate.getFullYear()}`;
}

function buildIncidentTimeline(detailedData) {
  const dayCounts = new Map();
  const hourCounts = new Map();

  for (const row of detailedData) {
    const incidentCount =
      (row.burbuja === "si" ? 1 : 0) +
      (row.grasa === "si" ? 1 : 0) +
      (row.bordes_sucios === "si" ? 1 : 0);

    if (!incidentCount) continue;

    const parsedDate = parseDateInfo(row);
    if (!parsedDate) continue;

    const dayKey = parsedDate.toISOString().slice(0, 10);
    const hourKey = `${dayKey}-${String(parsedDate.getHours()).padStart(2, "0")}`;

    dayCounts.set(dayKey, {
      label: formatDayLabel(parsedDate),
      total: (dayCounts.get(dayKey)?.total || 0) + incidentCount,
    });

    hourCounts.set(hourKey, {
      label: formatHourSlot(parsedDate),
      total: (hourCounts.get(hourKey)?.total || 0) + incidentCount,
    });
  }

  const sortedDays = [...dayCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  const sortedHours = [...hourCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  return {
    dayLabels: sortedDays.map((item) => item.label),
    dayValues: sortedDays.map((item) => item.total),
    dayHighlights: sortedDays,
    hourLabels: sortedHours.map((item) => item.label),
    hourValues: sortedHours.map((item) => item.total),
    hourHighlights: sortedHours,
  };
}

function highlightSeries(values, baseColor, highlightColor) {
  if (!values.length) return [];
  const maxValue = Math.max(...values);
  return values.map((value) => (value === maxValue ? highlightColor : baseColor));
}

function buildMetrics(detailedData) {
  const total = detailedData.length;
  const pass = detailedData.filter((x) => x.veredicto === "PASS").length;
  const fail = total - pass;
  const burbuja = detailedData.filter((x) => x.burbuja === "si").length;
  const grasa = detailedData.filter((x) => x.grasa === "si").length;
  const bordes = detailedData.filter((x) => x.bordes_sucios === "si").length;
  const horneadoCritico = detailedData.filter((x) => (x.horneado || "").toLowerCase() !== "correcto").length;
  const timeline = buildIncidentTimeline(detailedData);

  return {
    total,
    pass,
    fail,
    burbuja,
    grasa,
    bordes,
    horneadoCritico,
    dayIncidentLabels: timeline.dayLabels,
    dayIncidentValues: timeline.dayValues,
    dayHighlights: timeline.dayHighlights,
    hourIncidentLabels: timeline.hourLabels,
    hourIncidentValues: timeline.hourValues,
    hourHighlights: timeline.hourHighlights,
  };
}

function renderSummary(rankingData, metrics) {
  const ctx = parseCsvContext(rankingData.csv_name);

  document.getElementById("csvName").textContent = ctx.location || ctx.display || "-";
  document.getElementById("avgScore").textContent = rankingData.average_score ?? 0;
  document.getElementById("passFailKpi").textContent = `${metrics.pass} / ${metrics.fail}`;
  document.getElementById("passRateKpi").textContent =
    `${percentage(metrics.pass, metrics.total).toFixed(1)}%`;
  document.getElementById("totalPizzasKpi").textContent = String(metrics.total);
  document.getElementById("passCountLabel").textContent = String(metrics.pass);
  document.getElementById("failCountLabel").textContent = String(metrics.fail);
}

function renderBulletChart(rankingData) {
  const averageScore = Number(rankingData.average_score ?? 0);
  const targetScore = 75;
  const statusLabel = document.getElementById("bulletStatusLabel");

  document.getElementById("bulletBar").style.width = `${Math.max(0, Math.min(100, averageScore))}%`;
  document.getElementById("bulletTarget").style.left = `${targetScore}%`;
  document.getElementById("bulletValueLabel").textContent = averageScore.toFixed(2);
  document.getElementById("bulletTargetLabel").textContent = String(targetScore);

  document.getElementById("bulletBar").style.background =
    averageScore < 41
      ? "linear-gradient(90deg, #d76a6a, #b44848)"
      : averageScore < 70
        ? "linear-gradient(90deg, #e0c064, #b5842f)"
        : "linear-gradient(90deg, #3c8d72, #1f7a5a)";

  if (averageScore < 41) {
    statusLabel.textContent = "Bajo rendimiento";
    statusLabel.style.background = "#f9eded";
    statusLabel.style.borderColor = "#efcdcd";
    statusLabel.style.color = "#b44848";
  } else if (averageScore < 70) {
    statusLabel.textContent = "En evolución";
    statusLabel.style.background = "#fdf7e8";
    statusLabel.style.borderColor = "#f0dfb4";
    statusLabel.style.color = "#9c7325";
  } else {
    statusLabel.textContent = "Buen rendimiento";
    statusLabel.style.background = "#eef5f0";
    statusLabel.style.borderColor = "#cfe1d4";
    statusLabel.style.color = "#1f7a5a";
  }
}

function destroyCharts() {
  charts.forEach((chart) => chart.destroy());
  charts = [];
}

function commonChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#17324d",
          boxWidth: 18,
          boxHeight: 10,
        },
      },
      tooltip: {
        titleColor: "#17324d",
        bodyColor: "#17324d",
        backgroundColor: "rgba(255,255,255,0.96)",
        borderColor: "#d6dee8",
        borderWidth: 1,
      },
    },
  };
}

function lightScales(xTicks = {}) {
  return {
    x: {
      ticks: { color: "#17324d", ...xTicks },
      grid: { color: "#e4ebf2" },
    },
    y: {
      beginAtZero: true,
      ticks: { color: "#17324d", precision: 0 },
      grid: { color: "#e4ebf2" },
    },
  };
}

function renderCharts(metrics) {
  destroyCharts();

  const worstDayColors = highlightSeries(metrics.dayIncidentValues, "#d9dde4", "#b44848");
  const worstHourColors = highlightSeries(metrics.hourIncidentValues, "#d9dde4", "#2e6f95");

  charts.push(
    new Chart(document.getElementById("passFailChart"), {
      type: "doughnut",
      data: {
        labels: ["PASS", "FAIL"],
        datasets: [{
          data: [metrics.pass, metrics.fail],
          backgroundColor: ["#1f7a5a", "#d98a8a"],
          borderWidth: 0,
        }],
      },
      options: { ...commonChartOptions(), cutout: "68%" },
    }),
  );

  charts.push(
    new Chart(document.getElementById("dayIncidentChart"), {
      type: "bar",
      data: {
        labels: metrics.dayIncidentLabels,
        datasets: [{
          label: "Incidentes",
          data: metrics.dayIncidentValues,
          backgroundColor: worstDayColors,
          borderColor: worstDayColors,
          borderWidth: 1,
          borderRadius: 10,
          categoryPercentage: 0.55,
          barPercentage: 0.55,
          maxBarThickness: 42,
        }],
      },
      options: { ...commonChartOptions(), scales: lightScales() },
    }),
  );

  charts.push(
    new Chart(document.getElementById("hourIncidentChart"), {
      type: "bar",
      data: {
        labels: metrics.hourIncidentLabels,
        datasets: [{
          label: "Incidentes",
          data: metrics.hourIncidentValues,
          backgroundColor: worstHourColors,
          borderColor: worstHourColors,
          borderWidth: 1,
          borderRadius: 10,
          categoryPercentage: 0.7,
          barPercentage: 0.7,
          maxBarThickness: 48,
        }],
      },
      options: { ...commonChartOptions(), scales: lightScales({ maxRotation: 45, minRotation: 45 }) },
    }),
  );
}

function renderOperationalInsights(metrics) {
  const worstDay = (metrics.dayHighlights || []).reduce((max, item) => (item.total > (max?.total || 0) ? item : max), null);
  const worstHour = (metrics.hourHighlights || []).reduce((max, item) => (item.total > (max?.total || 0) ? item : max), null);

  document.getElementById("worstDayInsight").textContent = worstDay
    ? `Día con más incidentes: ${worstDay.label} con ${worstDay.total} incidentes`
    : "Sin incidentes relevantes";

  document.getElementById("worstHourInsight").textContent = worstHour
    ? `Franja crítica: ${worstHour.label} con ${worstHour.total} incidentes`
    : "Sin franja crítica detectada";
}

function setRing(circleId, value, total, pctId, countId) {
  const circle = document.getElementById(circleId);
  const pctEl = document.getElementById(pctId);
  const countEl = document.getElementById(countId);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? (value / total) * 100 : 0;
  const offset = circumference * (1 - pct / 100);

  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${offset}`;
  pctEl.textContent = `${pct.toFixed(1)}%`;
  countEl.textContent = `${value} / ${total}`;
}

function renderIncidentRings(metrics) {
  setRing("ring-burbuja", metrics.burbuja, metrics.total, "burbujaPct", "burbujaCount");
  setRing("ring-grasa", metrics.grasa, metrics.total, "grasaPct", "grasaCount");
  setRing("ring-bordes", metrics.bordes, metrics.total, "bordesPct", "bordesCount");
  setRing("ring-horneado", metrics.horneadoCritico, metrics.total, "horneadoPct", "horneadoCount");
}

function renderRankingList(containerId, rankingData, detailedData, verdict) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const top = (rankingData.ranking || [])
    .filter((item) => item.veredicto === verdict)
    .sort((a, b) => (verdict === "FAIL" ? a.score - b.score : b.score - a.score))
    .slice(0, 10);

  if (!top.length) {
    container.innerHTML = '<div class="card"><div class="small">No hay registros para este veredicto.</div></div>';
    return;
  }

  for (const item of top) {
    const detailMatch = (detailedData || []).find((d) => d.crop_image === item.crop_image);
    const sourceUrl = safeUrl(detailMatch?.source_url || item.source_url || "");
    const cropImage = safeImagePath(item.crop_image);

    const cropImageHtml = cropImage
      ? `<img src="${cropImage}" alt="crop pizza">`
      : `<div class="small" style="padding:16px;">Sin preview</div>`;

    const originalLinkHtml = sourceUrl
      ? `<div class="small"><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" title="${sourceUrl}">Ver imagen original</a></div>`
      : '<div class="small">Sin URL original</div>';

    const el = document.createElement("div");
    el.className = `pizza-card ${verdict === "PASS" ? "pass-card" : "fail-card"}`;
    el.innerHTML = `
      ${cropImageHtml}
      <div class="content">
        <div class="card-primary">
          ${verdictPill(item.veredicto)}
          <div class="card-score">${item.score}</div>
        </div>
        <div class="card-secondary">
          <div class="small">Fecha: ${item.fecha || "-"}</div>
          <div class="small">Locación: ${item.locacion || "-"}</div>
        </div>
        <div class="hover-details">
          <div class="small">Burbuja: ${item.burbuja}</div>
          <div class="small">Grasa: ${item.grasa}</div>
          <div class="small">Bordes sucios: ${item.bordes_sucios}</div>
          <div class="small">Horneado: ${item.horneado}</div>
          <div class="small">Distribución: ${item.distribucion}</div>
          ${originalLinkHtml}
        </div>
      </div>
    `;
    container.appendChild(el);
  }
}

function updatePaginationTabs(currentPage, totalPages) {
  const container = document.getElementById("detailPagination");
  container.innerHTML = "";

  for (let page = 1; page <= totalPages; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pagination-tab${page === currentPage ? " active" : ""}`;
    button.textContent = String(page);
    button.addEventListener("click", () => renderDetailPage(page));
    container.appendChild(button);
  }
}

function renderDetailPage(page) {
  const tbody = document.getElementById("detailBody");
  const resultsBadge = document.getElementById("detailResultsBadge");
  const pageBadge = document.getElementById("detailPageBadge");
  tbody.innerHTML = "";

  const totalRows = detailRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / DETAIL_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * DETAIL_PAGE_SIZE;
  const end = Math.min(start + DETAIL_PAGE_SIZE, totalRows);
  const rows = detailRows.slice(start, end);

  resultsBadge.textContent = totalRows ? `${start + 1} - ${end} de ${totalRows}` : "0 - 0 de 0";
  pageBadge.textContent = `Página ${safePage} de ${totalPages}`;
  updatePaginationTabs(safePage, totalPages);

  for (const row of rows) {
    const sourceUrl = safeUrl(row.source_url);
    const cropImage = safeImagePath(row.crop_image);

    const originalCell = sourceUrl
      ? `<a class="table-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer" title="${sourceUrl}">Ver original</a>`
      : '<span class="small">Sin URL</span>';

    const cropCell = cropImage
      ? `<img src="${cropImage}" alt="crop" class="thumb">`
      : `<span class="small">Sin preview</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cropCell}</td>
      <td>${row.fecha || "-"}</td>
      <td>${row.locacion || "-"}</td>
      <td><strong>${row.score ?? "-"}</strong></td>
      <td>${verdictPill(row.veredicto || "-")}</td>
      <td>${row.burbuja || "-"}</td>
      <td>${row.grasa || "-"}</td>
      <td>${row.bordes_sucios || "-"}</td>
      <td>${row.horneado || "-"}</td>
      <td>${row.distribucion || "-"}</td>
      <td>${originalCell}</td>
    `;
    tbody.appendChild(tr);
  }
}

function setupDetailPagination(detailedData) {
  detailRows = [...detailedData];
  renderDetailPage(1);
}

function buildOptionLabel(csvName) {
  const ctx = parseCsvContext(csvName);
  if (ctx.client === "PCSAPI") return `${ctx.district} · ${ctx.location}`;
  if (ctx.location) return ctx.location;
  return ctx.display || "Dataset";
}

async function loadDataset(dataset) {
  const [rankingData, detailedData] = await Promise.all([
    fetchJson(dataset.ranking_json),
    fetchJson(dataset.detailed_json),
  ]);

  const metrics = buildMetrics(detailedData);
  updateBrandHeader(rankingData);
  renderWeekRangeFromDetailed(detailedData);
  renderSummary(rankingData, metrics);
  renderBulletChart(rankingData);
  renderCharts(metrics);
  renderOperationalInsights(metrics);
  renderIncidentRings(metrics);
  renderRankingList("passGrid", rankingData, detailedData, "PASS");
  renderRankingList("failGrid", rankingData, detailedData, "FAIL");
  setupDetailPagination(detailedData);
}

async function main() {
  const manifest = await fetchJson("./manifest.json");
  const datasets = manifest.datasets || [];
  const select = document.getElementById("datasetSelect");

  if (!datasets.length) {
    if (select) select.innerHTML = "<option>No hay datasets</option>";
    return;
  }

  if (select) {
    datasets.forEach((ds, idx) => {
      const option = document.createElement("option");
      option.value = idx;
      option.textContent = buildOptionLabel(ds.csv_name);
      select.appendChild(option);
    });

    if (datasets.length <= 1) {
      const wrap = select.closest(".dataset-select-wrap");
      if (wrap) wrap.style.display = "none";
    } else {
      select.addEventListener("change", async () => {
        const ds = datasets[Number(select.value)];
        await loadDataset(ds);
      });
    }
  }

  await loadDataset(datasets[0]);
}

main().catch((err) => {
  console.error(err);
  alert(`Error cargando dashboard: ${err.message}`);
});