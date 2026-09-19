import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCOUNT_DELETION,
  ABOUT_PRINCIPLES,
  APP_FEATURES,
  CORE_BENEFITS,
  FAQ_GROUPS,
  HOW_IT_WORKS,
  MEMBERSHIP_BENEFITS,
  NAVIGATION,
  SITE,
  VITAL_AREAS,
} from '../src/pages.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const outputRoot = path.resolve(webRoot, 'dist');
const expectedOutputRoot = path.join(webRoot, 'dist');

if (outputRoot !== expectedOutputRoot) {
  throw new Error(`Refusing to build into unexpected directory: ${outputRoot}`);
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const linkify = (value) =>
  escapeHtml(value)
    .replaceAll('\n', '<br>')
    .replaceAll(
      SITE.email,
      `<a href="mailto:${SITE.email}">${SITE.email}</a>`,
    )
    .replace(
      /(https:\/\/[^\s<]+?)([.,;:!?])?(?=\s|<|$)/g,
      '<a href="$1" rel="noreferrer">$1</a>$2',
    );

const formatDate = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));

const canonicalUrl = (route) => `${SITE.origin}${route === '/' ? '' : route}`;

const renderNavigationLinks = (activeKey) =>
  NAVIGATION.map(
    ({ key, label, href }) =>
      `<a class="nav-link" href="${href}"${key === activeKey ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('');

const renderHeader = (activeKey) => `<header class="site-header">
  <div class="header-inner">
    <a class="brand-link" href="/" aria-label="Vital Collective home">
      <picture>
        <source media="(max-width: 680px)" srcset="/assets/vital-logo-simple.png">
        <img class="header-logo" src="/assets/vital-logo-main.png" width="1536" height="1024" alt="Vital Collective" fetchpriority="high">
      </picture>
    </a>
    <nav class="desktop-nav" aria-label="Primary navigation">
      ${renderNavigationLinks(activeKey)}
      <span class="header-status">App coming soon</span>
    </nav>
    <details class="mobile-menu">
      <summary>Menu</summary>
      <nav aria-label="Mobile navigation">
        ${renderNavigationLinks(activeKey)}
        <span class="header-status">App coming soon</span>
      </nav>
    </details>
  </div>
</header>`;

const renderFooter = () => `<footer class="site-footer">
  <div class="footer-inner">
    <div>
      <p class="footer-brand">Vital Collective</p>
      <p class="footer-meta">A family-run UK app · © 2026 Vital Collective</p>
    </div>
    <nav class="footer-links" aria-label="Legal and support">
      <a href="/privacy/">Privacy</a>
      <a href="/terms/">Terms</a>
      <a href="/delete-account/">Delete account</a>
      <a href="/contact/">Contact</a>
    </nav>
  </div>
</footer>`;

const pageTemplate = ({
  title,
  description,
  route,
  activeKey,
  content,
  noindex = false,
  structuredData = null,
}) => {
  const fullTitle = title === SITE.name ? title : `${title} | ${SITE.name}`;
  const canonical = canonicalUrl(route);
  const robots = noindex ? 'noindex, follow' : 'index, follow';
  const schema = structuredData
    ? `<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll('<', '\\u003c')}</script>`
    : '';

  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(fullTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${robots}">
    <meta name="theme-color" content="#FDF5E7">
    <link rel="canonical" href="${canonical}">
    <link rel="icon" href="/assets/vital-mark.png" type="image/png">
    <link rel="stylesheet" href="/assets/styles.css">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Vital Collective">
    <meta property="og:title" content="${escapeHtml(fullTitle)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${SITE.origin}/assets/vital-logo-main.png">
    <meta property="og:image:width" content="1536">
    <meta property="og:image:height" content="1024">
    <meta property="og:image:alt" content="Vital Collective family logo">
    <meta name="twitter:card" content="summary_large_image">
    ${schema}
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to main content</a>
    ${renderHeader(activeKey)}
    <main id="main" class="page-shell">
      ${content}
    </main>
    ${renderFooter()}
  </body>
</html>
`;
};

