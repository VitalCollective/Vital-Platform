import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildPublicSite } from "./build.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicRoot = path.join(repoRoot, "apps", "mobile", "public");

await buildPublicSite();

const readPublicFile = (...segments) =>
  readFile(path.join(publicRoot, ...segments), "utf8");

test("the public account-deletion resource is complete, crawlable and safe", async () => {
  const html = await readPublicFile("delete-account", "index.html");

  assert.match(html, /<html lang="en-GB">/);
  assert.match(html, /<meta name="robots" content="index, follow">/);
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/vitalcollective\.co\.uk\/delete-account">/,
  );
  assert.match(html, /Vital Collective/);
  assert.match(html, /Choose <strong>You<\/strong>/);
  assert.match(html, /Delete account permanently/);
  assert.match(html, /mailto:info@vitalcollective\.co\.uk\?subject=Vital\+account\+deletion\+request/);
  assert.match(html, /verify your identity/);
  assert.match(html, /private feedback or activity submissions/);
  assert.match(html, /Community posts and replies are deleted/);
  assert.match(html, /fraud-prevention/);
  assert.match(html, /does not cancel an Apple App Store or Google Play subscription/);
  assert.match(html, /support\.apple\.com\/en-gb\/118428/);
  assert.match(html, /support\.google\.com\/googleplay\/answer\/7018481/);
  assert.match(html, /href="\/privacy\/"/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /fetch\s*\(/i);
  assert.doesNotMatch(html, /supabase/i);
});

test("the public Privacy Policy is generated from the canonical legal content", async () => {
  const html = await readPublicFile("privacy", "index.html");
  const canonical = JSON.parse(
    await readFile(
      path.join(repoRoot, "packages", "content", "legal", "privacy.json"),
      "utf8",
    ),
  );

  assert.equal((html.match(/<section class="legal-section">/g) ?? []).length, canonical.sections.length);
  assert.match(html, /Last updated 18 September 2026/);
  assert.match(html, /Community display name, optional profile image, optional introduction/);
  assert.match(html, /private messages, activity suggestions, problem reports/);
  assert.match(html, /These submissions are not Community posts/);
  assert.match(html, /permanently delete your Vital account from within the app/);
  assert.match(html, /does not cancel an Apple App Store or Google Play subscription/);
});

test("public discovery and brand assets are emitted", async () => {
  const [robots, sitemap, brand, serif, inter] = await Promise.all([
    readPublicFile("robots.txt"),
    readPublicFile("sitemap.xml"),
    stat(path.join(publicRoot, "vital-mark.png")),
    stat(path.join(publicRoot, "fonts", "dm-serif-display-regular.ttf")),
    stat(path.join(publicRoot, "fonts", "inter-regular.ttf")),
  ]);

  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/vitalcollective\.co\.uk\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/vitalcollective\.co\.uk\/delete-account/);
  assert.match(sitemap, /https:\/\/vitalcollective\.co\.uk\/privacy/);
  assert.ok(brand.size > 0);
  assert.ok(serif.size > 0);
  assert.ok(inter.size > 0);
});
