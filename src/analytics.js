export const funnelOrder = ["visit", "signup", "upload", "checkout_started", "subscription"];

export function summarize(events) {
  const uniqueVisitors = new Set(events.filter(e => e.type === "visit").map(e => e.visitorId)).size;
  const subscriptions = events.filter(e => e.type === "subscription").length;
  const visits = events.filter(e => e.type === "visit").length;
  return {
    events: events.length,
    visitors: uniqueVisitors,
    subscriptions,
    conversionRate: visits ? (subscriptions / visits) * 100 : 0
  };
}

export function groupBySource(events) {
  const groups = new Map();
  for (const event of events) {
    const source = event.source || "direct";
    const row = groups.get(source) || { source, visits: 0, uploads: 0, subscriptions: 0 };
    if (event.type === "visit") row.visits += 1;
    if (event.type === "upload") row.uploads += 1;
    if (event.type === "subscription") row.subscriptions += 1;
    groups.set(source, row);
  }
  return [...groups.values()].sort((a, b) => b.visits - a.visits || b.subscriptions - a.subscriptions);
}

export function funnelCounts(events) {
  return funnelOrder.map(type => ({ type, count: events.filter(event => event.type === type).length }));
}

export function buildCampaignUrl(destination, { source, medium, campaign, product }) {
  const url = new URL(destination);
  url.searchParams.set("utm_source", source.trim());
  url.searchParams.set("utm_medium", medium.trim());
  url.searchParams.set("utm_campaign", campaign.trim());
  url.searchParams.set("sd_product", product);
  return url.toString();
}

export function toCsv(events) {
  const columns = ["timestamp", "product", "type", "source", "campaign", "visitorId"];
  const escape = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.join(","), ...events.map(event => columns.map(column => escape(event[column])).join(","))].join("\n");
}
