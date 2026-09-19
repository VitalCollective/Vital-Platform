# Vital Collective public website

This workspace builds the public marketing, support and legal website for
`https://vitalcollective.co.uk`. It is deliberately separate from the Expo
mobile application and has no database, authentication or client framework.

## Commands

From the repository root:

```powershell
npm run web:build
npm run web:preview
```

The preview is available at `http://127.0.0.1:4174`. The production-ready static
output is written to `apps/web/dist` and is intentionally ignored by Git.

Port 4174 is intentionally distinct from the Expo/mobile web preview so the
public marketing website cannot be mistaken for the member application.

## Content and assets

- Privacy, Terms and FAQ content is read from `packages/content/legal` at build
  time. Those JSON documents remain the canonical sources.
- The header uses the approved primary family logo on larger screens and the
  approved simplified family logo at small mobile widths.
- The standalone Vital mark is used only as the favicon/app-symbol treatment,
  not as the website header identity.
- Approved artwork is copied from `apps/mobile/assets/brand` during the build;
  it is not regenerated or altered.

## Hostinger handoff

Build locally, then deploy the **contents** of `apps/web/dist` as a static site.
Directory-index routes are emitted for every public URL, so `/membership` maps
to `membership/index.html`. No runtime environment variables or server process
are required.
