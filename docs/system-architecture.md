# IceWork system architecture

This public overview describes the main components and boundaries in the current repository. It is not an audit of live service configuration. The diagrams use Mermaid and render directly on GitHub.

## Running system

Azure App Service serves the compiled React frontend and the .NET 10 API from one application and origin. The API communicates with Supabase Auth and PostgreSQL. Stage and prod each have their own Azure resources, Supabase project and GitHub environment configuration.

```mermaid
flowchart TB
    Coach["Coach / administrator"]
    subgraph Browser["Browser"]
        UI["React + TypeScript SPA\nSVG rink editor, drills, practice plans, account"]
        PDF["Client-side PDF export\nSVG drawing + coaching notes"]
        Cookie["Opaque session cookie\nHttpOnly, Secure in hosted environments"]
    end
    subgraph Azure["Azure — one environment"]
        subgraph App["App Service — .NET 10"]
            Static["Static React assets\nand SPA route fallback"]
            API["Controllers + application services\nSession authentication, CSRF, profile completion\nMembership and ownership checks"]
        end
        Vault["Key Vault\nDatabase connection secret"]
    end
    subgraph Supabase["Supabase — matching environment project"]
        Auth["Supabase Auth\nEmail OTP, JWTs, token refresh"]
        DB[("PostgreSQL\nDrills, practice plans, memberships\nProfiles and application sessions")]
    end
    Mail["Email delivery provider"]
    Coach --> UI
    UI --> PDF
    UI -->|"HTTPS: load application"| Static
    UI -->|"Same-origin /api requests\nCookie + CSRF token on writes"| API
    Cookie -.-> UI
    API -->|"Email/code verification and refresh"| Auth
    Auth -->|"Send sign-in code"| Mail
    Mail -->|"Email"| Coach
    API -->|"EF Core / Npgsql over TLS"| DB
    Vault -->|"Managed identity access"| API
```

- The browser uses an opaque session cookie. Supabase tokens are handled on the server.
- The backend authenticates requests and enforces organisation membership, team roles and content ownership.
- The application accesses PostgreSQL through .NET. Browser requests go to the application's API.
- The combined application enforces CSRF protection, CSP, browser security headers and API rate limits.
- Rink drawings are versioned diagram data stored with drills. PDF export happens in the browser.

## Backend boundaries

Solid arrows below represent project references, not network requests. Controllers call application use cases; infrastructure implements the interfaces those use cases need. The API composes the implementations at startup.

```mermaid
flowchart LR
    API["HockeyTrainer.Api\nControllers, auth adapters, middleware\nDependency registration and hosting"]
    Application["HockeyTrainer.Application\nUse cases, validation, transport contracts\nRepository and context interfaces"]
    Infrastructure["HockeyTrainer.Infrastructure\nEF Core context, repositories\nSQLite / PostgreSQL configuration, migrations"]
    Domain["HockeyTrainer.Domain\nEntities and value types"]
    API --> Application
    API --> Infrastructure
    Infrastructure --> Application
    Infrastructure --> Domain
    Application --> Domain
```

The React frontend uses a shared API client boundary and feature components. Editor geometry and history are independent of rendering. Shared SVG components render the editor, saved previews and the drawings used in PDFs.

Content belongs either to a team workspace or the organisation library. Practice plans reference drills in the same workspace, with ordered entries containing duration and practice-specific notes. Copying a complete plan creates a new plan and new drills in the destination, within a transaction. Copies have independent ownership and no update propagation. See [independent copies](independent-copies.md).

## Build, infrastructure and release

Infrastructure and application releases are separate manual workflows. CI builds and tests the combined application and produces a deployable package with database migrations. CI uses an isolated database for testing.

```mermaid
flowchart TB
    Source["Feature branch → pull request → main"]
    CI["Build and test\nBackend, frontend, browser and security checks"]
    Package["Tested application package\nApplication + database migrations"]
    Infra["Manual infrastructure workflow\nBicep preview / apply"]
    Resources["Separate stage and prod infrastructure"]
    Stage["Manual stage release\nDeploy and verify"]
    Prod["Manual prod promotion\nReuse the package verified in stage"]
    Source --> CI --> Package
    Infra --> Resources
    Package --> Stage --> Prod
    Resources -.-> Stage
    Resources -.-> Prod
```

Stage and prod use separate environment configuration and Supabase projects. Infrastructure is defined in Bicep, and deployment authentication uses GitHub Actions OIDC. Database migrations are reviewed and applied through the release workflow. Some external service settings are managed separately from infrastructure code.

## Local development

```mermaid
flowchart LR
    Browser["Browser"] --> Vite["Vite development server"]
    Vite -->|"API proxy"| API[".NET API"]
    API --> SQLite[("Persistent local SQLite file")]
    API -.->|"Optional email sign-in"| Auth["Configured Supabase Auth project"]
```

Local development runs Vite and .NET with persistent SQLite storage. Supabase sign-in can be enabled for local authentication testing. Browser security checks also run against the published combined application.

## Sources in this repository

- [Solution and backend project boundaries](../HockeyTrainer.slnx)
- [API composition, middleware and hosting](../backend/HockeyTrainer.Api/Program.cs)
- [Frontend publishing into the API](../backend/HockeyTrainer.Api/HockeyTrainer.Api.csproj)
- [Infrastructure composition](../iac/main.bicep) and [environment app settings](../iac/modules/application-settings.bicep)
- [CI](../.github/workflows/ci.yml), [infrastructure workflow](../.github/workflows/infrastructure.yml), [release selection](../.github/workflows/release.yml) and [deployment template](../.github/workflows/deploy-application.yml)
- [Publishing and migration packaging](../scripts/publish.sh)
