import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "/tmp/lumiverse-audit/node_modules/jsdom/lib/api.js";
import {
  renderRichText,
  safeUrl,
  snippetText,
  collectGalleryImages,
} from "../src/richtext.js";

function eventAttributes(html) {
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const found = [];
  for (const el of dom.window.document.querySelectorAll("*")) {
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name)) found.push([el.tagName, attr.name, attr.value]);
    }
  }
  return found;
}

test("markdown image alt text cannot inject event handlers", () => {
  const source =
    '![<a href="https://a/onerror=window.pwned=1//">x</a>](https://img.example/not-found.png)';
  const { html } = renderRichText(source);
  const attrs = eventAttributes(html);
  assert.deepEqual(attrs, []);
});

test("markdown image alt with nested img tag cannot inject onerror", () => {
  const source =
    '![<img src="https://a/onerror=alert(1)">](https://img.example/b.png)';
  const { html } = renderRichText(source);
  const attrs = eventAttributes(html);
  assert.deepEqual(attrs, []);
});

test("plain markdown images render safely", () => {
  const { html, images } = renderRichText(
    "![simple](https://img.example/c.png)",
  );
  assert.match(html, /<img[^>]+src="https:\/\/img\.example\/c\.png"/);
  assert.equal(images.length, 1);
  assert.equal(images[0].url, "https://img.example/c.png");
  assert.equal(images[0].alt, "simple");
});

test("markdown image alt with markdown formatting is preserved as text", () => {
  const { html } = renderRichText(
    "![**bold** normal alt](https://img.example/a.png)",
  );
  const dom = new JSDOM(html);
  const img = dom.window.document.querySelector("img");
  assert.equal(img.getAttribute("alt"), "**bold** normal alt");
});

test("safeUrl blocks javascript and data protocols", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(safeUrl("vbscript:msgbox"), "");
  assert.equal(
    safeUrl("https://example.com/path"),
    "https://example.com/path",
  );
});

test("renderRichText strips script and style blocks", () => {
  const { html } = renderRichText(
    "<script>alert(1)</script><style>body{color:red}</style>Hello",
  );
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<style/i);
  assert.match(html, /Hello/);
});

test("snippetText produces plain text without markup", () => {
  const text = snippetText("**bold** <b>text</b> [link](https://x.com)");
  assert.doesNotMatch(text, /[<>]/);
  assert.match(text, /bold/);
  assert.match(text, /text/);
});

test("collectGalleryImages only returns http/https URLs", () => {
  const images = collectGalleryImages({
    images: [
      { url: "https://img.example/a.png", alt: "A" },
      { url: "javascript:alert(1)", alt: "bad" },
      { url: "https://img.example/b.png", status: "pending" },
    ],
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].url, "https://img.example/a.png");
});
