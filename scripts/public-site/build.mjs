import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const publicRoot = path.join(repoRoot, "apps", "mobile", "public");
const siteOrigin = "https://vitalcollective.co.uk";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const linkify = (value) => {
  const escaped = escapeHtml(value).replaceAll("\n", "<br>");

  return escaped
    .replaceAll(
      "info@vitalcollective.co.uk",
      '<a href="mailto:info@vitalcollective.co.uk">info@vitalcollective.co.uk</a>',
    )
    .replace(
      /(https:\/\/[^\s<]+)/g,
      '<a href="$1" rel="noreferrer">$1</a>',
    );
};

const formatDate = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

const pageTemplate = ({ title, description, canonicalPath, content }) => `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} | Vital Collective</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${siteOrigin}${canonicalPath}">
    <link rel="icon" href="/vital-mark.png" type="image/png">
    <link rel="stylesheet" href="/vital-public.css">
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/delete-account/" aria-label="Vital Collective account deletion">
        <img src="/vital-mark.png" width="72" height="72" alt="">
        <span>Vital Collective</span>
      </a>
    </header>
    <main class="page-shell">
      ${content}
    </main>
    <footer class="site-footer">
      <span>Vital Collective</span>
      <nav aria-label="Legal and support">
        <a href="/privacy/">Privacy Policy</a>
        <a href="/delete-account/">Delete account</a>
        <a href="mailto:info@vitalcollective.co.uk">Contact Vital</a>
      </nav>
    </footer>
  </body>
</html>
`;

const renderPrivacySection = (section) => {
  const rendered = [];
  let bullets = [];
  const flushBullets = () => {
    if (bullets.length > 0) {
      rendered.push(`<ul>${bullets.map((text) => `<li>${linkify(text)}</li>`).join("")}</ul>`);
      bullets = [];
    }
  };

  for (const block of section.blocks) {
    if (block.type === "bullet") {
      bullets.push(block.text);
      continue;
    }

    flushBullets();

    if (block.type === "paragraph") {
      rendered.push(`<p>${linkify(block.text)}</p>`);
    } else if (block.type === "definitions") {
      rendered.push(
        `<dl>${block.entries
          .map(
            ({ label, text }) =>
              `<div><dt>${escapeHtml(label)}</dt><dd>${linkify(text)}</dd></div>`,
          )
          .join("")}</dl>`,
      );
    } else {
      throw new Error(`Unsupported legal block type: ${block.type}`);
    }
  }

  flushBullets();

  return `<section class="legal-section">
    <h2>${escapeHtml(section.heading)}</h2>
    ${rendered.join("\n")}
  </section>`;
};

