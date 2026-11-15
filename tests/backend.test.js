import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The backend module requires globalThis.spindle; we set it up before importing.
const enclaveStore = new Map();
const characters = [];
const eventHandlers = {};

const enclave = {
  async get(key, userId) {
    return (enclaveStore.get(userId) || {})[key] ?? null;
  },
  async put(key, value, userId) {
    const u = enclaveStore.get(userId) || {};
    u[key] = value;
    enclaveStore.set(userId, u);
    return value;
  },
  async has(key, userId) {
    return key in (enclaveStore.get(userId) || {});
  },
  async delete(key, userId) {
    const u = enclaveStore.get(userId) || {};
    delete u[key];
    enclaveStore.set(userId, u);
  },
};

const api = {
  enclave,
  characters: {
    async list({ limit, offset }) {
      return {
        data: characters.slice(offset, offset + limit),
        total: characters.length,
      };
    },
  },
  on(event, handler) {
    (eventHandlers[event] ||= []).push(handler);
  },
  onFrontendMessage() {},
  sendToFrontend() {},
  toast: {},
};

globalThis.spindle = api;

// Import the module with extra exports for testing.
const src = fs.readFileSync("src/backend.js", "utf8");
const testSrc = src + "\nexport { getInstallationId, markLibraryDirty, cacheByUser };\n";
fs.writeFileSync("src/backend_test_tmp.mjs", testSrc);
const internals = await import("../src/backend_test_tmp.mjs");

function reset() {
  enclaveStore.clear();
  characters.length = 0;
  internals.cacheByUser.clear();
}

test("concurrent first-use installation IDs are deduplicated", async () => {
  reset();
  const ids = await Promise.all(
    Array.from({ length: 10 }, () => internals.getInstallationId("user-1")),
  );
  const unique = new Set(ids);
  assert.equal(unique.size, 1, "all concurrent calls should return one ID");
  assert.match(ids[0], /^lumiverse-[0-9a-f-]{36}$/);
});

test("installation ID is stable on subsequent calls", async () => {
  reset();
  const first = await internals.getInstallationId("user-2");
  const second = await internals.getInstallationId("user-2");
  assert.equal(first, second);
});

test("clean scan result is not dirty", async () => {
  reset();
  characters.push({
    id: "lumi-1",
    name: "Test",
    extensions: {
      datacat: { datacatCharacterId: "11111111-1111-4111-8111-111111111111" },
    },
  });
  const result = await internals.getLinks("user-3", true);
  assert.equal(result.dirty, false);
  assert.equal(result.total, 1);
});

test("event during scan marks result dirty", async () => {
  reset();
  characters.push({
    id: "lumi-1",
    name: "Test",
    extensions: {
      datacat: { datacatCharacterId: "11111111-1111-4111-8111-111111111111" },
    },
  });
  const scanPromise = internals.getLinks("user-4", true);
  // Fire event while scan is in-flight
  await new Promise((r) => setTimeout(r, 0));
  for (const handler of eventHandlers["CHARACTER_CREATED"] || []) {
    handler({ id: "lumi-2" });
  }
  const result = await scanPromise;
  assert.equal(result.dirty, true);
});

test("cached result is dirtied by a later event", async () => {
  reset();
  characters.push({
    id: "lumi-1",
    name: "Test",
    extensions: {
      datacat: { datacatCharacterId: "11111111-1111-4111-8111-111111111111" },
    },
  });
  await internals.getLinks("user-5", false);
  const cached = internals.cacheByUser.get("user-5");
  assert.equal(cached.dirty, false);
  for (const handler of eventHandlers["CHARACTER_DELETED"] || []) {
    handler({ id: "lumi-1" });
  }
  assert.equal(cached.dirty, true);
});

test("after event, next getLinks rescans and returns clean data", async () => {
  reset();
  characters.push({
    id: "lumi-1",
    name: "Test",
    extensions: {
      datacat: { datacatCharacterId: "11111111-1111-4111-8111-111111111111" },
    },
  });
  await internals.getLinks("user-6", false);
  for (const handler of eventHandlers["CHARACTER_DELETED"] || []) {
    handler({ id: "lumi-1" });
  }
  const result = await internals.getLinks("user-6", false);
  assert.equal(result.dirty, false);
});