const renderAreaCards = () =>
  VITAL_AREAS.map(
    ({ number, title, description, tone }) => `<article class="area-card tone-${tone}">
      <span class="card-number">${number}</span>
      <h3>${title}</h3>
      <p>${description}</p>
    </article>`,
  ).join('');

const renderFeatureCards = (items, className = 'feature-card') =>
  items
    .map(
      ({ title, text }) => `<article class="${className}">
        <h3>${title}</h3>
        <p>${text}</p>
      </article>`,
    )
    .join('');

const homeContent = `<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">The family app, launching soon</p>
    <h1>More doing. Less scrolling.</h1>
    <p class="lede">Practical ideas, activities and resources to help families move, play, connect and make everyday life better.</p>
    <div class="button-row">
      <span class="button button-primary" aria-disabled="true">Mobile app coming soon</span>
      <a class="button button-secondary" href="/how-it-works/">See how Vital works</a>
    </div>
  </div>
  <aside class="hero-note" aria-label="What Vital is for">
    <p class="eyebrow">Made for real family days</p>
    <h2>One calm place to find what helps.</h2>
    <p>Vital Collective is a mobile app in development for useful activities, printable resources and family ideas worth stepping away from the screen for.</p>
  </aside>
</section>

<section class="section" aria-labelledby="areas-title">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Explore the collective</p>
      <h2 id="areas-title">Five parts of family life</h2>
    </div>
    <p class="section-heading-copy">Vital brings together distinct areas for grown-ups, children, shared family time, everyday capability and food.</p>
  </div>
  <div class="area-grid">${renderAreaCards()}</div>
</section>

<section class="section" aria-labelledby="benefits-title">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Inside the app</p>
      <h2 id="benefits-title">Useful from the first idea</h2>
    </div>
    <p class="section-heading-copy">Vital is designed as a practical member tool—not another stream of family content to keep up with.</p>
  </div>
  <div class="feature-grid">${renderFeatureCards(CORE_BENEFITS)}</div>
</section>

<section class="band" aria-labelledby="mobile-first-title">
  <p class="eyebrow">A mobile app first</p>
  <h2 id="mobile-first-title">Built to help you leave the screen behind.</h2>
  <p>Use Vital to find what fits, save it for later, then get on with making, moving, cooking, learning or spending time together.</p>
  <div class="button-row">
    <a class="button button-secondary" href="/membership/">Explore membership</a>
    <span class="button button-plum" aria-disabled="true">App stores coming soon</span>
  </div>
</section>`;

const howItWorksContent = `<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">How Vital works</p>
    <h1>From “what shall we do?” to something worth doing.</h1>
    <p class="lede">Vital is primarily a mobile app: open it when your family needs an idea, find something practical and take the activity into real life.</p>
  </div>
  <aside class="hero-note">
    <h2>One collection, five perspectives.</h2>
    <p>Search across Vital Mums, Kids, Together, Life and Food—or begin in the area that fits your day.</p>
  </aside>
</section>

<section class="section" aria-labelledby="journey-title">
  <div class="section-heading">
    <div>
      <p class="eyebrow">A simple rhythm</p>
      <h2 id="journey-title">Find it. Do it. Keep the good ones.</h2>
    </div>
    <p class="section-heading-copy">Vital keeps discovery clear so the app supports family time rather than becoming the family time.</p>
  </div>
  <div class="step-grid">${HOW_IT_WORKS.map(
    ({ number, title, text }) => `<article class="step-card">
      <span class="card-number">${number}</span>
      <h3>${title}</h3>
      <p>${text}</p>
    </article>`,
  ).join('')}</div>
</section>

<section class="section" aria-labelledby="features-title">
  <div class="section-heading">
    <div>
      <p class="eyebrow">The Vital toolkit</p>
      <h2 id="features-title">Everything has a practical job.</h2>
    </div>
    <p class="section-heading-copy">The app combines discovery, resources, personal organisation and member conversation without turning family information into public profile data.</p>
  </div>
  <div class="feature-grid">${renderFeatureCards(APP_FEATURES)}</div>
</section>

<section class="band">
  <h2>Ready when family life needs a nudge.</h2>
  <p>Vital Collective is preparing for launch on mobile. Store download links will appear here only when the live app is ready.</p>
  <div class="button-row"><span class="button button-plum" aria-disabled="true">Coming soon</span></div>
</section>`;

