const PERIOD_LABELS = new Map([
  ["7day", "Last 7 days"],
  ["1month", "Last 1 month"],
  ["3month", "Last 3 months"],
  ["6month", "Last 6 months"],
  ["12month", "Last 12 months"],
  ["overall", "Overall"],
]);
const VIBE_STAGES = ["", "🔥", "🔥🎧", "🔥🎧✨", "🔥🎧✨🚀", "🔥🎧✨🚀🎆", "🔥🎧✨🚀🎆🪩", "🔥🎧✨🚀🎆🪩👑"];

const form = document.querySelector("#compare-form");
const userA = document.querySelector("#user-a");
const userB = document.querySelector("#user-b");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const fingerprint = document.querySelector("#fingerprint");
const submit = form.querySelector("button[type='submit']");
let activeController;

function selectedPeriods() {
  return [...form.querySelectorAll("input[name='period']:checked")].map(({ value }) => value);
}

function setPeriods(periods) {
  if (!periods.length) return;
  const allowed = new Set(periods.filter((period) => PERIOD_LABELS.has(period)));
  if (!allowed.size) return;
  form.querySelectorAll("input[name='period']").forEach((input) => { input.checked = allowed.has(input.value); });
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setLoading(loading) {
  submit.disabled = loading;
  submit.firstChild.textContent = loading ? "Comparing… " : "Find the overlap ";
  form.setAttribute("aria-busy", String(loading));
}

function textElement(name, content, className) {
  const element = document.createElement(name);
  element.textContent = content;
  if (className) element.className = className;
  return element;
}

function vennDiagram(data) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "venn");
  svg.setAttribute("viewBox", "0 0 620 390");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${data.users[0]} and ${data.users[1]} share ${data.counts.shared} artists, or ${data.overlapPercentage} percent of their combined unique artists.`);

  const circle = (cx, color) => {
    const node = document.createElementNS(ns, "circle");
    node.setAttribute("cx", cx);
    node.setAttribute("cy", "180");
    node.setAttribute("r", "142");
    node.setAttribute("fill", color);
    svg.append(node);
  };
  const label = (x, y, value, className) => {
    const node = document.createElementNS(ns, "text");
    node.setAttribute("x", x);
    node.setAttribute("y", y);
    node.setAttribute("class", className);
    node.textContent = value;
    svg.append(node);
  };

  circle(235, "#f07857");
  circle(385, "#36aeda");
  label(170, 180, data.counts.user1Only.toLocaleString(), "count");
  label(310, 180, data.counts.shared.toLocaleString(), "count");
  label(450, 180, data.counts.user2Only.toLocaleString(), "count");
  label(175, 345, data.users[0], "name");
  label(445, 345, data.users[1], "name");
  label(310, 375, `${data.overlapPercentage}% of the combined unique set`, "caption");
  return svg;
}

function metric(label, value, note) {
  const item = document.createElement("div");
  item.className = "metric";
  const labelElement = textElement("span", label, "metric-label");
  if (note) {
    const help = textElement("button", "?", "methodology-help");
    help.type = "button";
    help.setAttribute("aria-label", "How the match score is calculated");
    help.dataset.tooltip = note;
    labelElement.append(help);
  }
  item.append(labelElement, textElement("strong", value));
  return item;
}

function scoreToVibe(score) {
  if (score <= 100) return "";
  const normalized = (Math.min(score, 2000) - 100) / 1900;
  const index = 1 + Math.floor(normalized * (VIBE_STAGES.length - 2));
  return VIBE_STAGES[index];
}

function csvValue(value) {
  const string = String(value ?? "");
  return /[",\n]/u.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function downloadCsv(data) {
  const headings = ["Artist", "Match score", `${data.users[0]} plays`, `${data.users[1]} plays`, `${data.users[0]} rank`, `${data.users[1]} rank`, "Combined plays"];
  const rows = data.rankedShared.map((artist) => [artist.artist, artist.matchScore, artist.user1Playcount, artist.user2Playcount, artist.user1Rank, artist.user2Rank, artist.combinedPlaycount]);
  const csv = [headings, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `lastfm_overlap_${data.users[0]}_${data.users[1]}_${data.period}.csv`.replaceAll(/[^a-z0-9_.-]+/giu, "_");
  link.click();
  URL.revokeObjectURL(url);
}

function renderResult(data) {
  const card = document.querySelector("#result-template").content.firstElementChild.cloneNode(true);
  card.querySelector(".period-title").textContent = PERIOD_LABELS.get(data.period);
  card.querySelector(".plays-a").textContent = `${data.users[0]} plays`;
  card.querySelector(".plays-b").textContent = `${data.users[1]} plays`;

  const topMatch = data.rankedShared[0]?.matchScore ?? 0;
  const metrics = card.querySelector(".metrics");
  metrics.append(
    metric(`${data.users[0]} artists`, data.counts.user1Total.toLocaleString()),
    metric(`${data.users[1]} artists`, data.counts.user2Total.toLocaleString()),
    metric("Shared artists", data.counts.shared.toLocaleString()),
    metric("Top match", `${topMatch.toFixed(1)} ${scoreToVibe(topMatch)}`.trim(), "Uses both users' play counts and rewards a balanced match."),
  );
  card.querySelector(".venn-wrap").append(vennDiagram(data));

  const tbody = card.querySelector("tbody");
  if (!data.rankedShared.length) {
    const row = document.createElement("tr");
    const cell = textElement("td", "No shared artists in this timeframe.", "empty");
    cell.colSpan = 4;
    row.append(cell);
    tbody.append(row);
  } else {
    data.rankedShared.slice(0, 100).forEach((artist) => {
      const row = document.createElement("tr");
      [artist.artist, artist.matchScore.toFixed(2), artist.user1Playcount.toLocaleString(), artist.user2Playcount.toLocaleString()]
        .forEach((value) => row.append(textElement("td", value)));
      tbody.append(row);
    });
  }

  card.querySelector(".download").addEventListener("click", () => downloadCsv(data));
  results.append(card);
}

function renderError(period, error) {
  const card = document.createElement("article");
  card.className = "panel error-card";
  card.append(textElement("strong", PERIOD_LABELS.get(period)), textElement("p", error));
  results.append(card);
}

function renderFingerprint(data) {
  document.querySelector("#fingerprint-period").textContent = PERIOD_LABELS.get(data.period);
  document.querySelector("#fingerprint-label").textContent = data.fingerprint.label;
  document.querySelector("#fingerprint-summary").textContent = `${data.fingerprint.overlapPercentage}% overlap · ${data.fingerprint.sharedArtists.toLocaleString()} shared artists`;
  document.querySelector("#fingerprint-strongest").textContent = data.fingerprint.strongestArtists.length
    ? data.fingerprint.strongestArtists.join(" · ")
    : "Still waiting for a shared signal";
  document.querySelector("#fingerprint-deep-cut").textContent = data.fingerprint.deepCut
    ? `${data.fingerprint.deepCut.artist} (#${data.fingerprint.deepCut.user1Rank} / #${data.fingerprint.deepCut.user2Rank})`
    : "No shared deep cut yet";
  fingerprint.hidden = false;
}

