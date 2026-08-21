import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { MongoClient } from "mongodb";

function opaqueSlug() {
  return randomBytes(18).toString("hex");
}

function recordFor(input) {
  return { id: opaqueSlug(), createdAt: new Date().toISOString(), ...input };
}

export function createFileCampaignLinkStore(filePath) {
  return {
    async create(input) {
      const record = recordFor(input);
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
      return record;
    },
    async get(id) {
      try {
        const rows = (await readFile(filePath, "utf8")).trim().split("\n").filter(Boolean);
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          const record = JSON.parse(rows[index]);
          if (record.id === id) return record;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return null;
    },
    async approveCampaign(campaign) {
      let count = 0;
      let rows = [];
      try {
        rows = (await readFile(filePath, "utf8")).trim().split("\n").filter(Boolean).map(row => JSON.parse(row));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const latest = new Map(rows.map(record => [record.id, record]));
      await mkdir(dirname(filePath), { recursive: true });
      const candidates = [...latest.values()].filter(record => record.campaign === campaign && record.status === "pending_review");
      if (candidates.length !== 2) return 0;
      for (const record of candidates) {
        await appendFile(filePath, `${JSON.stringify({ ...record, status: "approved", approvedAt: new Date().toISOString() })}\n`, { encoding: "utf8", mode: 0o600 });
        count += 1;
      }
      return count;
    }
  };
}

export function createMongoCampaignLinkStore({ uri, databaseName = "signaldrift", client = new MongoClient(uri) }) {
  const collection = client.db(databaseName).collection("campaign_links");
  return {
    async create(input) {
      const record = recordFor(input);
      await collection.insertOne(record);
      return record;
    },
    async get(id) {
      return collection.findOne({ id });
    },
    async approveCampaign(campaign) {
      const pending = { campaign, status: "pending_review" };
      if (await collection.countDocuments(pending) !== 2) return 0;
      const approvalId = randomBytes(12).toString("hex");
      const result = await collection.updateMany(
        pending,
        { $set: { status: "approved", approvedAt: new Date().toISOString(), approvalId } }
      );
      if (result.modifiedCount !== 2) {
        await collection.updateMany(
          { campaign, approvalId },
          { $set: { status: "pending_review" }, $unset: { approvedAt: "", approvalId: "" } }
        );
        return 0;
      }
      return result.modifiedCount;
    }
  };
}