const membershipContent = `<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">Vital membership</p>
    <h1>Full Vital, from the start.</h1>
    <p class="lede">Vital does not have a cut-down free tier. A membership opens the complete app, with a 7-day free trial before the chosen plan begins.</p>
  </div>
  <aside class="hero-note">
    <h2>One membership</h2>
    <ul class="check-list">${MEMBERSHIP_BENEFITS.map((item) => `<li>${item}</li>`).join('')}</ul>
  </aside>
</section>

<section class="section" aria-labelledby="plans-title">
  <p class="eyebrow">Standard membership</p>
  <h2 id="plans-title">Choose monthly or annual.</h2>
  <div class="pricing-grid">
    <article class="price-card">
      <p class="eyebrow">Monthly</p>
      <h3>Vital monthly</h3>
      <p class="price">£9.99 <span class="price-period">/ month</span></p>
      <p class="price-note">Includes the 7-day free trial for eligible new members.</p>
    </article>
    <article class="price-card featured">
      <p class="eyebrow">Annual</p>
      <h3>Vital annual</h3>
      <p class="price">£59.99 <span class="price-period">/ year</span></p>
      <p class="price-note">The complete Vital membership on one annual plan.</p>
    </article>
  </div>
</section>

<section class="section">
  <div class="split">
    <article class="content-card">
      <h2>Your trial</h2>
      <p>The standard trial lasts 7 days. Unless cancelled through the relevant app store before it ends, the trial converts to the selected paid monthly or annual subscription.</p>
      <p>Eligibility and the exact renewal details are shown by Apple App Store or Google Play before confirmation.</p>
    </article>
    <article class="content-card">
      <h2>Managing membership</h2>
      <p>Subscriptions are purchased and managed through the app store used at checkout. Members can restore purchases in Vital and manage or cancel renewals through Apple or Google.</p>
      <p>Deleting a Vital account does not itself cancel a store subscription.</p>
    </article>
  </div>
</section>

<section class="band">
  <h2>Vital is not yet live in the app stores.</h2>
  <p>There is nothing to buy on this website. Genuine store download and purchase options will be added when Vital launches.</p>
  <div class="button-row"><span class="button button-plum" aria-disabled="true">Coming soon</span></div>
</section>`;

const aboutContent = `<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">About Vital</p>
    <h1>A UK-based app, built for everyday family life.</h1>
    <p class="lede">Vital Collective began with a simple idea: families often want to do more together, but what they need is practical inspiration—not more scrolling. With new ideas and activities being added all the time, there’s always something new to discover.</p>
  </div>
  <aside class="hero-note">
    <h2>The thought behind Vital</h2>
    <p>Bring genuinely useful family ideas into one calm place, make them easier to find, and help people move from intention to action.</p>
  </aside>
</section>

<section class="section">
  <div class="split">
    <article class="content-card">
      <p class="eyebrow">Why it exists</p>
      <h2>Family inspiration can be simpler.</h2>
      <p>Ideas are everywhere, but finding the right one at the right moment can take longer than doing it. Vital organises practical activities around different parts of family life, with clear guidance and useful filters.</p>
    </article>
    <article class="content-card">
      <p class="eyebrow">What it is not</p>
      <h2>Another feed demanding attention.</h2>
      <p>Vital is deliberately designed to be consulted, used and put down. The aim is more confidence and connection in everyday family life—not more time spent watching a screen.</p>
    </article>
  </div>
</section>

<section class="section" aria-labelledby="principles-title">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Our approach</p>
      <h2 id="principles-title">The principles shaping Vital.</h2>
    </div>
    <p class="section-heading-copy">Vital’s product choices are guided by usefulness, proportionate privacy and respect for members’ time.</p>
  </div>
  <div class="principle-grid">${renderFeatureCards(ABOUT_PRINCIPLES, 'principle-card')}</div>
</section>

<section class="band">
  <h2>Vital Collective is preparing for launch.</h2>
  <p>The mobile app is the product. This website is here to explain it clearly, provide support and make Vital’s legal information easy to reach.</p>
  <div class="button-row"><a class="button button-secondary" href="/contact/">Contact Vital</a></div>
</section>`;

