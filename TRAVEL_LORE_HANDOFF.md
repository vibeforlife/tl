# Travel Lore — Engineering Handoff

Last updated: September 9, 2026

## Project

Travel Lore is a React/Vite/Firebase travel-memory application.

Core product idea:
- Journeys contain entries/memories.
- A journey represents a trip/place/time period.
- The product should feel like a premium digital travel journal rather than a generic SaaS dashboard.

## Current repository

Local project:
`TLore-New`

GitHub:
`https://github.com/vibeforlife/tl`

Primary branch:
`main`

GitHub Pages:
`https://vibeforlife.github.io/tl/`

Vite project-site base is:
`/tl/`

## Architecture

Frontend:
- React
- TypeScript
- Vite

Backend/services:
- Firebase
- Firebase Authentication
- Firestore/services under `src/services/firebase/`

Important source areas:
- `src/features/journeys/`
- `src/services/firebase/`
- `src/types/`
- `src/design/theme.css`

The app is a Vite project and must be built before production deployment.

## Environment / deployment

Local Firebase configuration is supplied through `.env.local`.

The following Firebase variables are configured as GitHub repository secrets for the GitHub Pages Actions build:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

`VITE_MAPBOX_ACCESS_TOKEN` is currently empty locally and was intentionally not added as a GitHub secret.

GitHub Pages deployment uses:
`.github/workflows/deploy-pages.yml`

The workflow:
- checks out the repo
- installs dependencies
- runs the production build
- uploads `dist`
- deploys through GitHub Pages

## Current build status

Production build passes:

`npm run build`

Current Vite warning:
- JavaScript bundle is approximately 927 KB minified.
- This is a performance warning only.
- It is NOT currently a build failure.
- Code splitting/performance optimization can be handled later.

## Design direction — LOCKED

Travel Lore should feel like a premium travel journal.

Visual language:
- deep navy / near-black canvas
- teal for interaction, active states and pathways
- gold for memories, dates and special moments
- coral only as a rare secondary accent
- serif typography for storytelling/titles
- sans-serif typography for UI/metadata
- restrained glow
- restrained glassmorphism
- Travel Lore logo/glyph as a brand signature
- photography should carry emotional weight

Avoid turning the product into:
- generic dark-mode SaaS
- overly glowing cyberpunk UI
- excessive glassmorphism
- excessive decorative effects that compete with the stories

## Journey Home — CURRENT CHECKPOINT

Files changed for the current Journey Home work:

- `src/features/journeys/JourneyHome.tsx`
- `src/features/journeys/CreateJourneyForm.tsx`
- `src/design/theme.css`

Current Journey Home hierarchy:

1. Hero
   - YOUR JOURNEYS
   - "Every place has a story."
   - supporting copy

2. Existing Journeys
   - existing journey cards appear BEFORE Create Journey
   - cards open the selected Journey Detail view

3. Create Journey
   - full-width desktop form
   - journey name
   - place
   - start date
   - end date
   - create button

This ordering is intentional.

## Journey Home visual treatment

Journey Home currently has a CSS-only premium atmospheric treatment.

It includes:
- layered navy/teal radial gradients
- subtle cartographic/topographic contour treatment
- subtle compass/map geometry behind the hero
- restrained gold accenting
- atmospheric depth behind the content
- premium journey cards
- integrated transparent header treatment

No external photographic background asset was introduced.

The intent is to create a richer travel-journal atmosphere without making the page visually noisy.

## Date picker decision

The date fields should NOT be white.

They should match the other dark form fields.

The native calendar icon is the element that needs to remain visible/light against the dark field.

Current implementation:
- `color-scheme: dark`
- dark input background
- light text
- native calendar indicator retained
- teal focus state

Do not revert the date fields to white unless explicitly requested.

## Header / Sign out

The Sign out control previously looked visually disconnected against the dark/light background treatment.

Current treatment:
- transparent header
- understated light metadata styling
- teal hover
- no button-like filled background

Keep it integrated with the header rather than making it look like a separate card/control.

## Journey Detail — PROTECT

Journey Detail currently uses:

`className="journey-home journey-detail"`

This is important.

