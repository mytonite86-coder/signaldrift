import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSignalDriftServer } from "../server/server.js";

test("Campaign 01 review UI preserves the human-review and no-publishing boundary", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /Campaign 01 review/);
  assert.match(html, /Nothing publishes here/);
  assert.match(html, /I reviewed both drafts/);
  assert.match(html, /id="campaign-access-key" type="password"/);
  assert.match(html, /Never saved to browser storage/);
  assert.match(html, /id="approve-campaign"[^>]*disabled/);
  assert.match(app, /pending human review/i);
  assert.match(app, /publishing|Nothing was published/);
  assert.doesNotMatch(app, /facebook\.com|linkedin\.com|publishPost|schedulePost/);
  assert.doesNotMatch(app, /localStorage.*campaign-access-key|saveState.*campaign-access-key/);
});

test("static assets are served from a contained Windows-compatible path", async t => {
  const directory = await mkdtemp(join(tmpdir(), "signaldrift-static-"));
  await writeFile(join(directory, "index.html"), "<h1>SignalDrift</h1>", "utf8");
  await writeFile(join(directory, "app.js"), "window.signalDriftLoaded = true;", "utf8");
  const server = createSignalDriftServer({
    ingestKey: "test-secret",
    staticDirectory: directory,
    eventStore: { save: async () => {}, list: async () => [] },
    campaignLinkStore: { create: async () => {}, get: async () => null, approveCampaign: async () => 0 },
    publicBaseUrl: "https://signaldrift.example"
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
});