const renderFaq = (faq) => `<section class="faq-wrap">
  <div class="legal-intro">
    <p class="eyebrow">Help and answers</p>
    <h1>Frequently asked questions</h1>
    <p class="lede">Straightforward answers about Vital, membership, Community, privacy and account support.</p>
  </div>
  ${FAQ_GROUPS.map(({ title, from, to }) => {
    const questions = faq.questions.filter((item) => {
      const number = Number(item.id.replace('faq-', ''));
      return number >= from && number <= to;
    });

    return `<section class="faq-group" aria-labelledby="faq-${from}-${to}">
      <h2 id="faq-${from}-${to}">${title}</h2>
      ${questions
        .map(
          (item) => `<details class="faq-item">
            <summary>${escapeHtml(item.question)}</summary>
            <div class="faq-answer">${item.answer.map((paragraph) => `<p>${linkify(paragraph)}</p>`).join('')}</div>
          </details>`,
        )
        .join('')}
    </section>`;
  }).join('')}
</section>`;

const contactContent = `<section class="contact-wrap">
  <div class="contact-lede">
    <p class="eyebrow">Contact and support</p>
    <h1>How can we help?</h1>
    <p class="lede">For public enquiries, account support or questions about Vital, contact the family behind the app directly.</p>
  </div>
  <div class="contact-grid">
    <article class="content-card">
      <h2>Email Vital</h2>
      <p><a class="button button-primary" href="mailto:${SITE.email}">${SITE.email}</a></p>
      <p>Please do not send passwords, payment-card details or app-store passwords by email.</p>
    </article>
    <article class="content-card">
      <h2>Business address</h2>
      <address>${SITE.address.map((line) => escapeHtml(line)).join('<br>')}</address>
    </article>
  </div>
</section>

<section class="section">
  <div class="split">
    <article class="content-card">
      <h2>Account deletion</h2>
      <p>If you can sign in, the secure deletion flow is inside Vital. If you cannot access the app, the public deletion page explains how to request help.</p>
      <p><a href="/delete-account/">Read the account-deletion guidance</a></p>
    </article>
    <article class="content-card">
      <h2>Quick answers</h2>
      <p>Questions about membership, cancellation, Community, family information and privacy are covered in the public FAQ.</p>
      <p><a href="/faq/">Browse frequently asked questions</a></p>
    </article>
  </div>
</section>`;

const renderLegalSection = (section) => {
  const rendered = [];
  let bullets = [];
  const flushBullets = () => {
    if (bullets.length > 0) {
      rendered.push(`<ul>${bullets.map((text) => `<li>${linkify(text)}</li>`).join('')}</ul>`);
      bullets = [];
    }
  };

  for (const block of section.blocks) {
    if (block.type === 'bullet') {
      bullets.push(block.text);
      continue;
    }

    flushBullets();

    if (block.type === 'paragraph') {
      rendered.push(`<p>${linkify(block.text)}</p>`);
    } else if (block.type === 'definitions') {
      rendered.push(
        `<dl>${block.entries
          .map(
            ({ label, text }) =>
              `<div><dt>${escapeHtml(label)}</dt><dd>${linkify(text)}</dd></div>`,
          )
          .join('')}</dl>`,
      );
    } else {
      throw new Error(`Unsupported legal block type: ${block.type}`);
    }
  }

  flushBullets();

  return `<section class="legal-section">
    <h2>${escapeHtml(section.heading)}</h2>
    ${rendered.join('')}
  </section>`;
};