Journey Home-specific redesign CSS is deliberately scoped with:

`.journey-home:not(.journey-detail)`

This prevents the Journey Home redesign from changing Journey Detail.

The existing Journey Detail river/timeline experience is considered stable.

DO NOT casually rewrite or replace Journey Detail CSS while working on Journey Home.

Before changing shared CSS, verify whether Journey Detail is affected.

## CSS cleanup already completed

Obsolete unscoped Journey Card rules were removed.

The following Journey Home card styling is intentionally scoped:

`.journey-home:not(.journey-detail) .journey-card`

and related selectors.

There should be no obsolete unscoped:
- `.journey-card--button`
- `.journey-card__title`
- `.journey-card__open`

rules remaining in the general CSS.

## Development approach

IMPORTANT:

Do not make speculative large patches.

Before changing code:
1. Inspect the actual current source.
2. Trace the caller/component/service/type relationship.
3. Check relevant CSS cascade and shared selectors.
4. Make the smallest coherent change.
5. Run TypeScript/build validation.
6. Inspect the actual UI.
7. Only then commit.

For CSS changes in particular:
- check selector scope
- check mobile media queries
- check whether Journey Detail shares classes
- avoid leaving duplicate/obsolete rules

The user prefers pasteable Terminal scripts for implementation patches rather than downloadable scripts.

## Completed functionality / current product state

The current product includes the established Journey flow:
- authentication
- Firebase configuration
- journey creation
- journey listing
- journey selection
- Journey Detail
- entry creation/editing/deletion work already established in the project
- entry/memory presentation
- responsive/mobile foundation
- Git/GitHub backup
- GitHub Pages deployment
- Journey Home redesign

Do not assume unfinished functionality is broken simply because it has not been mentioned in the current thread. Inspect the repository before changing established features.

## Current priorities

Recommended next sequence:

### 1. Commit and checkpoint
Complete this handoff commit and push to `main`.

### 2. Journey Home final visual review
Only make further changes if actual browser review identifies a problem.

### 3. Journey Detail final polish
Review the complete Journey Detail experience on desktop and mobile while preserving the stable river/timeline.

### 4. Entry / Memory experience
Focus on making the core storytelling experience exceptional:
- photography/media presentation
- location treatment
- storytelling hierarchy
- entry creation/editing UX
- loading/error/empty states
- premium presentation

### 5. Collaboration
Complete/verify:
- invite/manage collaborators
- owner vs collaborator experience
- permissions
- Firebase security rules
- UI/security agreement

### 6. Navigation / product UX
Review:
- Journey -> Detail -> Entry flow
- back navigation
- headers
- empty states
- loading states
- errors
- destructive actions

### 7. Responsive refinement
Test:
- desktop
- tablet
- mobile
- 100% browser zoom
- 90% browser zoom
- long journeys with many entries

### 8. Product polish
Later:
- animation/motion
- micro-interactions
- accessibility
- typography refinement
- performance/bundle optimization
- final CSS/code cleanup

### 9. Production readiness
Before release:
- Firebase security-rule review
- production configuration
- GitHub Pages regression test
- final build
- final cleanup
- final Git checkpoint

## Important product principle

The core experience is:

Journey -> Entry -> Memory

Make that exceptional before adding lots of secondary features.

The product should feel like a place where someone wants to return to remember a trip, not merely a database for recording trips.

## Current working tree at handoff

Expected modified files before this handoff commit:

- `src/design/theme.css`
- `src/features/journeys/CreateJourneyForm.tsx`
- `src/features/journeys/JourneyHome.tsx`

This handoff document itself will also be added by the checkpoint commit.

## DO NOT

- Do not expose Firebase secrets.
- Do not commit `.env.local`.
- Do not add the Mapbox token unless intentionally configured.
- Do not replace the stable Journey Detail river casually.
- Do not globally alter `.journey-home` styling without checking `.journey-detail`.
- Do not revert the Existing Journeys-before-Create Journey hierarchy.
- Do not make date inputs white; only the native calendar glyph needs to be light.
- Do not introduce a backend/account system beyond the established Firebase architecture without an explicit product decision.
- Do not make broad visual changes without looking at the actual browser result.