function comparisonUrl(a, b, periods) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("a", a);
  url.searchParams.set("b", b);
  url.searchParams.set("p", periods.join(","));
  return url;
}

async function compare(a, b, periods) {
  activeController?.abort();
  activeController = new AbortController();
  results.replaceChildren();
  fingerprint.hidden = true;
  setLoading(true);
  setStatus(`Comparing ${a} and ${b} across ${periods.length} timeframe${periods.length === 1 ? "" : "s"}…`);
  history.replaceState(null, "", comparisonUrl(a, b, periods));

  const requests = periods.map(async (period) => {
    const params = new URLSearchParams({ a, b, period });
    try {
      const response = await fetch(`/api/lastfm/compare?${params}`, { signal: activeController.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "The comparison failed.");
      return { period, data: body };
    } catch (error) {
      if (error.name === "AbortError") throw error;
      return { period, error: error.message };
    }
  });

  try {
    const outcomes = await Promise.all(requests);
    const successful = outcomes.filter(({ data }) => data);
    outcomes.forEach(({ period, data, error }) => data ? renderResult(data) : renderError(period, error));
    const fingerprintResult = successful.find(({ data }) => data.period === "overall")?.data ?? successful.at(-1)?.data;
    if (fingerprintResult) renderFingerprint(fingerprintResult);
    const failures = outcomes.length - successful.length;
    setStatus(failures ? `${successful.length} timeframe(s) completed; ${failures} failed.` : "Comparison complete.", failures > 0);
  } catch (error) {
    if (error.name !== "AbortError") setStatus("The comparison could not be completed. Please try again.", true);
  } finally {
    setLoading(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const a = userA.value.trim();
  const b = userB.value.trim();
  const periods = selectedPeriods();
  if (!a || !b) return setStatus("Enter both Last.fm usernames.", true);
  if (!periods.length) return setStatus("Choose at least one timeframe.", true);
  compare(a, b, periods);
});

document.querySelector("#share").addEventListener("click", async (event) => {
  try {
    await navigator.clipboard.writeText(location.href);
    event.currentTarget.textContent = "Link copied!";
    setTimeout(() => { event.currentTarget.textContent = "Copy share link"; }, 1800);
  } catch {
    setStatus("Copy the current address from your browser to share this result.");
  }
});

const initial = new URLSearchParams(location.search);
userA.value = initial.get("a") ?? "";
userB.value = initial.get("b") ?? "";
setPeriods((initial.get("p") ?? "").split(",").filter(Boolean));
if (userA.value && userB.value) compare(userA.value, userB.value, selectedPeriods());
