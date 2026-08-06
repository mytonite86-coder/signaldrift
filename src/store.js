const KEY = "signaldrift-v0.1";

export const seed = {
  products: [{ id: "pathseal", name: "PathSeal", price: "$9.99/month", url: "https://mytonite86-coder.github.io/svg-path-closer/", status: "launch checkpoint" }],
  campaigns: [],
  events: [
    { id: crypto.randomUUID(), timestamp: new Date(Date.now() - 3600000).toISOString(), product: "pathseal", type: "visit", source: "facebook", campaign: "founder-preview", visitorId: "demo-1" },
    { id: crypto.randomUUID(), timestamp: new Date(Date.now() - 3300000).toISOString(), product: "pathseal", type: "upload", source: "facebook", campaign: "founder-preview", visitorId: "demo-1" },
    { id: crypto.randomUUID(), timestamp: new Date(Date.now() - 3000000).toISOString(), product: "pathseal", type: "subscription", source: "facebook", campaign: "founder-preview", visitorId: "demo-1" },
    { id: crypto.randomUUID(), timestamp: new Date(Date.now() - 1800000).toISOString(), product: "pathseal", type: "visit", source: "direct", campaign: "", visitorId: "demo-2" }
  ]
};

export function loadState() {
  try { return JSON.parse(localStorage.getItem(KEY)) || structuredClone(seed); }
  catch { return structuredClone(seed); }
}

export function saveState(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
export function resetState() { localStorage.removeItem(KEY); return structuredClone(seed); }
