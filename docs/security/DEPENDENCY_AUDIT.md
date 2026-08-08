# Dependency Security Audit

Audit date: 2026-08-07  
Runtime used: Node.js 20.19.4, npm 10.8.2

## Outcome

The baseline audit reported 9 vulnerable packages: 5 moderate, 4 high, 0 critical, and 0 low. Safe remediation reduced this to 2 moderate vulnerable packages, with no high or critical findings. The remaining findings are the two-package React Router 6 chain and require a major migration to React Router 7.18.0 or later.

No forced audit fix, dependency override, React migration, Node upgrade, Supabase change, AI change, or Stripe implementation was performed.

| Audit | Total | Low | Moderate | High | Critical |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before | 9 | 0 | 5 | 4 | 0 |
| After | 2 | 0 | 2 | 0 | 0 |

## Changes made

| Package | Relationship | Before | After | Reason and safety assessment |
| --- | --- | --- | --- | --- |
| `postcss` | Direct development dependency; also shared by Vite/Tailwind tooling | 8.5.15 | 8.5.26 | Compatible patch update; remains Node 20 compatible. |
| `nanoid` | `postcss` transitive dependency | 3.3.15 | 3.3.18 | Lockfile resolution within PostCSS's compatible 3.x range. |
| `brace-expansion` | `eslint-plugin-react` → `minimatch` | 1.1.15 | 1.1.18 | Lockfile resolution within Minimatch's compatible range. |
| `js-yaml` | `eslint` → `@eslint/eslintrc` | 4.2.0 | 4.3.1 | Lockfile resolution within the parent's compatible 4.x range. |
| `dompurify` | `jspdf` optional dependency | 3.4.11 | 3.4.13 | Lockfile resolution within jsPDF's compatible range. |
| `react-quill` | Direct production dependency | 2.0.0 | Removed | Repository-wide import search found no application use. Its Quill tree was absent from the successful build after removal. |
| `quill` | `react-quill` transitive dependency | 1.3.7 | Removed | Removed with the proven-unused direct parent instead of accepting npm's unsafe suggested downgrade. |

`package.json` and `package-lock.json` were updated through npm. No integrity hashes or dependency-tree entries were edited manually.

## Original advisory analysis

### brace-expansion — high — resolved

- Advisories: GHSA-3jxr-9vmj-r5cp (`<1.1.16`), GHSA-mh99-v99m-4gvg (`<1.1.17`), and GHSA-rgw5-rvv9-x895 (`<1.1.18`).
- Installed/fixed: 1.1.15 → 1.1.18.
- Chain: direct dev dependency `eslint-plugin-react@7.37.5` → `minimatch@3.1.5` → `brace-expansion`.
- Functionality: attacker-designed brace patterns can cause excessive expansion, CPU use, or memory exhaustion.
- Story Loom exposure: **DEVELOPMENT/BUILD-ONLY**. This chain is used by lint tooling, not shipped as application runtime code. Story Loom does not lint attacker-supplied patterns. The compatible lockfile update nevertheless removes the risk.

### js-yaml — high — resolved

- Advisories: GHSA-52cp-r559-cp3m (`>=4.0.0 <4.3.0`) and GHSA-5p4m-2wfm-xmqj (`>=4.0.0 <4.3.1`).
- Installed/fixed: 4.2.0 → 4.3.1.
- Chain: direct dev dependency `eslint@9.39.2` → `@eslint/eslintrc@3.3.3` → `js-yaml`.
- Functionality: crafted merge-key chains or `!!omap` values can cause quadratic CPU consumption while parsing YAML.
- Story Loom exposure: **DEVELOPMENT/BUILD-ONLY**. ESLint configuration processing is local tooling and no production endpoint parses user YAML. A compatible lockfile update resolves both findings.

### postcss — high — resolved

- Advisories: GHSA-r28c-9q8g-f849 (`<=8.5.17`) and GHSA-fxqj-rqcc-2cmp (`<=8.5.22`).
- Installed/fixed: 8.5.15 → 8.5.26.
- Chains: direct dev dependency; also `autoprefixer`, `tailwindcss` and its PostCSS plugins, and `vite` → shared `postcss`.
- Functionality: attacker-controlled previous-source-map references can traverse paths and disclose local `.map` files, including when the processing caller omits `from`.
- Story Loom exposure: **DEVELOPMENT/BUILD-ONLY**. PostCSS processes repository-controlled styles during development/build; Story Loom has no production CSS-processing service and does not expose Vite's development server in production. The compatible patch closes the issue.

### nanoid — high — resolved

- Advisories: GHSA-28wg-ghj8-5hjv (`<3.3.16`) and GHSA-2v37-7h3g-55p8 (`<3.3.17`).
- Installed/fixed: 3.3.15 → 3.3.18.
- Chain: `postcss@8.5.15` → `nanoid`; PostCSS is reached through the direct and build-tool chains listed above.
- Functionality: non-secure/custom generators can loop indefinitely for negative or zero sizes.
- Story Loom exposure: **DEVELOPMENT/BUILD-ONLY** in this dependency path. Story Loom does not call Nano ID generators or accept their size from users. The compatible transitive update resolves both findings.

### DOMPurify — moderate — resolved

