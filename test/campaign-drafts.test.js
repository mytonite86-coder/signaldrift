import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRulesCampaignSelector, generatePathSealDrafts, validateSelection } from "../server/campaign-drafts.js";
import { createFileCampaignLinkStore } from "../server/campaign-link-store.js";
import { createSignalDriftServer } from "../server/server.js";

const controlledSelection = {
  facebook: { angle_id: "review_first", claim_ids: ["scans_open_paths", "user_approved_repairs"], cta_id: "try", image_brief: "An SVG contour with one visible gap highlighted for review before closure." },
  linkedin: { angle_id: "preserve_intent", claim_ids: ["shows_questionable_gaps", "local_svg_processing"], cta_id: "open", image_brief: "A professional SVG review screen showing a questionable contour gap and approval control." }
};

test("controlled Path Seal profile composes distinct claims-controlled channel drafts", async () => {
  const records = [];
  const result = await generatePathSealDrafts({
    objective: "Introduce review-first SVG contour repair to CNC makers.",
    selector: async () => controlledSelection,
    linkStore: { create: async input => { const record = { id: `opaque-${records.length + 1}`, ...input }; records.push(record); return record; } },
    publicBaseUrl: "https://signaldrift.example",
    campaignId: "pathseal-proof-01"
  });

  for (const variant of Object.values(result.variants)) {
    assert.match(variant.copy, /Path Seal is the promoted product in the SVG Micro Eco family/);
    assert.match(variant.copy, /produced by Skald and Kreepy Productions/);
    assert.match(variant.copy, /Campaign operated by Signal Drift/);
    assert.match(variant.copy, /(?:Try|Open) Path Seal: https:\/\/signaldrift\.example\/go\/opaque-/);
    assert.equal(variant.status, "pending_review");
    assert.equal(variant.humanReviewRequired, true);
    assert.equal(variant.publishableByThisEndpoint, false);
  }
  assert.match(result.variants.linkedin.copy, /\$9\.99 per month/);
  assert.equal(records.every(record => !JSON.stringify(record).match(/email|userId|customer/i)), true);
  assert.equal(records.every(record => record.status === "pending_review"), true);
  assert.equal(new URL(records[0].destination).searchParams.get("utm_campaign"), "pathseal-proof-01");
  assert.equal(result.generationMode, "rules");
  assert.equal(result.aiGenerated, false);
});

test("no-cost rules selector responds to the objective without network access", async () => {
  const selector = createRulesCampaignSelector();
  const cnc = await selector({ objective: "Reach CNC fabricators preparing SVG contours." });
  const review = await selector({ objective: "Help users review and approve questionable gaps." });
  assert.equal(cnc.facebook.angle_id, "cnc_preparation");
  assert.equal(review.facebook.angle_id, "review_first");
  assert.notEqual(review.facebook.cta_id, review.linkedin.cta_id);
  assert.doesNotThrow(() => validateSelection(review));
});

test("controlled profile rejects a confused product claim that an unconstrained prompt could invent", () => {
  const confused = structuredClone(controlledSelection);
  confused.facebook.claim_ids = ["automatically_repairs_every_svg_error"];
  assert.throws(() => validateSelection(confused), /claim is not approved/);
});

test("malformed or unsupported structured model output is rejected", () => {
  assert.throws(() => validateSelection({ facebook: controlledSelection.facebook }), /linkedin selection is required/);
  const unsupported = structuredClone(controlledSelection);
  unsupported.linkedin.image_brief = "Guaranteed to outperform every competing SVG tool.";
  assert.throws(() => validateSelection(unsupported), /unsupported claim/);
});