const publicCss = `@font-face {
  font-family: "DM Serif Display";
  src: url("/fonts/dm-serif-display-regular.ttf") format("truetype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-regular.ttf") format("truetype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-semibold.ttf") format("truetype");
  font-style: normal;
  font-weight: 600;
  font-display: swap;
}

:root {
  color-scheme: light;
  --cream: #fdf5e7;
  --surface: #fffcf6;
  --green: #344834;
  --green-muted: #596859;
  --green-soft: #e8ede6;
  --plum: #783f49;
  --plum-soft: #f1e6e8;
  --border: #d8dccf;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--cream);
  color: var(--green);
  font-family: "Inter", system-ui, sans-serif;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

body {
  margin: 0;
  min-width: 0;
  background: var(--cream);
}

a {
  color: var(--plum);
  font-weight: 600;
  text-underline-offset: 0.2em;
}

a:hover {
  text-decoration-thickness: 2px;
}

a:focus-visible {
  border-radius: 4px;
  outline: 3px solid var(--plum);
  outline-offset: 4px;
}

.site-header,
.site-footer,
.page-shell {
  width: min(100% - 2rem, 760px);
  margin-inline: auto;
}

.site-header {
  padding-block: 2rem 1.25rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  color: var(--green);
  font-family: "DM Serif Display", Georgia, serif;
  font-size: clamp(1.45rem, 4vw, 1.85rem);
  font-weight: 400;
  text-decoration: none;
}

.brand img {
  display: block;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  object-fit: cover;
}

.page-shell {
  padding-bottom: 4rem;
}

.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--plum);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

h1,
h2 {
  color: var(--green);
  font-family: "DM Serif Display", Georgia, serif;
  font-weight: 400;
  line-height: 1.12;
}

h1 {
  max-width: 15ch;
  margin: 0;
  font-size: clamp(2.25rem, 8vw, 4rem);
}

h2 {
  margin: 0 0 0.8rem;
  font-size: clamp(1.45rem, 4vw, 1.85rem);
}

p,
li,
dd {
  color: var(--green-muted);
}

.lede {
  max-width: 64ch;
  margin: 1.1rem 0 2rem;
  font-size: clamp(1.05rem, 2.5vw, 1.2rem);
}

.card,
.legal-section {
  margin-top: 1rem;
  padding: clamp(1.25rem, 4vw, 2rem);
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--surface);
}

.card-accent {
  border-color: #dec7cc;
  background: var(--plum-soft);
}

.note {
  padding: 1rem 1.1rem;
  border-left: 4px solid var(--plum);
  border-radius: 0 12px 12px 0;
  background: var(--plum-soft);
}

.button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: 0.75rem;
  padding: 0.75rem 1.1rem;
  border-radius: 999px;
  background: var(--green);
  color: var(--cream);
  font-weight: 600;
  text-align: center;
  text-decoration: none;
}

.button:hover {
  background: #263626;
}

ol,
ul {
  padding-left: 1.35rem;
}

li + li {
  margin-top: 0.55rem;
}

dl,
dd {
  margin: 0;
}

dl div + div {
  margin-top: 0.8rem;
}

dt {
  font-weight: 600;
}

.last-updated {
  margin-top: 0.65rem;
  color: var(--green-muted);
  font-size: 0.9rem;
}

.site-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem 2rem;
  padding-block: 2rem 3rem;
  border-top: 1px solid var(--border);
  color: var(--green-muted);
  font-size: 0.9rem;
}

.site-footer nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1.25rem;
}

@media (max-width: 520px) {
  .site-header,
  .site-footer,
  .page-shell {
    width: min(100% - 1.25rem, 760px);
  }

  .site-header {
    padding-top: 1.25rem;
  }

  .brand img {
    width: 56px;
    height: 56px;
  }

  .button {
    width: 100%;
  }
}
`;