- Advisories: GHSA-c2j3-45gr-mqc4 (`<=3.4.11`) and GHSA-55q2-fjhq-7xh7 (`<=3.4.12`).
- Installed/fixed: 3.4.11 → 3.4.13.
- Chain: direct runtime dependency `jspdf@4.2.1` → optional `dompurify`.
- Functionality: custom-element and `IN_PLACE` hook behavior could permit sanitization bypass/XSS in specific DOMPurify configurations.
- Story Loom exposure: **PRODUCTION-REACHABLE PACKAGE, VULNERABLE MODE NOT EXERCISED**. The successful production build contains DOMPurify through the lazy-loaded PDF path. Story Loom uses jsPDF to construct a PDF from its story data and does not configure DOMPurify custom-element or `IN_PLACE` hooks. The compatible patch removes the latent exposure.

### quill / react-quill — moderate — resolved by removal

- Advisory: GHSA-4943-9vgg-gr5r (`quill <=1.3.7`). npm attributed the transitive issue to direct `react-quill >=0.0.3` and suggested the breaking downgrade `react-quill@0.0.2`.
- Installed/removed: `react-quill@2.0.0` → removed; `quill@1.3.7` → removed.
- Chain: direct runtime dependency `react-quill` → `quill`.
- Functionality: crafted rich-text content can trigger cross-site scripting in Quill.
- Story Loom exposure before removal: **NOT REACHABLE IN CURRENT STORY LOOM USAGE**. Repository search found no source import, require call, component, or stylesheet use. After removal, tests, lint, and the production build passed, and neither package exists in the dependency tree or bundle. Removal was safer than npm's suggested incompatible downgrade.

### react-router / react-router-dom — moderate — remaining

- Advisories:
  - GHSA-wrjc-x8rr-h8h6: React Router open redirect via backslash in `Link`/`useNavigate`; vulnerable `>=6.0.0 <7.18.0`.
  - GHSA-337j-9hxr-rhxg: constructor injection through `deserializeErrors()` during SSR hydration; vulnerable `>=6.4.0 <7.18.0`.
  - GHSA-jjmj-jmhj-qwj2: React Router DOM open redirect leading to XSS; vulnerable `>=6.30.2 <=6.30.4`.
- Installed: direct `react-router-dom@6.30.4` → transitive `react-router@6.30.4`.
- Fixed release: React Router DOM/React Router 7.18.0 or later. There is no 6.30.5 release. npm's remediation therefore crosses a major-version boundary.
- Production exposure: **PRODUCTION-REACHABLE, CONDITIONALLY MITIGATED** for the redirect findings. The SPA uses `Link`, `Navigate`, and `useNavigate`; however, static application routes supply normal link destinations, and the only query-derived `returnTo` route is restricted to a single-leading-slash same-origin path and explicitly rejects backslashes. A future route accepting untrusted destinations must use the same validation.
- SSR advisory exposure: **NOT REACHABLE IN CURRENT STORY LOOM USAGE**. Story Loom is a client-rendered Vite SPA and does not perform React Router server rendering, hydration-data deserialization, or call `deserializeErrors()`.
- Why unresolved: React Router 7 is a major migration affecting routing behavior and API compatibility. That regression risk is disproportionate in a dependency-hardening phase for an otherwise working SPA. React itself remains on 18.
- Launch decision: **NO, these advisories do not currently block production launch**, provided Story Loom keeps the existing same-origin/backslash rejection for externally influenced navigation and remains a client-rendered SPA. Treat this as conditional: a new unvalidated redirect target or SSR deployment changes the exposure and must trigger immediate reassessment.
- Future action: plan and test a dedicated React Router 6→7.18+ migration before introducing SSR or any additional user-controlled navigation destinations.

## Platform and boundary verification

- Node 20: all changed packages install and execute under Node 20.19.4. PostCSS 8.5.26 supports Node 14 and later; React Router 7.18.0 would also support Node 20 but was intentionally not installed.
- Supabase: `@supabase/supabase-js` remains exactly 2.109.0. Its architecture and Node runtime selection were not changed, and npm reported no advisory in its tree.
- Production bundle: the build succeeds; DOMPurify remains in a jsPDF-related lazy chunk at its patched version. Quill/React Quill are absent. PostCSS, ESLint's YAML parser, and ESLint's brace expansion chain are tooling rather than browser runtime dependencies.
- Security boundaries: the existing 31-test suite covering RLS assumptions, private Storage, cache clearing, Edge Function authentication/ownership, service-role and OpenAI secret isolation, CORS, and AI entitlement boundaries passes unchanged.
- Base44: `@base44/sdk` and `@base44/vite-plugin` remain absent.
- Secrets/configuration: no dependency change added Base44 variables, `OPENAI_API_KEY`, service-role credentials, or Stripe secrets to browser source. No Stripe or OpenAI package/behavior change was made.

## Validation results

- `npm audit`: 2 moderate, 0 high, 0 critical (down from 9 total).
- `npm test`: 31/31 passed.
- `npm run lint`: passed.
- `npm run build`: passed with the existing large-chunk and stale Browserslist-data warnings.
- `npm run typecheck`: remains unsuccessful because of the known project-wide JavaScript/JSX `forwardRef` prop-inference limitation and the existing `ImportMeta.env` declaration issue. No dependency-related or new error category was observed.
- Development smoke test: passed. Vite 6.4.3 started normally, `/login` rendered the Story Loom Kids login form, and there were no missing-module, dependency-crash, or Base44 errors. The console contained only React Router's expected v7 future-flag warnings.
- `git diff --check`: passed.

## Recommendation

Proceed without forcing audit zero. The safely remediated tree has no high or critical advisory. Schedule React Router 7.18+ as a focused, regression-tested future migration, and keep query-derived navigation constrained to validated same-origin application paths until it is complete. This dependency state does not require a Node 22 migration and is suitable for beginning a separate Stripe implementation phase after the final smoke checks pass.
