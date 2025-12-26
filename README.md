Islamic Heritage (Tafsir.es initiative)
Islamic inheritance calculator (faraid) implemented as a small PHP core + HTTP API + a vanilla JavaScript UI.

Public demo
https://heritage.tafsir.es

What this repository is
- A PHP inheritance calculation engine driven by a Maliki rulebook (YAML DSL).
- A minimal HTTP API:
  - GET  /api/roles.php
  - POST /api/calc.php
- A browser UI (no build step required) under /ui/ with:
  - Selftest page to validate the API contract against a real deployment.
  - Debug Snapshot tooling to compare “payload built” vs “payload sent” vs “core normalized input”.

Project goals
- Provide a practical, auditable implementation of classical faraid distribution rules.
- Keep the calculation core deterministic and explainable (audit and explain traces).
- Allow a UI to build cases and send a strict, role-based payload to the core without modifying the core.

Important design note (input vs output labels)
- Input roles are strict: heirs[].role must be one of the role IDs returned by /api/roles.php.
- Output may contain normalized group labels (often plural), for example “wives”, “sons”, “daughters”.
  These are group labels in the result and in the core’s normalized input echo; they are not necessarily valid input role IDs.

API overview

1) GET /api/roles.php
Returns the list of supported input role IDs. The UI should treat this list as the source of truth for what can be sent in heirs[].role.

2) POST /api/calc.php
Request JSON (minimum)
{
  "heirs": [
    { "role": "mother", "count": 1 }
  ]
}

Optional fields (if supported by your deployment)
- estate_value: numeric, for monetary totals
- currency: string, for display
- ui_meta: object, for UI-side metadata (not used by the core for fiqh)

Response (high level)
- group_shares: shares by group label
- individual_shares: per-individual shares (when applicable)
- meta and traces: audit / explain / normalization warnings, to help users understand why a share was assigned or why a claimant was blocked (hajb)

UI

Location
- /ui/ is the main UI
- /ui/selftest/ runs a browser-based verification suite against the live backend

What the UI does
- Builds a role-count payload deterministically (no heuristic inference).
- Sends it to /api/calc.php.
- Renders:
  - Group shares (total for the group)
  - Individual shares (what each person in the group receives)
  - A phase breakdown when provided (fixed shares, residual/asaba, awl/radd if applied)
  - Block reasons and warnings from the engine (non-destructive, for clarity)

Selftest
The selftest page is intended to reduce friction when deploying:
- Verifies /api/roles.php status and response shape.
- Verifies /api/calc.php with:
  - a minimal valid payload (expects 200)
  - an invalid payload (expects 400)
  - a roundtrip test that checks:
    - the UI-sent payload matches what the UI built
    - the core normalized input matches the sent payload semantics
    - the UI never sends role IDs outside the role catalog

Rulebook (Maliki)
The Maliki rules are expressed in a YAML DSL described in docs/RULEBOOK.md.
The engine uses this rulebook to apply:
- fixed shares (fard)
- residual distribution (asaba)
- blocking (hajb)
- awl / radd (when applicable according to the rulebook)

Edge Pack M-E1..M-E8 (documented regression scenarios)
These are canonical edge scenarios used to protect correctness over time:

M-E1  Daughter + full sister
      Daughter takes 1/2, full sister takes the residual as asaba.
M-E2  Daughter + son's daughter (with and without wife)
      They complete 2/3; without a male, remaining is redistributed via radd.
M-E3  Sisters with daughters
      Sisters (full/consanguine) become asaba after daughters’ fixed shares.
M-E4  Paternal grandfather vs siblings
      Paternal grandfather absorbs the remainder; siblings are blocked.
M-E5  Descendants or paternal grandfather vs uterine siblings
      Uterine siblings become blocked when descendants or PGF exist.
M-E6  Grandmothers without mother
      Eligible grandmother(s) receive residual via radd (1/1 if alone, 1/2 each if two).
M-E7  More than four wives
      Hard warning; in strict mode the calculation aborts (exit code 2 in the fuzz harness).
M-E8  Umariyya variants
      Classic adjustment (mother receives 1/3 of the remainder) and combinations with daughters or multiple wives.

Fixtures live under tests/fixtures/ME*.json and are exercised by tests/run_min_suite.php.

Fuzz / property testing
There is a fuzz harness used to validate invariants such as:
- Total shares sum to 1
- Non-negative shares
- Determinism
- Key blocking properties (for example male descendants blocking certain collaterals)

Example:
php tests/fuzz/fuzz.php --cases=1000 --seed=42

Documentation index
- docs/ARCHITECTURE.md (high-level structure)
- docs/API_CONTRACT.md (payload and response notes)
- docs/RULEBOOK.md (YAML DSL)
- docs/DEPLOY_SHARED_HOSTING.md (shared hosting ZIP deployment)
- docs/TESTS.md and docs/QA*.md (test harness and manual QA notes)
- docs/LEGACY.md (archived/legacy frontends; not recommended for production)

Contributing
Contributions are welcome, especially:
- Additional canonical fixtures
- Rulebook improvements with supporting references and tests
- UI translations and UX improvements
- Deployment hardening and documentation clarity

Please open an issue first for significant changes to align on scope and fiqh assumptions.

Credits and license
This project is an initiative by Tafsir.es.
License: MIT (ensure the repository includes a LICENSE file with the full text when publishing).
