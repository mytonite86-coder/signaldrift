import { pathSealProfile } from "./product-profiles/pathseal.js";

const channels = ["facebook", "linkedin"];

export const pathSealSelectionSchema = {
  type: "object",
  additionalProperties: false,
  required: channels,
  properties: Object.fromEntries(channels.map(channel => [channel, {
    type: "object",
    additionalProperties: false,
    required: ["angle_id", "claim_ids", "cta_id", "image_brief"],
    properties: {
      angle_id: { type: "string", enum: Object.keys(pathSealProfile.angles) },
      claim_ids: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: Object.keys(pathSealProfile.claims) } },
      cta_id: { type: "string", enum: Object.keys(pathSealProfile.ctas) },
      image_brief: { type: "string", minLength: 10, maxLength: 240 }
    }
  }]))
};

function textFromResponse(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  throw new TypeError("Model response did not contain structured output");
}

export function createOpenAICampaignSelector({ apiKey, model = "gpt-5-mini", fetchImpl = fetch }) {
  if (!apiKey) throw new TypeError("OPENAI_API_KEY is required for campaign generation");
  return async ({ objective, profile = pathSealProfile }) => {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: "Select only the supplied IDs. Do not invent features, prices, destinations, identities, or claims. Image briefs are suggestions and must depict only the supplied product facts. Return both channels.",
        input: JSON.stringify({ objective, profile }),
        text: { format: { type: "json_schema", name: "pathseal_campaign_selection", strict: true, schema: pathSealSelectionSchema } }
      })
    });
    if (!response.ok) throw new Error(`OpenAI generation failed with status ${response.status}`);
    return JSON.parse(textFromResponse(await response.json()));
  };
}

function selected(map, id, label) {
  if (!Object.hasOwn(map, id)) throw new TypeError(`${label} is not approved`);
  return map[id];
}

export function validateSelection(selection, profile = pathSealProfile) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new TypeError("Generated selection must be an object");
  for (const channel of channels) {
    const variant = selection[channel];
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) throw new TypeError(`${channel} selection is required`);
    selected(profile.angles, variant.angle_id, `${channel} angle`);
    selected(profile.ctas, variant.cta_id, `${channel} CTA`);
    if (!Array.isArray(variant.claim_ids) || variant.claim_ids.length < 1 || variant.claim_ids.length > 3) throw new TypeError(`${channel} requires one to three approved claims`);
    if (new Set(variant.claim_ids).size !== variant.claim_ids.length) throw new TypeError(`${channel} claim IDs must be unique`);
    variant.claim_ids.forEach(id => selected(profile.claims, id, `${channel} claim`));
    if (typeof variant.image_brief !== "string" || variant.image_brief.trim().length < 10 || variant.image_brief.length > 240) throw new TypeError(`${channel} image brief is malformed`);
    const normalizedBrief = variant.image_brief.toLowerCase();
    if (profile.forbiddenPhrases.some(phrase => normalizedBrief.includes(phrase))) throw new TypeError(`${channel} image brief contains an unsupported claim`);
  }
  return selection;
}

function destinationFor(profile, channel, campaignId) {
  const destination = new URL(profile.destination);
  destination.searchParams.set("utm_source", channel);
  destination.searchParams.set("utm_medium", "social");
  destination.searchParams.set("utm_campaign", campaignId);
  return destination.toString();
}

function compose(profile, variant, trackingUrl, channel) {
  const claims = variant.claim_ids.map(id => profile.claims[id]).join(" ");
  const identity = `${profile.productName} is the promoted product in the ${profile.productFamily} family, produced by ${profile.producer}. ${profile.campaignCredit}`;
  const price = channel === "linkedin" ? ` ${profile.accessFact}` : "";
  return `${profile.angles[variant.angle_id]} ${claims} ${identity}${price}\n\n${profile.ctas[variant.cta_id]}: ${trackingUrl}`;
}

export async function generatePathSealDrafts({ objective, selector, linkStore, publicBaseUrl, campaignId = `pathseal-${Date.now()}`, profile = pathSealProfile }) {
  if (typeof objective !== "string" || objective.trim().length < 10 || objective.length > 500) throw new TypeError("objective must be between 10 and 500 characters");
  if (!/^https:\/\//.test(publicBaseUrl || "")) throw new TypeError("SIGNALDRIFT_PUBLIC_URL must be an HTTPS URL");
  const selection = validateSelection(await selector({ objective: objective.trim(), profile }), profile);
  const variants = {};
  for (const channel of channels) {
    const record = await linkStore.create({
      product: profile.id,
      channel,
      campaign: campaignId,
      source: channel,
      medium: "social",
      destination: destinationFor(profile, channel, campaignId)
    });
    const trackingUrl = `${publicBaseUrl.replace(/\/$/, "")}/go/${record.id}`;
    variants[channel] = {
      channel,
      copy: compose(profile, selection[channel], trackingUrl, channel),
      imageBrief: selection[channel].image_brief.trim(),
      approvedClaimIds: selection[channel].claim_ids,
      trackingUrl,
      status: "draft",
      humanReviewRequired: true,
      publishableByThisEndpoint: false
    };
  }
  return { campaignId, productProfileId: profile.id, variants };
}
