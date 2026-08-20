const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseApprovedHosts(value) {
  return new Set(String(value || "")
    .split(",")
    .map(host => host.trim().toLowerCase())
    .filter(Boolean));
}

function normalizeDestination(value, approvedHosts) {
  let destination;
  try {
    destination = new URL(value);
  } catch {
    throw new TypeError("tracking-link destination must be a valid URL");
  }
  if (destination.protocol !== "https:") {
    throw new TypeError("tracking-link destination must use HTTPS");
  }
  if (!approvedHosts.has(destination.hostname.toLowerCase())) {
    throw new TypeError(`tracking-link destination host is not approved: ${destination.hostname}`);
  }
  destination.username = "";
  destination.password = "";
  destination.hash = "";
  return destination.toString();
}

export function createTrackingLinks({ configuration = "", approvedHosts = "" } = {}) {
  if (!configuration) return new Map();

  let input;
  try {
    input = JSON.parse(configuration);
  } catch {
    throw new TypeError("SIGNALDRIFT_TRACKING_LINKS must be valid JSON");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("SIGNALDRIFT_TRACKING_LINKS must be a JSON object");
  }

  const allowed = parseApprovedHosts(approvedHosts);
  if (allowed.size === 0) {
    throw new TypeError("SIGNALDRIFT_REDIRECT_HOSTS is required when tracking links are configured");
  }

  return new Map(Object.entries(input).map(([slug, link]) => {
    if (!slugPattern.test(slug)) throw new TypeError(`invalid tracking-link slug: ${slug}`);
    if (!link || typeof link !== "object" || Array.isArray(link)) {
      throw new TypeError(`tracking link ${slug} must be an object`);
    }

    const product = cleanString(link.product, 80);
    const campaign = cleanString(link.campaign, 200);
    if (!product) throw new TypeError(`tracking link ${slug} requires product`);
    if (!campaign) throw new TypeError(`tracking link ${slug} requires campaign`);

    return [slug, {
      destination: normalizeDestination(link.destination, allowed),
      product,
      campaign,
      source: cleanString(link.source, 120) || "direct",
      medium: cleanString(link.medium, 120)
    }];
  }));
}

export function trackingSlug(pathname) {
  const match = pathname.match(/^\/go\/([^/]+)$/);
  if (!match) return "";
  try {
    const slug = decodeURIComponent(match[1]);
    return slugPattern.test(slug) ? slug : "";
  } catch {
    return "";
  }
}

