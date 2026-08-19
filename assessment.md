## Acdyon Technologies Frontend Challenge

”Build It Like You Mean It”

Acdyon Technologies Engineering

## Why this exists

We don’t want a trivia quiz. We want to watch you think like an engineer for a few hours: get data out of a platform that actively doesn’t want to give it to you, and make a screen a user would actually want to stare at. Two tasks, both shipped by the same person who’ll sit next to you in six months. Have fun with it — we mean that literally, see the bonus round.

## Logistics

- Pick one track: Part 1 (scraper) or Part 2 (home page). Not both. Go deep on the one you pick instead of half-assing two.

- Stack: your call. Use whatever language, framework, or no framework you’re fastest and most honest in. We’re grading judgment, not tool choice.

- AI tools: Allowed. Expected, even. What isn’t allowed: submitting output you can’t explain line-by-line in the follow-up call. See “How we grade” below.

- Submit: deployed URL + GitHub repo link + a 1-page DECISIONS.md, all through the form in “Submission” below.

## 1 Part 1 — Getting Data Out of a Platform That Doesn’t Want You To

We need job listings from sites like LinkedIn, Indeed, Naukri, and Wellfound — none of which offer a free, no-strings API. All of them actively detect and ban bots: fingerprinting headless browsers, rate-limiting by IP, CAPTCHA-walling anything that smells automated. This task isn’t about what you do with the data once you have it. It’s about how you get it out at all, repeatedly, without getting the account or IP burned by Tuesday.

Deliverable: a deployed working demo (any live host — Render, Railway, a VPS, whatever’s free) that actually pulls listings from at least one real source without getting instantly blocked, plus a design document (diagrams welcome) covering:

- 1. Detection surface — what specifically gives an automated client away on a site like this (headless fingerprints, request timing, missing headers, behavioral patterns), and which of those your design accounts for.


- 2. Ingestion strategy — how you pull data while staying under the radar: rotation, pacing, session/identity management, fallback when a source starts blocking you mid-run. What’s your plan B when the primary approach gets shut down in a week?

- 3. Resilience — the source changes its markup overnight, or rate-limits you, or a response comes back empty. What keeps the pipeline running instead of silently failing?

- 4. Where you’d stop — every platform here has terms of service against scraping. Where’s your personal and technical line, and how does the design respect it while still getting the job done?

## Scope guardrail

Run your live demo against one low-risk source — a public job-board RSS/API, or a sandbox you control — not a live LinkedIn account. We want to see the ingestion pattern work end- to-end, not watch you get an account banned or breach a real ToS on our behalf.

## 2 Part 2 — The Premium Home Page

Take an existing product (real or one you invent a believable pitch for) and redesign its home page as if a Product Hunt front page depended on it. The goal is the “wow, I want an account” reaction in the first 3 seconds. This is where we find out who has taste, not just who can center a div.

Deliverable: a working, responsive home page, deployed to a live URL (Vercel, Netlify, GitHub Pages, anything free). Pick whatever ships fastest for you — static HTML/CSS, a component framework, a design tool handoff with real code behind it, doesn’t matter. Include:

- Hero section with a clear value prop and one strong call to action.

- At least one section that shows the product, not just claims about it (a screenshot, a mock dashboard card, a demo interaction — your call).

- A motion or micro-interaction that earns its keep (scroll reveal, hover state, animated stat — not five of them).

- Working at 390px mobile width and 1440px desktop, no horizontal scroll, real dark-mode support if you attempt dark mode at all (all-or-nothing — half-dark is worse than none).

Constraint that separates signal from noise: no fabricated testimonials, fake user counts, or fake logos. If you don’t have real numbers, write copy that’s honest and still compelling. This is the single biggest thing we grade on.

## 3 Written Explanation (DECISIONS.md, 1 page max)

Answer these, briefly:

- 1. Why this ingestion strategy over the obvious alternative you rejected?

- 2. One trade-off you made under the time limit, and what you’d do with a real week.

- 3. Where did you use AI tools, and what did you personally verify or change afterward?

## Submission

Submit everything through this form: https://forms.gle/qeqpHhvYGWA3ftY69 — deployed URL and GitHub repo link. One entry per candidate, whichever track you picked. [URL 🔗](https://forms.gle/qeqpHhvYGWA3ftY69)


## How We Grade

| Axis | What we’re actually looking at |
| --- | --- |
| Systems thinking | Does the ingestion design survive a source detecting and |
|   | blocking it mid-run? |
| UI craft & taste | Does the home page look shipped, not scaffolded — |
|   | spacing, type, motion restraint? |
| Honesty | Did you resist the fake-testimonial trap? Real screen- |
|   | shots/data over invented polish? |
| Ownership | In the follow-up call, can you defend every decision with- |
|   | out “the AI suggested it”? |

## y Bonus round (optional

Hide one easter egg in the home page — a Konami code, a hover secret, whatever. Costs zero grading points if skipped. Costs zero grading points if found. We just like finding them.