const renderLegalDocument = (document, eyebrow) => `<article class="legal-wrap">
  <header class="legal-intro">
    <p class="eyebrow">${eyebrow}</p>
    <h1>${escapeHtml(document.title)}</h1>
    <p class="last-updated">Last updated ${formatDate(document.lastUpdated)}</p>
  </header>
  ${document.sections.map(renderLegalSection).join('')}
</article>`;

const deletionContent = `<article class="legal-wrap">
  <header class="legal-intro">
    <p class="eyebrow">Account and privacy</p>
    <h1>${ACCOUNT_DELETION.title}</h1>
    <p class="lede">${ACCOUNT_DELETION.summary}</p>
  </header>
  <div class="deletion-grid">
    ${ACCOUNT_DELETION.sections
      .map((section) => {
        const email = section.emailAction
          ? (() => {
              const url = new URL(`mailto:${SITE.email}`);
              url.searchParams.set('subject', section.emailAction.subject);
              url.searchParams.set('body', section.emailAction.body);
              return `<a class="button button-primary" href="${escapeHtml(url.href)}">${section.emailAction.label}</a>`;
            })()
          : '';
        const links = section.links?.length
          ? `<ul class="link-list">${section.links
              .map(
                ({ label, href }) =>
                  `<li><a href="${href}"${href.startsWith('http') ? ' rel="noreferrer"' : ''}>${label}</a></li>`,
              )
              .join('')}</ul>`
          : '';

        return `<section class="deletion-card${section.tone === 'accent' ? ' accent' : ''}">
          <h2>${section.heading}</h2>
          ${section.steps ? `<ol>${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : ''}
          ${section.paragraphs?.map((paragraph) => `<p>${linkify(paragraph)}</p>`).join('') ?? ''}
          ${section.notice ? `<p class="notice"><strong>${escapeHtml(section.notice)}</strong></p>` : ''}
          ${links}
          ${email}
        </section>`;
      })
      .join('')}
  </div>
</article>`;

const notFoundContent = `<section class="not-found">
  <div>
    <p class="eyebrow">Page not found</p>
    <h1>This page has wandered off.</h1>
    <p class="lede">The page you asked for is not here, but the rest of Vital is close by.</p>
    <div class="button-row"><a class="button button-primary" href="/">Back to Vital Collective</a></div>
  </div>