test("draft API is operator-authenticated and can only return non-publishable drafts", async t => {
  const links = new Map();
  const campaignLinkStore = {
    create: async input => {
      const record = { id: `opaque${links.size + 1}`, ...input };
      links.set(record.id, record);
      return record;
    },
    get: async id => links.get(id) || null
  };
  const server = createSignalDriftServer({
    ingestKey: "operator-secret",
    eventStore: { save: async () => {}, list: async () => [] },
    campaignLinkStore,
    campaignSelector: async () => controlledSelection,
    publicBaseUrl: "https://signaldrift.example"
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/campaign-drafts`;

  assert.equal((await fetch(endpoint, { method: "POST", body: "{}" })).status, 401);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer operator-secret", "content-type": "application/json" },
    body: JSON.stringify({ objective: "Create a review-first Path Seal awareness draft." })
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.variants.facebook.publishableByThisEndpoint, false);
  assert.equal(payload.variants.linkedin.humanReviewRequired, true);
  assert.equal(payload.aiGenerated, false);
  assert.equal(links.size, 2);
});

test("server defaults to rules mode even when an OpenAI key exists", async t => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "not-called";
  t.after(() => previous === undefined ? delete process.env.OPENAI_API_KEY : process.env.OPENAI_API_KEY = previous);
  const links = [];
  const server = createSignalDriftServer({
    ingestKey: "operator-secret",
    eventStore: { save: async () => {}, list: async () => [] },
    campaignLinkStore: { create: async input => { const record = { id: `rules${links.length + 1}`, ...input }; links.push(record); return record; }, get: async () => null },
    publicBaseUrl: "https://signaldrift.example"
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/campaign-drafts`, {
    method: "POST",
    headers: { authorization: "Bearer operator-secret", "content-type": "application/json" },
    body: JSON.stringify({ objective: "Reach CNC users with review-first SVG repair." })
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.generationMode, "rules");
  assert.equal(payload.aiGenerated, false);
  assert.equal(links.length, 2);
});

test("pending tracking links stay closed until authenticated human approval", async t => {
  const links = new Map();
  const events = [];
  const campaignLinkStore = {
    create: async input => {
      const record = { id: `pending${links.size + 1}`, ...input };
      links.set(record.id, record);
      return record;
    },
    get: async id => links.get(id) || null,
    approveCampaign: async campaign => {
      let count = 0;
      for (const [id, record] of links) {
        if (record.campaign === campaign && record.status === "pending_review") {
          links.set(id, { ...record, status: "approved" });
          count += 1;
        }
      }
      return count;
    }
  };
  const server = createSignalDriftServer({
    ingestKey: "operator-secret",
    eventStore: { save: async event => events.push(event), list: async () => events },
    campaignLinkStore,
    campaignSelector: async () => controlledSelection,
    publicBaseUrl: "https://signaldrift.example"
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const draftResponse = await fetch(`${base}/api/campaign-drafts`, {
    method: "POST",
    headers: { authorization: "Bearer operator-secret", "content-type": "application/json" },
    body: JSON.stringify({ objective: "Review Campaign 01 Path Seal drafts before tracking activation." })
  });
  const drafts = await draftResponse.json();
  const pendingSlug = new URL(drafts.variants.facebook.trackingUrl).pathname.split("/").pop();
  assert.equal((await fetch(`${base}/go/${pendingSlug}`, { redirect: "manual" })).status, 404);
  assert.equal(events.length, 0);

  const denied = await fetch(`${base}/api/campaign-drafts/${drafts.campaignId}/approve`, { method: "POST" });
  assert.equal(denied.status, 401);
  const approved = await fetch(`${base}/api/campaign-drafts/${drafts.campaignId}/approve`, {
    method: "POST",
    headers: { authorization: "Bearer operator-secret", "content-type": "application/json" },
    body: "{}"
  });
  assert.deepEqual(await approved.json(), {
    approved: true,
    campaignId: drafts.campaignId,
    trackingLinksActivated: 2,
    publishingPerformed: false
  });
  assert.equal((await fetch(`${base}/go/${pendingSlug}`, { redirect: "manual" })).status, 302);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "campaign_click");
});

test("file-backed opaque links persist the pending-to-approved transition", async () => {
  const directory = await mkdtemp(join(tmpdir(), "signaldrift-campaign-links-"));
  const store = createFileCampaignLinkStore(join(directory, "campaign-links.jsonl"));
  const first = await store.create({ campaign: "pathseal-campaign-01", channel: "facebook", status: "pending_review", destination: "https://pathseal.example/" });
  const second = await store.create({ campaign: "pathseal-campaign-01", channel: "linkedin", status: "pending_review", destination: "https://pathseal.example/" });
  assert.notEqual(first.id, second.id);
  assert.equal((await store.get(first.id)).status, "pending_review");
  assert.equal(await store.approveCampaign("pathseal-campaign-01"), 2);
  assert.equal((await store.get(first.id)).status, "approved");
  assert.equal((await store.get(second.id)).status, "approved");
  assert.equal(await store.approveCampaign("pathseal-campaign-01"), 0);

  await store.create({ campaign: "pathseal-incomplete", channel: "facebook", status: "pending_review", destination: "https://pathseal.example/" });
  assert.equal(await store.approveCampaign("pathseal-incomplete"), 0);
});
