import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { MongoClient } from "mongodb";

export function createFileEventStore(eventFile) {
  return {
    async save(event) {
      await mkdir(dirname(eventFile), { recursive: true });
      await appendFile(eventFile, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
    },
    async list() {
      try {
        const { readFile } = await import("node:fs/promises");
        const contents = await readFile(eventFile, "utf8");
        return contents.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    }
  };
}

export function createMongoEventStore({
  uri,
  databaseName = "signaldrift",
  collectionName = "events",
  client = new MongoClient(uri)
}) {
  if (!uri) throw new TypeError("MongoDB URI is required");

  let collection;
  return {
    async save(event) {
      collection ||= client.db(databaseName).collection(collectionName);
      await collection.insertOne(event);
    },
    async list(limit = 1000) {
      collection ||= client.db(databaseName).collection(collectionName);
      return collection.find({}, { projection: { _id: 0 } })
        .sort({ occurredAt: -1 }).limit(limit).toArray();
    },
    async close() {
      await client.close();
    }
  };
}
