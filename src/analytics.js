export const funnelStages = [
  { type: "landing_visit", label: "Landing visit", aliases: ["landing_visit", "visit"] },
  { type: "upload_started", label: "Upload started", aliases: ["upload_started", "upload"] },
  { type: "scan_completed", label: "Scan completed", aliases: ["scan_completed"] },
  { type: "account_completed", label: "Account completed", aliases: ["account_created", "login_completed", "signup"] },
  { type: "repair_selected", label: "Repair selected", aliases: ["repair_selected"] },
  { type: "checkout_started", label: "Checkout started", aliases: ["checkout_started"] },
  { type: "payment_completed", label: "Payment completed", aliases: ["payment_completed", "subscription"] },
  { type: "validated_download_completed", label: "Validated download", aliases: ["validated_download_completed"] }
];

const matchesStage = (event, stage) => stage.aliases.includes(event.type);

export function summarize(events) {
  const uniqueVisitors = new Set(events.filter(event => ["landing_visit", "visit"].includes(event.type)).map(event => event.visitorId)).size;
  const payments = events.filter(event => ["payment_completed", "subscription"].includes(event.type)).length;
  const visits = events.filter(event => ["landing_visit", "visit"].includes(event.type)).length;
  return {
    events: events.length,
    visitors: uniqueVisitors,
    subscriptions: payments,
    conversionRate: visits ? (payments / visits) * 100 : 0
  };
}

export function groupBySource(events) {
  const groups = new Map();
  for (const event of events) {
    const source = event.source || "direct";
    const row = groups.get(source) || { source, visits: 0, uploads: 0, subscriptions: 0 };
    if (["landing_visit", "visit"].includes(event.type)) row.visits += 1;
    if (["upload_started", "upload"].includes(event.type)) row.uploads += 1;
    if (["payment_completed", "subscription"].includes(event.type)) row.subscriptions += 1;
    groups.set(source, row);
  }
  return [...groups.values()].sort((a, b) => b.visits - a.visits || b.subscriptions - a.subscriptions);
}

export function funnelCounts(events) {
  return funnelStages.map(stage => ({
    type: stage.type,
    label: stage.label,
    count: events.filter(event => matchesStage(event, stage)).length
  }));
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
