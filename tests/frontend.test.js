import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Extract module-level helper functions from frontend.js for testing.
// We read the source, pull out the function declarations we want, and
// evaluate them in a sandbox with the needed dependencies.
const source = fs.readFileSync("src/frontend.js", "utf8");

// Collect the function declarations we want to test (module-level only).
const wanted = [
  "normalizeId",
  "escapeHtml",
  "escapeAttribute",
  "compactNumber",
  "scorePresentation",
  "readableDate",
  "compactDateBadge",
  "relativeTime",
  "normalizeCatalogSort",
  "catalogSortOption",
  "catalogSortBadge",
  "activeFilterCount",
  "sanitizeFilters",
  "characterCreator",
  "characterCreatorRef",
  "characterStats",
  "characterTags",
  "extensionForImageType",
  "publicRequestErrorMessage",
  "publicErrorMessage",
];

const fnSources = [];
for (const name of wanted) {
  const re = new RegExp(`^function ${name}\\([\\s\\S]*?\\n\\}`, "m");
  const match = source.match(re);
  if (match) fnSources.push(match[0]);
}

// Also grab the constants these functions depend on.
const constSources = [];
for (const name of ["CATALOG_SORT_OPTIONS", "PROD_ORIGIN"]) {
  const re = new RegExp(`^const ${name} = [\\s\\S]*?;`, "m");
  const match = source.match(re);
  if (match) constSources.push(match[0]);
}

const sandboxSrc = [
  ...constSources,
  ...fnSources,
  `export { ${wanted.join(", ")} };`,
].join("\n");

fs.writeFileSync("src/frontend_helpers_test_tmp.mjs", sandboxSrc);
const helpers = await import("../src/frontend_helpers_test_tmp.mjs");

test("normalizeId lowercases and trims", () => {
  assert.equal(helpers.normalizeId("  ABC-123 "), "abc-123");
  assert.equal(helpers.normalizeId(null), "");
  assert.equal(helpers.normalizeId(""), "");
});

test("escapeHtml escapes special characters", () => {
  assert.equal(
    helpers.escapeHtml("<script>alert('x')</script>"),
    "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
  );
});

test("escapeAttribute escapes quotes and angle brackets", () => {
  assert.equal(
    helpers.escapeAttribute(`" onerror="alert(1)`),
    "&quot; onerror=&quot;alert(1)",
  );
});

test("compactNumber formats large numbers", () => {
  assert.equal(helpers.compactNumber(1500), "1.5k");
  assert.equal(helpers.compactNumber(2_500_000), "2.5m");
  assert.equal(helpers.compactNumber(999), "999");
});

test("scorePresentation maps numeric scores to tiers", () => {
  const high = helpers.scorePresentation(95);
  assert.ok(high.tier);
  assert.ok(high.label);
  const low = helpers.scorePresentation(10);
  assert.ok(low.tier);
});

test("readableDate formats ISO dates", () => {
  const result = helpers.readableDate("2025-01-15T10:00:00Z");
  assert.ok(typeof result === "string");
  assert.ok(result.length > 0);
});

test("compactDateBadge returns a short badge", () => {
  const badge = helpers.compactDateBadge("2025-01-15T10:00:00Z");
  assert.ok(typeof badge === "string");
});

test("relativeTime produces human-readable deltas", () => {
  const now = Date.parse("2025-06-15T00:00:00Z");
  const yesterday = Date.parse("2025-06-14T00:00:00Z");
  const result = helpers.relativeTime(new Date(yesterday).toISOString(), now);
  assert.ok(result.length > 0);
});

test("normalizeCatalogSort falls back for unknown values", () => {
  assert.equal(
    helpers.normalizeCatalogSort("first_published"),
    "first_published",
  );
  assert.equal(
    helpers.normalizeCatalogSort("nonsense"),
    "fresh_feed",
  );
});

