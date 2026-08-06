import { buildCampaignUrl, funnelCounts, groupBySource, summarize, toCsv } from "./analytics.js";
import { loadState, resetState, saveState } from "./store.js";

let state = loadState();
const $ = selector => document.querySelector(selector);
const productName = id => state.products.find(product => product.id === id)?.name || id;

function toast(message) {
  const element = $("#toast"); element.textContent = message; element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 2200);
}

function renderMetrics() {
  const metrics = summarize(state.events);
  $("#metric-grid").innerHTML = [
    ["Tracked events", metrics.events], ["Unique visitors", metrics.visitors],
    ["Subscriptions", metrics.subscriptions], ["Visit conversion", `${metrics.conversionRate.toFixed(1)}%`]
  ].map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function tableOrEmpty(rows, columns) {
  if (!rows.length) return '<p class="muted">No data yet.</p>';
  return `<div class="table-wrap"><table><thead><tr>${columns.map(c => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${row[c.key] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderDashboard() {
  renderMetrics();
  $("#source-table").innerHTML = tableOrEmpty(groupBySource(state.events), [{key:"source",label:"Source"},{key:"visits",label:"Visits"},{key:"uploads",label:"Uploads"},{key:"subscriptions",label:"Subs"}]);
  const funnel = funnelCounts(state.events); const max = Math.max(...funnel.map(x => x.count), 1);
  $("#funnel").innerHTML = funnel.map(item => `<div class="bar-row"><span>${item.type.replace("_", " ")}</span><div class="bar"><i style="width:${(item.count/max)*100}%"></i></div><strong>${item.count}</strong></div>`).join("");
  const recent = [...state.events].sort((a,b) => b.timestamp.localeCompare(a.timestamp)).slice(0,8).map(e => ({...e, product: productName(e.product), timestamp: new Date(e.timestamp).toLocaleString()}));
  $("#recent-events").innerHTML = tableOrEmpty(recent, [{key:"timestamp",label:"Time"},{key:"product",label:"Product"},{key:"type",label:"Event"},{key:"source",label:"Source"},{key:"campaign",label:"Campaign"}]);
}

function renderCampaigns() {
  $("#campaign-list").innerHTML = tableOrEmpty(state.campaigns, [{key:"name",label:"Campaign"},{key:"source",label:"Source"},{key:"medium",label:"Medium"},{key:"created",label:"Created"}]);
}

function renderProducts() {
  $("#product-list").innerHTML = state.products.map(p => `<article class="panel product"><p class="eyebrow">${p.status}</p><h3>${p.name}</h3><strong>${p.price}</strong><a href="${p.url}" target="_blank" rel="noreferrer">Open product</a></article>`).join("");
  const options = state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  $("#campaign-product").innerHTML = options; $("#event-product").innerHTML = options;
  if (!$("#campaign-url").value) $("#campaign-url").value = state.products[0]?.url || "";
}

function render() { renderProducts(); renderDashboard(); renderCampaigns(); }

async function loadLiveEvents() {
  const key = window.prompt("Enter the SignalDrift access key. It is used for this request only.");
  if (!key) return;
  const response = await fetch("/api/events", { headers: { authorization: `Bearer ${key}` } });
  if (!response.ok) {
    toast(response.status === 401 ? "Access key rejected" : "Live events could not be loaded");
    return;
  }
  const { events } = await response.json();
  state.events = events.map(event => ({ ...event, timestamp: event.occurredAt || event.receivedAt }));
  saveState(state);
  renderDashboard();
  toast(`Loaded ${events.length} live events`);
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab,.view").forEach(el => el.classList.remove("active"));
  tab.classList.add("active"); $(`#${tab.dataset.view}`).classList.add("active");
}));

$("#campaign-form").addEventListener("submit", event => {
  event.preventDefault();
  const campaign = { id: crypto.randomUUID(), product: $("#campaign-product").value, source: $("#campaign-source").value, medium: $("#campaign-medium").value, name: $("#campaign-name").value, destination: $("#campaign-url").value, created: new Date().toLocaleDateString() };
  campaign.url = buildCampaignUrl(campaign.destination, { ...campaign, campaign: campaign.name });
  state.campaigns.unshift(campaign); saveState(state); $("#generated-link").value = campaign.url;
  $("#campaign-empty").hidden = true; $("#campaign-result").hidden = false; renderCampaigns(); toast("Tracked campaign link created");
});

$("#copy-link").addEventListener("click", async () => { await navigator.clipboard.writeText($("#generated-link").value); toast("Link copied"); });

$("#event-form").addEventListener("submit", event => {
  event.preventDefault();
  state.events.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), product: $("#event-product").value, type: $("#event-type").value, source: $("#event-source").value.trim() || "direct", campaign: $("#event-campaign").value.trim(), visitorId: `manual-${crypto.randomUUID().slice(0,8)}` });
  saveState(state); renderDashboard(); event.target.reset(); toast("Event recorded");
});

$("#export-csv").addEventListener("click", () => {
  const blob = new Blob([toCsv(state.events)], {type:"text/csv"}); const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "signaldrift-events.csv"; anchor.click(); URL.revokeObjectURL(url);
});

$("#reset-demo").addEventListener("click", () => { if (confirm("Reset SignalDrift to its starter data?")) { state = resetState(); render(); toast("Demo data reset"); } });
$("#load-live").addEventListener("click", loadLiveEvents);

render();
