import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeEvent } from "./events.js";
import { createFileEventStore, createMongoEventStore } from "./event-store.js";
import { createTrackingLinks, trackingSlug } from "./tracking-links.js";
import { createFileCampaignLinkStore, createMongoCampaignLinkStore } from "./campaign-link-store.js";
import { createOpenAICampaignSelector, createRulesCampaignSelector, generatePathSealDrafts } from "./campaign-drafts.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultEventFile = resolve(moduleDirectory, "../data/events.jsonl");
const defaultStaticDirectory = resolve(moduleDirectory, "../dist");
const defaultCampaignLinkFile = resolve(moduleDirectory, "../data/campaign-links.jsonl");

function send(response, status, body, origin = "") {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {})
  });
  response.end(JSON.stringify(body));
}


function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".ico", "image/x-icon"]
]);

async function sendStatic(response, url, staticDirectory) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const staticRoot = resolve(staticDirectory);
  const filePath = resolve(staticRoot, relativePath);
  const containedPath = relative(staticRoot, filePath);
  if (isAbsolute(containedPath) || containedPath === ".." || containedPath.startsWith(`..${sep}`)) return false;
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypes.get(extname(filePath)) || "application/octet-stream" });
    response.end(body);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(request, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new RangeError("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createSignalDriftServer({
  ingestKey = process.env.SIGNALDRIFT_INGEST_KEY,
  eventFile = process.env.SIGNALDRIFT_EVENT_FILE || defaultEventFile,
  allowedOrigin = process.env.SIGNALDRIFT_ALLOWED_ORIGIN || "",
  mongoUri = process.env.MONGO_URL || process.env.MONGODB_URI,
  databaseName = process.env.SIGNALDRIFT_DB_NAME || "signaldrift",
  staticDirectory = process.env.SIGNALDRIFT_STATIC_DIR || defaultStaticDirectory,
  trackingLinks = createTrackingLinks({
    configuration: process.env.SIGNALDRIFT_TRACKING_LINKS,
    approvedHosts: process.env.SIGNALDRIFT_REDIRECT_HOSTS
  }),
  campaignLinkStore = mongoUri
    ? createMongoCampaignLinkStore({ uri: mongoUri, databaseName })
    : createFileCampaignLinkStore(process.env.SIGNALDRIFT_CAMPAIGN_LINK_FILE || defaultCampaignLinkFile),
  generatorMode = process.env.SIGNALDRIFT_GENERATOR_MODE || "rules",
  campaignSelector = generatorMode === "rules"
    ? createRulesCampaignSelector()
    : generatorMode === "openai" && process.env.OPENAI_API_KEY
      ? createOpenAICampaignSelector({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-5-mini" })
      : null,
  publicBaseUrl = process.env.SIGNALDRIFT_PUBLIC_URL || "",
  eventStore = mongoUri
    ? createMongoEventStore({ uri: mongoUri, databaseName })
    : createFileEventStore(eventFile)
} = {}) {
  return createServer(async (request, response) => {
    const origin = request.headers.origin === allowedOrigin ? allowedOrigin : "";

    if (request.method === "OPTIONS" && request.url === "/api/events") {
      response.writeHead(204, {
        ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "POST, OPTIONS"
      });
      return response.end();
    }

    if (request.method === "GET" && request.url === "/health") {
      return send(response, 200, { status: "ok", service: "signaldrift-ingestion" }, origin);
    }

    if (request.method === "GET") {
      const requestUrl = new URL(request.url, "http://localhost");
      const slug = trackingSlug(requestUrl.pathname);
      if (slug) {
        const configuredLink = trackingLinks.get(slug);
        const link = configuredLink || await campaignLinkStore.get(slug);
        if (!link) return send(response, 404, { error: "Tracking link not found" }, origin);
        if (!configuredLink && link.status !== "approved") return send(response, 404, { error: "Tracking link not found" }, origin);
        try {
          const event = normalizeEvent({
            product: link.product,
            type: "campaign_click",
            source: link.source,
            medium: link.medium,
            campaign: link.campaign
          });
          await eventStore.save(event);
          response.writeHead(302, {
            location: link.destination,
            "cache-control": "no-store",
            "referrer-policy": "no-referrer"
          });
          return response.end();
        } catch (error) {
          console.error("SignalDrift campaign click failed", error);
          return send(response, 503, { error: "Tracking link is temporarily unavailable" }, origin);
        }
      }
    }

    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (request.method === "POST" && request.url === "/api/campaign-drafts") {
      if (!tokenMatches(token, ingestKey)) return send(response, 401, { error: "Unauthorized" }, origin);
      if (!campaignSelector) return send(response, 503, { error: "Campaign generation is not configured" }, origin);
      try {
        const drafts = await generatePathSealDrafts({
          objective: (await readJson(request, 16 * 1024)).objective,
          selector: campaignSelector,
          linkStore: campaignLinkStore,
          publicBaseUrl,
          generationMode: generatorMode
        });
        return send(response, 201, drafts, origin);
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof TypeError) return send(response, 400, { error: error.message }, origin);
        console.error("SignalDrift campaign generation failed", error);
        return send(response, 502, { error: "Campaign draft could not be generated" }, origin);
      }
    }

    const approvalMatch = request.method === "POST" && request.url.match(/^\/api\/campaign-drafts\/([^/]+)\/approve$/);
    if (approvalMatch) {
      if (!tokenMatches(token, ingestKey)) return send(response, 401, { error: "Unauthorized" }, origin);
      let campaignId;
      try {
        campaignId = decodeURIComponent(approvalMatch[1]);
      } catch {
        return send(response, 400, { error: "campaign ID is malformed" }, origin);
      }
      if (!/^pathseal-[a-z0-9-]{1,100}$/.test(campaignId)) return send(response, 400, { error: "campaign ID is malformed" }, origin);
      try {
        const activated = await campaignLinkStore.approveCampaign(campaignId);
        if (activated !== 2) return send(response, 409, { error: "Campaign is missing drafts or was already approved" }, origin);
        return send(response, 200, {
          approved: true,
          campaignId,
          trackingLinksActivated: activated,
          publishingPerformed: false
        }, origin);
      } catch (error) {
        console.error("SignalDrift campaign approval failed", error);
        return send(response, 500, { error: "Campaign could not be approved" }, origin);
      }
    }

    if (request.method === "GET" && request.url === "/api/events") {
      if (!tokenMatches(token, ingestKey)) return send(response, 401, { error: "Unauthorized" }, origin);
      try {
        return send(response, 200, { events: await eventStore.list() }, origin);
      } catch (error) {
        console.error("SignalDrift event read failed", error);
        return send(response, 500, { error: "Events could not be loaded" }, origin);
      }
    }

    if (request.method === "GET" && !request.url.startsWith("/api/")) {
      if (await sendStatic(response, request.url, staticDirectory)) return;
      return send(response, 404, { error: "Not found" }, origin);
    }

    if (request.method !== "POST" || request.url !== "/api/events") {
      return send(response, 404, { error: "Not found" }, origin);
    }

    if (!tokenMatches(token, ingestKey)) {
      return send(response, 401, { error: "Unauthorized" }, origin);
    }

    try {
      const event = normalizeEvent(await readJson(request));
      await eventStore.save(event);
      return send(response, 202, { accepted: true, eventId: event.id }, origin);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) {
        return send(response, 400, { error: error.message }, origin);
      }
      if (error instanceof RangeError) return send(response, 413, { error: error.message }, origin);
      console.error("SignalDrift ingestion failed", error);
      return send(response, 500, { error: "Event could not be stored" }, origin);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.SIGNALDRIFT_INGEST_KEY) {
    console.error("SIGNALDRIFT_INGEST_KEY is required");
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8787);
  createSignalDriftServer().listen(port, () => console.log(`SignalDrift ingestion listening on ${port}`));
}
