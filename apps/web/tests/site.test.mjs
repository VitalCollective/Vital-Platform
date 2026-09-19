import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildSite } from '../scripts/build.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const dist = path.join(webRoot, 'dist');
const expectedRoutes = [
  '/',
  '/how-it-works',
  '/membership',
  '/about',
  '/faq',
  '/contact',
  '/privacy',
  '/terms',
  '/delete-account',
];

await buildSite();

const routeFile = (route) =>
  route === '/'
    ? path.join(dist, 'index.html')
    : path.join(dist, route.replace(/^\//, ''), 'index.html');

const readRoute = (route) => readFile(routeFile(route), 'utf8');

test('all launch routes build with semantic, branded page chrome', async () => {
  for (const route of expectedRoutes) {
    const html = await readRoute(route);
    assert.match(html, /<!doctype html>/i, route);
    assert.match(html, /<html lang="en-GB">/, route);
    assert.match(html, /<a class="skip-link" href="#main">/, route);
    assert.match(html, /<main id="main" class="page-shell">/, route);
    assert.match(html, /<footer class="site-footer">/, route);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, route);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://vitalcollective\\.co\\.uk${route === '/' ? '' : route}">`), route);
    assert.match(html, /<meta property="og:image" content="https:\/\/vitalcollective\.co\.uk\/assets\/vital-logo-main\.png">/, route);
  }
});

test('the approved family logos are the header identity at desktop and mobile widths', async () => {
  const html = await readRoute('/');
  assert.match(
    html,
    /<source media="\(max-width: 680px\)" srcset="\/assets\/vital-logo-simple\.png">/,
  );
  assert.match(
    html,
    /<img class="header-logo" src="\/assets\/vital-logo-main\.png"[^>]+alt="Vital Collective"/,
  );
  assert.doesNotMatch(html, /class="header-logo"[^>]+vital-mark\.png/);

  const [mainLogo, simpleLogo, favicon] = await Promise.all([
    stat(path.join(dist, 'assets', 'vital-logo-main.png')),
    stat(path.join(dist, 'assets', 'vital-logo-simple.png')),
    stat(path.join(dist, 'assets', 'vital-mark.png')),
  ]);
  assert.ok(mainLogo.size > 0);
  assert.ok(simpleLogo.size > 0);
  assert.ok(favicon.size > 0);
});

test('home, how-it-works and membership state the approved launch proposition', async () => {
  const [home, how, membership] = await Promise.all([
    readRoute('/'),
    readRoute('/how-it-works'),
    readRoute('/membership'),
  ]);

  for (const area of ['Vital Mums', 'Vital Kids', 'Vital Together', 'Vital Life', 'Vital Food']) {
    assert.match(home, new RegExp(area));
  }
  for (const benefit of ['Hundreds of practical activities', 'Printable resources', 'Supportive Community', 'Family profiles and preferences']) {
    assert.match(home, new RegExp(benefit));
  }
  assert.match(home, /More doing\. Less scrolling\./);
  assert.match(home, /Practical ideas, activities and resources to help families move, play, connect and make everyday life better\./);
  assert.match(home, /The family app, launching soon/);
  assert.match(home, /Mobile app coming soon/);
  assert.doesNotMatch(home, /log in|sign in|sign up|create account|member account/i);
  assert.doesNotMatch(home, /<form\b/i);
  assert.match(how, /Vital is primarily a mobile app/);
  assert.match(how, /Find it\. Do it\. Keep the good ones\./);
  assert.match(membership, /7-day free trial/);
  assert.match(membership, /£9\.99/);
  assert.match(membership, /£59\.99/);
  assert.match(membership, /does not have a cut-down free tier/);
  assert.doesNotMatch(membership, /RevenueCat|Test Store|sandbox/i);
});

test('headings keep whole words and About uses the approved positioning', async () => {
  const [about, membership, css] = await Promise.all([
    readRoute('/about'),
    readRoute('/membership'),
    readFile(path.join(dist, 'assets', 'styles.css'), 'utf8'),
  ]);

  assert.match(about, /A UK-based app, built for everyday family life\./);
  assert.match(
    about,
    /Vital Collective began with a simple idea: families often want to do more together, but what they need is practical inspiration—not more scrolling\. With new ideas and activities being added all the time, there’s always something new to discover\./,
  );
  assert.match(membership, /<h2>One membership<\/h2>/);
  assert.match(css, /h1,[\s\S]*h2,[\s\S]*h3 \{[\s\S]*hyphens: none;[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/);
});

test('canonical FAQ, Privacy and Terms content is rendered without divergence', async () => {
  const [faqHtml, privacyHtml, termsHtml, faq, privacy, terms] = await Promise.all([
    readRoute('/faq'),
    readRoute('/privacy'),
    readRoute('/terms'),
    readFile(path.join(repoRoot, 'packages', 'content', 'legal', 'faq.json'), 'utf8').then(JSON.parse),
    readFile(path.join(repoRoot, 'packages', 'content', 'legal', 'privacy.json'), 'utf8').then(JSON.parse),
    readFile(path.join(repoRoot, 'packages', 'content', 'legal', 'terms.json'), 'utf8').then(JSON.parse),
  ]);

  assert.equal((faqHtml.match(/<details class="faq-item">/g) ?? []).length, faq.questions.length);
  assert.match(
    faqHtml,
    /href="https:\/\/vitalcollective\.co\.uk\/privacy" rel="noreferrer">https:\/\/vitalcollective\.co\.uk\/privacy<\/a>\./,
  );
  assert.doesNotMatch(faqHtml, /href="https:\/\/vitalcollective\.co\.uk\/privacy\."/);
  assert.equal((privacyHtml.match(/<section class="legal-section">/g) ?? []).length, privacy.sections.length);
  assert.equal((termsHtml.match(/<section class="legal-section">/g) ?? []).length, terms.sections.length);
  assert.match(privacyHtml, /Community display name, optional profile image, optional introduction/);
  assert.match(privacyHtml, /These submissions are not Community posts/);
  assert.match(termsHtml, /Membership and subscriptions/);
});

test('account deletion and contact remain public, safe and complete', async () => {
  const [deletion, contact] = await Promise.all([
    readRoute('/delete-account'),
    readRoute('/contact'),
  ]);

  assert.match(deletion, /Choose You from the bottom navigation/);
  assert.match(deletion, /Delete account permanently/);
  assert.match(deletion, /mailto:info@vitalcollective\.co\.uk\?subject=Vital\+account\+deletion\+request/);
  assert.match(deletion, /private feedback or activity submissions/);
  assert.match(deletion, /does not cancel an Apple App Store or Google Play subscription/);
  assert.match(deletion, /support\.apple\.com\/en-gb\/118428/);
  assert.match(deletion, /support\.google\.com\/googleplay\/answer\/7018481/);
  assert.doesNotMatch(deletion, /<form\b|fetch\s*\(|supabase/i);
  assert.match(contact, /info@vitalcollective\.co\.uk/);
  assert.match(contact, /Unit 1, The Breeze Hill, Bangor Road/);
  assert.doesNotMatch(contact, /<form\b/);
});

test('all internal links and referenced local assets resolve in the static build', async () => {
  const missing = [];

  for (const route of expectedRoutes) {
    const html = await readRoute(route);
    const references = [
      ...[...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
      ...[...html.matchAll(/src="([^"]+)"/g)].map((match) => match[1]),
      ...[...html.matchAll(/srcset="([^"]+)"/g)].map((match) => match[1]),
    ];

    for (const reference of references) {
      if (!reference.startsWith('/') || reference.startsWith('//')) continue;
      const local = reference.split(/[?#]/, 1)[0];
      const target = path.extname(local)
        ? path.join(dist, local.slice(1))
        : routeFile(local === '' ? '/' : local.replace(/\/$/, ''));
      try {
        await access(target);
      } catch {
        missing.push(`${route} -> ${reference}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('SEO discovery files and responsive accessibility rules are present', async () => {
  const [robots, sitemap, css] = await Promise.all([
    readFile(path.join(dist, 'robots.txt'), 'utf8'),
    readFile(path.join(dist, 'sitemap.xml'), 'utf8'),
    readFile(path.join(dist, 'assets', 'styles.css'), 'utf8'),
  ]);

  assert.match(robots, /Sitemap: https:\/\/vitalcollective\.co\.uk\/sitemap\.xml/);
  for (const route of expectedRoutes) {
    assert.match(sitemap, new RegExp(`<loc>https://vitalcollective\\.co\\.uk${route === '/' ? '' : route}</loc>`));
  }
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-width: 320px/);
});
