import { randomUUID } from "node:crypto";

export const eventTypes = new Set([
  "visit",
  "signup",
  "upload",
  "checkout_started",
  "subscription"
]);

function cleanString(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function normalizeEvent(input, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Event body must be a JSON object");
  }

  const product = cleanString(input.product, 80);
  const type = cleanString(input.type, 80);
  if (!product) throw new TypeError("product is required");
  if (!eventTypes.has(type)) throw new TypeError("type is not supported");

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
  if (Number.isNaN(occurredAt.getTime())) throw new TypeError("occurredAt must be a valid date");

  return {
    id: randomUUID(),
    receivedAt: now.toISOString(),
    occurredAt: occurredAt.toISOString(),
    product,
    type,
    visitorId: cleanString(input.visitorId, 120),
    userId: cleanString(input.userId, 120),
    source: cleanString(input.source, 120) || "direct",
    medium: cleanString(input.medium, 120),
    campaign: cleanString(input.campaign, 200)
  };
}