test("catalogSortOption returns an option object for known sorts", () => {
  const result = helpers.catalogSortOption("score");
  assert.equal(result.label, "Highly Rated");
  assert.equal(result.value, "score");
  const fallback = helpers.catalogSortOption("unknown");
  assert.equal(fallback.value, "fresh_feed");
});

test("catalogSortBadge returns a display string", () => {
  assert.equal(helpers.catalogSortBadge("score"), "Rated");
});

test("activeFilterCount counts active filters", () => {
  // "0" is a truthy string, so all three numeric filters count as active.
  assert.equal(
    helpers.activeFilterCount({ minScore: "50", minTokens: "0", maxTokens: "0", hideImported: false, hideTags: [] }),
    3,
  );
  assert.equal(
    helpers.activeFilterCount({ minScore: "", minTokens: "", maxTokens: "", hideImported: false, hideTags: [] }),
    0,
  );
  assert.equal(
    helpers.activeFilterCount({ minScore: "", minTokens: "", maxTokens: "", hideImported: true, hideTags: ["x"] }),
    2,
  );
});

test("sanitizeFilters clamps and validates filter values", () => {
  const result = helpers.sanitizeFilters({
    minScore: "999",
    minTokens: "abc",
    maxTokens: "-5",
  });
  assert.ok(result.minScore <= 100);
  assert.ok(Number.isFinite(result.minTokens));
});

test("characterCreator extracts creator name", () => {
  assert.equal(
    helpers.characterCreator({ creator: { name: "Alice" } }),
    "Alice",
  );
  assert.equal(
    helpers.characterCreator({ creatorName: "Bob" }),
    "Bob",
  );
  assert.equal(helpers.characterCreator({}), "Unknown creator");
});

test("characterCreatorRef extracts creator ref", () => {
  assert.equal(
    helpers.characterCreatorRef({ creator: { ref: "Alice" } }),
    "alice",
  );
  assert.equal(
    helpers.characterCreatorRef({ creator: { id: "abc123" } }),
    "abc123",
  );
});

test("characterStats formats stats", () => {
  const stats = helpers.characterStats({
    stats: { chats: 1000, messages: 5000, messagesPerChat: 5 },
    totalTokens: 2000,
  });
  assert.ok(stats.chats);
  assert.ok(stats.messages);
  assert.equal(stats.messagesPerChat, 5);
  assert.ok(stats.tokens);
});

test("characterTags merges tags and customTags", () => {
  const tags = helpers.characterTags({
    tags: ["tag1", { name: "tag2" }],
    customTags: ["custom"],
  });
  assert.deepEqual(tags, ["tag1", "tag2", "custom"]);
});

test("extensionForImageType maps content types", () => {
  assert.equal(helpers.extensionForImageType("image/png"), "png");
  assert.equal(helpers.extensionForImageType("image/jpeg"), "jpg");
  assert.equal(helpers.extensionForImageType("image/gif"), "gif");
  assert.equal(helpers.extensionForImageType("image/avif"), "avif");
  assert.equal(helpers.extensionForImageType("image/webp"), "webp");
  assert.equal(helpers.extensionForImageType("text/plain"), "webp");
});

test("publicRequestErrorMessage maps known codes", () => {
  assert.equal(
    helpers.publicRequestErrorMessage("CLIENT_VERIFICATION_REQUIRED", 403),
    "Complete the Datacat security check to continue.",
  );
  assert.equal(
    helpers.publicRequestErrorMessage(null, 429),
    "Datacat is busy. Please try again shortly.",
  );
  assert.equal(
    helpers.publicRequestErrorMessage(null, 404),
    "That Datacat item is no longer available.",
  );
  assert.equal(
    helpers.publicRequestErrorMessage(null, 500, "Custom fallback"),
    "Custom fallback",
  );
});

test("publicErrorMessage delegates to publicRequestErrorMessage", () => {
  const err = { code: "CLIENT_VERIFICATION_REQUIRED", status: 403 };
  assert.equal(
    helpers.publicErrorMessage(err, "fallback"),
    "Complete the Datacat security check to continue.",
  );
});
