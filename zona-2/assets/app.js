let charts = [];

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return await res.json();
}

function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

function percentage(value, total) {
  return total ? (value / total) * 100 : 0;
}

function scoreClass(score) {
  if (score >= 75) return "score-good";
  if (score >= 60) return "score-mid";
  return "score-bad";
}

function verdictPill(score) {
  if (score >= 75) return `<span class="pill pass">Sólida</span>`;
  return `<span class="pill fail">Crítica</span>`;
}

function titleCase(text) {
  return String(text || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeImagePath(path) {
  if (typeof path !== "string") return "";
  const clean = path.trim();
  if (!clean) return "";

  if (
    clean.startsWith("http://") ||
    clean.startsWith("https://") ||
    clean.startsWith("/") ||
    clean.startsWith("./") ||
    clean.startsWith("../")
  ) {
    return encodeURI(clean);
  }

  return encodeURI(`./${clean}`);
}

function renderHeader(summary) {
  document.getElementById("districtTitle").textContent =
    summary.display_name || summary.district_slug || "Distrito";
  document.getElementById("districtSubtitle").textContent =
    `${summary.company || "Compañía"} · Resumen ejecutivo distrital`;
  document.title =
    `${summary.display_name || summary.district_slug} · Dashboard distrital`;
}

function formatShortSpanishDate(date) {
  const months = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function parseRowDate(row) {
  const rawDate = String(row.fecha || "").trim();
  const sourceUrl = String(row.source_url || "").trim();

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
    const numeric = Number(rawDate);
    if (Number.isFinite(numeric)) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const millis = excelEpoch + numeric * 24 * 60 * 60 * 1000;
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function locationScore(row) {
  return percentage(Number(row.pass_count ?? 0), Number(row.total_pizzas ?? 0));
}

async function renderWeekRangeFromLocations(locations) {
  const allDates = [];

  for (const loc of locations) {
    if (!loc.relative_url) continue;

    try {
      const manifest = await fetchJson(`${loc.relative_url}manifest.json`);
      const datasets = manifest.datasets || [];

      for (const ds of datasets) {
        if (!ds.detailed_json) continue;
        try {
          const detailed = await fetchJson(`${loc.relative_url}${ds.detailed_json.replace(/^\.\//, "")}`);
          detailed.forEach((row) => {
            const parsed = parseRowDate(row);
            if (parsed) allDates.push(parsed);
          });
        } catch (err) {
          console.warn(`No se pudo cargar detailed para ${loc.location}:`, err);
        }
      }
    } catch (err) {
      console.warn(`No se pudo cargar manifest de ${loc.location}:`, err);
    }
  }

  const target = document.getElementById("weekRange");
  if (!target) return;

  if (!allDates.length) {
    target.textContent = "Período: -";
    return;
  }

  allDates.sort((a, b) => a - b);
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];

  target.textContent =
    `Período: ${formatShortSpanishDate(minDate)} - ${formatShortSpanishDate(maxDate)}, ${maxDate.getFullYear()}`;
}

function renderSummary(summary) {
  document.getElementById("totalLocations").textContent = summary.total_locations ?? 0;
  document.getElementById("totalPizzas").textContent = summary.total_pizzas ?? 0;
  document.getElementById("avgScore").textContent = Number(summary.average_score ?? 0).toFixed(1);
  document.getElementById("passFail").textContent = `${summary.pass_count ?? 0} / ${summary.fail_count ?? 0}`;
  document.getElementById("passRate").textContent =
    `${percentage(summary.pass_count ?? 0, summary.total_pizzas ?? 0).toFixed(1)}%`;
}

function renderLocationCards(locations) {
  const container = document.getElementById("locationCards");
  container.innerHTML = "";

  locations.forEach((row) => {
    const best = row.best_item || {};
    const worst = row.worst_item || {};
    const score = locationScore(row);

    const bestImg = best.crop_image ? safeImagePath(best.crop_image) : "";
    const worstImg = worst.crop_image ? safeImagePath(worst.crop_image) : "";

    const bestImageHtml = bestImg
      ? `<img src="${bestImg}" alt="Mejor pizza">`
      : `<div style="aspect-ratio:1/1;background:#eef2f7;"></div>`;

    const worstImageHtml = worstImg
      ? `<img src="${worstImg}" alt="Peor pizza">`
      : `<div style="aspect-ratio:1/1;background:#eef2f7;"></div>`;

    const card = document.createElement("div");
    card.className = "location-card";
    card.innerHTML = `
      <div class="location-top">
        <div>
          <div class="location-name">${titleCase(row.location)}</div>
          <a class="location-link" href="${row.relative_url}">Abrir dashboard individual</a>
        </div>
        <div class="score-chip ${scoreClass(score)}">
          ${score.toFixed(1)}%
        </div>
      </div>

      <div class="location-kpis">
        <div class="mini-kpi">
          <div class="k">Pizzas</div>
          <div class="v">${row.total_pizzas ?? 0}</div>
        </div>
        <div class="mini-kpi">
          <div class="k">PASS</div>
          <div class="v">${row.pass_count ?? 0}</div>
        </div>
        <div class="mini-kpi">
          <div class="k">FAIL</div>
          <div class="v">${row.fail_count ?? 0}</div>
        </div>
      </div>

      <div class="best-worst-grid">
        <div class="pizza-mini pizza-best">
          ${bestImageHtml}
          <div class="pizza-mini-body">
            <div class="pizza-mini-title">Mejor calificada</div>
            <div class="pizza-score">${best.score ?? "-"}</div>
            <div class="pizza-meta">${best.veredicto || ""}</div>
          </div>
        </div>

        <div class="pizza-mini pizza-worst">
          ${worstImageHtml}
          <div class="pizza-mini-body">
            <div class="pizza-mini-title">Peor calificada</div>
            <div class="pizza-score">${worst.score ?? "-"}</div>
            <div class="pizza-meta">${worst.veredicto || ""}</div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function commonOptions(indexAxis = "x") {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    plugins: {
      legend: {
        labels: {
          color: "#17324d",
          boxWidth: 14,
          boxHeight: 10
        }
      },
      tooltip: {
        backgroundColor: "rgba(255,255,255,0.96)",
        titleColor: "#17324d",
        bodyColor: "#17324d",
        borderColor: "#d9e3ed",
        borderWidth: 1
      }
    },
    scales: {
      x: {
        stacked: indexAxis === "x",
        ticks: { color: "#17324d" },
        grid: { color: "#e6edf4" }
      },
      y: {
        stacked: indexAxis === "x",
        beginAtZero: true,
        ticks: { color: "#17324d", precision: 0 },
        grid: { color: "#e6edf4" }
      }
    }
  };
}

function renderCharts(locations) {
  destroyCharts();

  const labels = locations.map((x) => titleCase(x.location));
  const scores = locations.map((x) => locationScore(x));
  const passCounts = locations.map((x) => Number(x.pass_count ?? 0));
  const failCounts = locations.map((x) => Number(x.fail_count ?? 0));
  const passRates = locations.map((x) => percentage(Number(x.pass_count ?? 0), Number(x.total_pizzas ?? 0)));
  const burbuja = locations.map((x) => Number(x.burbuja_count ?? 0));
  const grasa = locations.map((x) => Number(x.grasa_count ?? 0));
  const bordes = locations.map((x) => Number(x.bordes_count ?? 0));
  const target = 75;

  charts.push(
    new Chart(document.getElementById("scoreChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Score",
            data: scores,
            backgroundColor: "#89b4e5",
            borderRadius: 10,
            maxBarThickness: 42
          },
          {
            type: "line",
            label: "Meta",
            data: labels.map(() => target),
            borderColor: "#c79b3b",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0
          }
        ]
      },
      options: commonOptions("x")
    })
  );

  charts.push(
    new Chart(document.getElementById("passFailChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "PASS",
            data: passCounts,
            backgroundColor: "#1f7a5a",
            borderRadius: 8
          },
          {
            label: "FAIL",
            data: failCounts,
            backgroundColor: "#d98a8a",
            borderRadius: 8
          }
        ]
      },
      options: commonOptions("x")
    })
  );

  charts.push(
    new Chart(document.getElementById("passRateChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "% PASS",
            data: passRates,
            backgroundColor: "#9ec27f",
            borderRadius: 10,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        ...commonOptions("y"),
        scales: {
          x: {
            ticks: { color: "#17324d" },
            grid: { color: "#e6edf4" }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "#17324d",
              callback: (value) => `${value}%`
            },
            grid: { color: "#e6edf4" }
          }
        }
      }
    })
  );

  charts.push(
    new Chart(document.getElementById("issuesChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Burbuja",
            data: burbuja,
            backgroundColor: "#d7ba58",
            borderRadius: 8
          },
          {
            label: "Grasa",
            data: grasa,
            backgroundColor: "#b8d4b0",
            borderRadius: 8
          },
          {
            label: "Bordes sucios",
            data: bordes,
            backgroundColor: "#e9a7a7",
            borderRadius: 8
          }
        ]
      },
      options: commonOptions("y")
    })
  );
}

function renderTable(locations) {
  const tbody = document.getElementById("locationsBody");
  tbody.innerHTML = "";

  locations.forEach((row) => {
    const score = locationScore(row);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${titleCase(row.location)}</strong></td>
      <td><strong>${score.toFixed(1)}%</strong> ${verdictPill(score)}</td>
      <td>${row.total_pizzas ?? 0}</td>
      <td>${row.pass_count ?? 0}</td>
      <td>${row.fail_count ?? 0}</td>
      <td>${row.burbuja_count ?? 0}</td>
      <td>${row.grasa_count ?? 0}</td>
      <td>${row.bordes_count ?? 0}</td>
      <td><a class="table-link" href="${row.relative_url}">Abrir</a></td>
    `;
    tbody.appendChild(tr);
  });
}

async function main() {
  const [summary, locationPayload] = await Promise.all([
    fetchJson("./json/district_summary.json"),
    fetchJson("./json/district_locations.json")
  ]);

  const locations = (locationPayload.locations || [])
    .slice()
    .sort((a, b) => locationScore(b) - locationScore(a));

  renderHeader(summary);
  renderSummary(summary);
  renderLocationCards(locations);
  renderCharts(locations);
  renderTable(locations);
  await renderWeekRangeFromLocations(locations);
}

main().catch((err) => {
  console.error(err);
  alert(`Error cargando dashboard distrital: ${err.message}`);
});