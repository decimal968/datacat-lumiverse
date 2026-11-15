import { test } from "node:test";
import assert from "node:assert/strict";
import { uuidv7 } from "../src/uuidv7.js";

test("uuidv7 returns a valid UUID string", () => {
  const id = uuidv7();
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("uuidv7 produces unique values", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
  assert.equal(ids.size, 1000);
});

test("uuidv7 timestamps are monotonically increasing", () => {
  const a = uuidv7();
  const b = uuidv7();
  // The first 12 hex chars encode the timestamp; b should be >= a.
  const tsA = parseInt(a.slice(0, 12), 16);
  const tsB = parseInt(b.slice(0, 12), 16);
  assert.ok(tsB >= tsA, "later UUIDs should have greater or equal timestamps");
});
