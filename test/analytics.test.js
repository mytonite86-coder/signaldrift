import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignUrl, groupBySource, summarize, toCsv } from "../src/analytics.js";

const events = [
  {type:"visit",source:"facebook",visitorId:"a"}, {type:"visit",source:"facebook",visitorId:"a"},
  {type:"upload",source:"facebook",visitorId:"a"}, {type:"subscription",source:"facebook",visitorId:"a"}
];

test("summarizes unique visitors and conversions", () => assert.deepEqual(summarize(events), {events:4,visitors:1,subscriptions:1,conversionRate:50}));
test("groups events by acquisition source", () => assert.deepEqual(groupBySource(events)[0], {source:"facebook",visits:2,uploads:1,subscriptions:1}));
test("builds a traceable campaign URL", () => { const url = new URL(buildCampaignUrl("https://example.com/tool", {source:"facebook",medium:"social",campaign:"launch",product:"pathseal"})); assert.equal(url.searchParams.get("utm_campaign"), "launch"); assert.equal(url.searchParams.get("sd_product"), "pathseal"); });
test("escapes CSV values", () => assert.match(toCsv([{source:'a,b',type:"visit"}]), /"a,b"/));
