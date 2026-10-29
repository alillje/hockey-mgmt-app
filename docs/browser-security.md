# Browser XSS hardening

The combined .NET/React app sends an enforced Content-Security-Policy on pages, static assets and API/error responses. This applies to both stage and prod when the app is released; no environment variables, infrastructure changes or database migrations are required for this change.

## Policy

- Scripts may load only from the same origin. Inline scripts, inline event handlers and eval are blocked. No script exceptions for data/blob URLs, external domains or CDNs are allowed.
- API connections and fonts are same-origin only. Supabase calls run on the backend, so the browser does not need an external Supabase exception.
- Images allow the same origin plus data/blob sources for existing rink-to-canvas PDF export and the dropdown icon.
- Styles permit same-origin CSS and inline styling because React uses inline attributes for editor geometry and layout. This allowance is confined to styles; scripts remain restricted.
- Plugins, frames and workers are blocked. The app cannot be embedded in another page, forms target only the same origin, and injected base elements cannot change URL resolution.
- X-Content-Type-Options: nosniff prevents script/style MIME confusion. X-Frame-Options: DENY complements CSP's frame restriction. Referrer-Policy remains no-referrer.

This policy uses a same-origin script allowlist rather than per-response nonces, keeping Vite's static hashed bundles cacheable. Any future same-origin uploads, JSONP, inline bootstrap scripts, third-party scripts, embeds or external APIs require a security review before changing the policy.

## Rendering

User names, drill/practice names, notes and SVG labels stay plain text rendered through React. The application does not use raw HTML insertion or interpret notes as markup. Rink diagrams are built from React SVG elements; PDF export serialises those escaped elements and writes notes as text. Server validation restricts diagram colours and numeric geometry.

Do not add raw HTML rendering or runtime script evaluation for user content. Do not “sanitise” stored text by deleting angle brackets: preserve the user's text and use context-appropriate rendering. If rich text becomes a requirement, design and test an explicit sanitisation boundary first.

CSP adds a layer of defence; it is not a guarantee that all XSS is impossible. Continue escaping content, validating URL/style inputs, reviewing dependencies and keeping user-controlled executable files off the app's origin. HttpOnly cookies limit credential theft, but XSS could still perform actions as the signed-in user.

## Verification

- Hosting tests check headers on documents, assets and API errors.
- The published-app smoke check verifies headers with Production startup and session authentication enabled.
- The dedicated Playwright suite uses the actual published React build and .NET headers, with a temporary SQLite POC database. Its content test saves HTML-like payloads through the real API, checks text/SVG rendering, draws/saves a drill and downloads a PDF with no CSP violations.
- Script injection tests verify the browser blocks inline code, event handlers, external scripts and eval.
- OTP/About/logout tests mock authentication responses while retaining the real document and enforced CSP.

To run locally after building React:

```bash
source scripts/toolchain.sh
npm --prefix frontend run build
dotnet publish backend/HockeyTrainer.Api --configuration Release --output artifacts/publish
npm --prefix frontend run test:security
```

CI runs this suite after publishing and installing Playwright. Its Development-only unauthenticated test database is isolated from saved local content and hosted databases. The same CSP is enforced regardless of .NET environment.

The separate Vite development server does not serve .NET response headers. Use the published-app suite to validate CSP; passing the ordinary Vite browser suite alone does not prove the policy works.
