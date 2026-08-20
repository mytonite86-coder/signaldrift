import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalPathSealEventTypes, normalizeEvent } from "../server/events.js";
import { createMongoEventStore } from "../server/event-store.js";
import { createSignalDriftServer } from "../server/server.js";
import { createTrackingLinks } from "../server/tracking-links.js";

test("normalizes an attributed product event", () => {
  const event = normalizeEvent({ product: "pathseal", type: "upload", source: "linkedin" }, new Date("2026-08-05T12:00:00Z"));
  assert.equal(event.product, "pathseal");
  assert.equal(event.type, "upload");
  assert.equal(event.source, "linkedin");
  assert.equal(event.receivedAt, "2026-08-05T12:00:00.000Z");
});

test("MongoDB storage uses SignalDrift's isolated database and events collection", async () => {
  const inserted = [];
  const selected = {};
  const client = {
    db(name) {
      selected.database = name;
      return {
        collection(collectionName) {
          selected.collection = collectionName;
          return { insertOne: async event => inserted.push(event) };
        }
      };
    },
    close: async () => {}
  };
  const store = createMongoEventStore({ uri: "mongodb://unused", client });
  await store.save({ id: "event-1", product: "pathseal", type: "visit" });

  assert.deepEqual(selected, { database: "signaldrift", collection: "events" });
  assert.equal(inserted[0].id, "event-1");
});

test("rejects unsupported event types", () => {
  assert.throws(() => normalizeEvent({ product: "pathseal", type: "purchase-ish" }), /not supported/);
});

test("ingestion requires a bearer key and persists accepted events", async t => {
  const directory = await mkdtemp(join(tmpdir(), "signaldrift-test-"));
  const eventFile = join(directory, "events.jsonl");
  const server = createSignalDriftServer({ ingestKey: "test-secret", eventFile });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/events`;

  const denied = await fetch(endpoint, { method: "POST", body: "{}" });
  assert.equal(denied.status, 401);

  const accepted = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ product: "pathseal", type: "visit", visitorId: "visitor-1", source: "linkedin" })
  });
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).accepted, true);

  const stored = JSON.parse((await readFile(eventFile, "utf8")).trim());
  assert.equal(stored.visitorId, "visitor-1");
  assert.equal(stored.source, "linkedin");

  const live = await fetch(endpoint, { headers: { authorization: "Bearer test-secret" } });
  assert.equal(live.status, 200);
  const payload = await live.json();
  assert.equal(payload.events.length, 1);
  assert.equal(payload.events[0].visitorId, "visitor-1");
});


test("accepts the complete canonical PathSeal vocabulary", () => {
  for (const type of canonicalPathSealEventTypes) {
    const event = normalizeEvent({ product: "pathseal", type });
    assert.equal(event.type, type);
  }
});

test("owned tracking links record a campaign click before redirecting", async t => {
  const saved = [];
  const trackingLinks = createTrackingLinks({
    approvedHosts: "pathseal.example",
    configuration: JSON.stringify({
      "pathseal-linkedin-01": {
        destination: "https://pathseal.example/start?utm_source=linkedin",
        product: "pathseal",
        source: "linkedin",
        medium: "social",
        campaign: "campaign-01"
      }
    })
  });
  const eventStore = { save: async event => saved.push(event), list: async () => [] };
  const server = createSignalDriftServer({ ingestKey: "test-secret", eventStore, trackingLinks });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/go/pathseal-linkedin-01`, {
    redirect: "manual"
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://pathseal.example/start?utm_source=linkedin");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].type, "campaign_click");
  assert.equal(saved[0].campaign, "campaign-01");
  assert.equal(saved[0].source, "linkedin");
});

test("tracking links reject unapproved and insecure destinations", () => {
  const link = destination => JSON.stringify({
    campaign: { destination, product: "pathseal", campaign: "campaign-01" }
  });
  assert.throws(() => createTrackingLinks({
    approvedHosts: "pathseal.example",
    configuration: link("https://attacker.example/path")
  }), /not approved/);
  assert.throws(() => createTrackingLinks({
    approvedHosts: "pathseal.example",
    configuration: link("http://pathseal.example/path")
  }), /must use HTTPS/);
});

test("tracking links do not redirect when click storage fails", async t => {
  const trackingLinks = createTrackingLinks({
    approvedHosts: "pathseal.example",
    configuration: JSON.stringify({
      campaign: { destination: "https://pathseal.example/", product: "pathseal", campaign: "campaign-01" }
    })
  });
  const eventStore = { save: async () => { throw new Error("storage unavailable"); }, list: async () => [] };
  const server = createSignalDriftServer({ ingestKey: "test-secret", eventStore, trackingLinks });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/go/campaign`, { redirect: "manual" });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("location"), null);
});