export async function buildPublicSite() {
  const privacy = JSON.parse(
    await readFile(path.join(repoRoot, "packages", "content", "legal", "privacy.json"), "utf8"),
  );

  await Promise.all([
    mkdir(path.join(publicRoot, "delete-account"), { recursive: true }),
    mkdir(path.join(publicRoot, "privacy"), { recursive: true }),
    mkdir(path.join(publicRoot, "fonts"), { recursive: true }),
  ]);

  const deletionEmail = new URL("mailto:info@vitalcollective.co.uk");
  deletionEmail.searchParams.set("subject", "Vital account deletion request");
  deletionEmail.searchParams.set(
    "body",
    "Please permanently delete my Vital Collective account.\n\nEmail used for my Vital account:\n\nAnything else that may help identify my account (optional):",
  );

  const deletionContent = `<p class="eyebrow">Account and privacy</p>
    <h1>Delete your Vital account</h1>
    <p class="lede">Vital Collective members can permanently delete their account and associated personal data from inside the Vital app. You can also request deletion without signing in or installing the app.</p>

    <section class="card">
      <h2>Delete your account in the app</h2>
      <ol>
        <li>Open Vital and sign in.</li>
        <li>Choose <strong>You</strong> from the bottom navigation.</li>
        <li>Under <strong>Account</strong>, choose <strong>Delete account</strong>.</li>
        <li>Review the information shown, type <strong>DELETE</strong>, then choose <strong>Delete account permanently</strong>.</li>
      </ol>
      <p>This action is permanent. Vital may ask you to sign in again if your session is no longer recent enough to confirm this sensitive action safely.</p>
    </section>

    <section class="card card-accent">
      <h2>Cannot access the app?</h2>
      <p>Email <a href="mailto:info@vitalcollective.co.uk">info@vitalcollective.co.uk</a> to request permanent deletion. If possible, send the request from the email address used for your Vital account. We may need to verify your identity before acting.</p>
      <p>Never send us your password, payment-card details or app-store password.</p>
      <a class="button" href="${escapeHtml(deletionEmail.href)}">Email a deletion request</a>
    </section>

    <section class="card">
      <h2>What deletion covers</h2>
      <p>Deleting your account removes your Vital sign-in and profile, including your member name, avatar and introduction. It also removes your private family information, preferences, Saved data, and private feedback or activity submissions.</p>
      <p>Your Community posts and replies are deleted too. Where removing a parent item would break the structure of replies left by other members, Vital may retain a neutral deleted-item marker without your profile attribution so those replies still make sense.</p>
    </section>

    <section class="card">
      <h2>Limited retention</h2>
      <p>Some limited records may be retained only where genuinely necessary and lawful for legal, accounting, security, fraud-prevention, moderation or dispute-handling obligations. Residual encrypted backup copies may remain until they are removed through Vital’s normal backup cycle.</p>
      <p>For full details, read the <a href="/privacy/">Vital Collective Privacy Policy</a>.</p>
    </section>

    <section class="card">
      <h2>App Store and Google Play subscriptions</h2>
      <p class="note"><strong>Deleting your Vital account does not cancel an Apple App Store or Google Play subscription.</strong> If you have a subscription, cancel it separately through the store that manages it to prevent future renewal charges.</p>
      <ul>
        <li><a href="https://support.apple.com/en-gb/118428" rel="noreferrer">Manage or cancel an Apple subscription</a></li>
        <li><a href="https://support.google.com/googleplay/answer/7018481" rel="noreferrer">Manage or cancel a Google Play subscription</a></li>
      </ul>
    </section>

    <section class="card">
      <h2>Need help?</h2>
      <p>Contact Vital at <a href="mailto:info@vitalcollective.co.uk">info@vitalcollective.co.uk</a>. You do not need to sign in to use this contact route.</p>
    </section>`;

  const privacyContent = `<p class="eyebrow">Legal</p>
    <h1>${escapeHtml(privacy.title)}</h1>
    <p class="last-updated">Last updated ${formatDate(privacy.lastUpdated)}</p>
    <p class="lede">How Vital Collective collects, uses, protects and deletes member information.</p>
    ${privacy.sections.map(renderPrivacySection).join("\n")}`;

  await Promise.all([
    writeFile(path.join(publicRoot, "vital-public.css"), publicCss, "utf8"),
    writeFile(
      path.join(publicRoot, "delete-account", "index.html"),
      pageTemplate({
        title: "Delete your account",
        description:
          "How to permanently delete a Vital Collective account and associated personal data, with an email route for members who cannot access the app.",
        canonicalPath: "/delete-account",
        content: deletionContent,
      }),
      "utf8",
    ),
    writeFile(
      path.join(publicRoot, "privacy", "index.html"),
      pageTemplate({
        title: privacy.title,
        description:
          "How Vital Collective collects, uses, protects and deletes member information.",
        canonicalPath: "/privacy",
        content: privacyContent,
      }),
      "utf8",
    ),
    writeFile(
      path.join(publicRoot, "robots.txt"),
      `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`,
      "utf8",
    ),
    writeFile(
      path.join(publicRoot, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteOrigin}/delete-account</loc><lastmod>${privacy.lastUpdated}</lastmod></url>\n  <url><loc>${siteOrigin}/privacy</loc><lastmod>${privacy.lastUpdated}</lastmod></url>\n</urlset>\n`,
      "utf8",
    ),
    copyFile(
      path.join(repoRoot, "apps", "mobile", "assets", "brand", "vital-mark.png"),
      path.join(publicRoot, "vital-mark.png"),
    ),
    copyFile(
      path.join(
        repoRoot,
        "node_modules",
        "@expo-google-fonts",
        "dm-serif-display",
        "400Regular",
        "DMSerifDisplay_400Regular.ttf",
      ),
      path.join(publicRoot, "fonts", "dm-serif-display-regular.ttf"),
    ),
    copyFile(
      path.join(
        repoRoot,
        "node_modules",
        "@expo-google-fonts",
        "inter",
        "400Regular",
        "Inter_400Regular.ttf",
      ),
      path.join(publicRoot, "fonts", "inter-regular.ttf"),
    ),
    copyFile(
      path.join(
        repoRoot,
        "node_modules",
        "@expo-google-fonts",
        "inter",
        "600SemiBold",
        "Inter_600SemiBold.ttf",
      ),
      path.join(publicRoot, "fonts", "inter-semibold.ttf"),
    ),
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await buildPublicSite();
}