</section>`;

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.origin,
  email: SITE.email,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Unit 1, The Breeze Hill, Bangor Road',
    addressLocality: 'Benllech',
    addressRegion: 'Anglesey',
    postalCode: 'LL74 8TN',
    addressCountry: 'GB',
  },
};

const pageDefinitions = (privacy, terms, faq) => [
  {
    slug: '',
    route: '/',
    activeKey: 'home',
    title: SITE.name,
    description: SITE.description,
    content: homeContent,
    structuredData: organizationSchema,
  },
  {
    slug: 'how-it-works',
    route: '/how-it-works',
    activeKey: 'how-it-works',
    title: 'How Vital works',
    description:
      'See how Vital Collective helps families discover practical activities, use printable resources, save ideas and join a supportive Community.',
    content: howItWorksContent,
  },
  {
    slug: 'membership',
    route: '/membership',
    activeKey: 'membership',
    title: 'Vital membership',
    description:
      'Vital Collective membership includes a 7-day free trial, then costs £9.99 monthly or £59.99 annually for full app access.',
    content: membershipContent,
  },
  {
    slug: 'about',
    route: '/about',
    activeKey: 'about',
    title: 'About Vital Collective',
    description:
      'Vital Collective is a family-run UK app designed to help families find practical inspiration and spend less time scrolling.',
    content: aboutContent,
  },
  {
    slug: 'faq',
    route: '/faq',
    activeKey: 'faq',
    title: 'Frequently asked questions',
    description:
      'Answers about Vital Collective activities, family information, Community, membership, privacy and account support.',
    content: renderFaq(faq),
  },
  {
    slug: 'contact',
    route: '/contact',
    activeKey: null,
    title: 'Contact Vital Collective',
    description:
      'Contact Vital Collective for public enquiries, account support and questions about the family app.',
    content: contactContent,
  },
  {
    slug: 'privacy',
    route: '/privacy',
    activeKey: null,
    title: privacy.title,
    description: 'How Vital Collective collects, uses, protects and deletes member information.',
    content: renderLegalDocument(privacy, 'Privacy and data'),
  },
  {
    slug: 'terms',
    route: '/terms',
    activeKey: null,
    title: terms.title,
    description: 'The terms governing Vital Collective accounts, membership, activities and Community use.',
    content: renderLegalDocument(terms, 'Terms of use'),
  },
  {
    slug: 'delete-account',
    route: '/delete-account',
    activeKey: null,
    title: ACCOUNT_DELETION.title,
    description: ACCOUNT_DELETION.description,
    content: deletionContent,
  },
];

const writePage = async (page) => {
  const directory = page.slug ? path.join(outputRoot, page.slug) : outputRoot;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), pageTemplate(page), 'utf8');
};

export async function buildSite() {
  const [privacy, terms, faq] = await Promise.all(
    ['privacy.json', 'terms.json', 'faq.json'].map(async (file) =>
      JSON.parse(
        await readFile(path.join(repoRoot, 'packages', 'content', 'legal', file), 'utf8'),
      ),
    ),
  );

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, 'assets', 'fonts'), { recursive: true });

  const pages = pageDefinitions(privacy, terms, faq);

  await Promise.all([
    ...pages.map(writePage),
    writeFile(
      path.join(outputRoot, '404.html'),
      pageTemplate({
        title: 'Page not found',
        description: 'The requested Vital Collective page could not be found.',
        route: '/404',
        activeKey: null,
        content: notFoundContent,
        noindex: true,
      }),
      'utf8',
    ),
    writeFile(
      path.join(outputRoot, 'robots.txt'),
      `User-agent: *\nAllow: /\nSitemap: ${SITE.origin}/sitemap.xml\n`,
      'utf8',
    ),
    writeFile(
      path.join(outputRoot, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
        .map(
          ({ route }) =>
            `  <url><loc>${canonicalUrl(route)}</loc><lastmod>2026-09-18</lastmod></url>`,
        )
        .join('\n')}\n</urlset>\n`,
      'utf8',
    ),
    copyFile(path.join(webRoot, 'src', 'styles.css'), path.join(outputRoot, 'assets', 'styles.css')),
    copyFile(
      path.join(repoRoot, 'apps', 'mobile', 'assets', 'brand', 'vital-logo-main.png'),
      path.join(outputRoot, 'assets', 'vital-logo-main.png'),
    ),
    copyFile(
      path.join(repoRoot, 'apps', 'mobile', 'assets', 'brand', 'vital-logo-simple.png'),
      path.join(outputRoot, 'assets', 'vital-logo-simple.png'),
    ),
    copyFile(
      path.join(repoRoot, 'apps', 'mobile', 'assets', 'brand', 'vital-mark.png'),
      path.join(outputRoot, 'assets', 'vital-mark.png'),
    ),
    copyFile(
      path.join(
        repoRoot,
        'node_modules',
        '@expo-google-fonts',
        'dm-serif-display',
        '400Regular',
        'DMSerifDisplay_400Regular.ttf',
      ),
      path.join(outputRoot, 'assets', 'fonts', 'dm-serif-display-regular.ttf'),
    ),
    copyFile(
      path.join(
        repoRoot,
        'node_modules',
        '@expo-google-fonts',
        'inter',
        '400Regular',
        'Inter_400Regular.ttf',
      ),
      path.join(outputRoot, 'assets', 'fonts', 'inter-regular.ttf'),
    ),
    copyFile(
      path.join(
        repoRoot,
        'node_modules',
        '@expo-google-fonts',
        'inter',
        '600SemiBold',
        'Inter_600SemiBold.ttf',
      ),
      path.join(outputRoot, 'assets', 'fonts', 'inter-semibold.ttf'),
    ),
  ]);

  return { outputRoot, pages: pages.map(({ route }) => route) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = await buildSite();
  process.stdout.write(`Built ${result.pages.length} routes in ${result.outputRoot}\n`);
}
