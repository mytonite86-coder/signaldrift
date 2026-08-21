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
    }
  };
}
