# Shared Hosting Deployment Guide

This repository is a source repository, not a prebuilt deployment artifact.

That distinction matters:

- `frontend/` is the React/Vite source code for the new UI.
- `frontend/node_modules/` is local-only and is intentionally ignored by Git.
- `public/ui-next/` is the compiled SPA output and is also intentionally ignored by Git.
- The server only needs the PHP runtime plus the compiled public assets.

## What You Deploy vs. What You Keep Local

Keep in GitHub:

- `app/`
- `config/`
- `db/`
- `docs/`
- `frontend/`
- `public/`
- `scripts/`
- `tests/`
- root metadata and documentation files

Do not upload to shared hosting:

- `frontend/`
- `tests/`
- `docs/`
- `logs/`
- local caches, reports, and development artifacts

## Prerequisites

Local machine:

- PHP `8.1+`
- Node.js and npm

Hosting:

- PHP `8.1+`
- Apache-style shared hosting is supported
- Shell access is optional

## 1. Build the New Frontend Locally

The repository does not store `public/ui-next/`, so you must generate it before deployment.

From the project root:

```bash
cd frontend
npm install
npm run build
```

This writes the compiled SPA into:

```text
public/ui-next/
```

## 2. Decide Which Hosting Layout You Will Use

There are two valid deployment layouts.

### Option A. Preferred: the hosting document root points to `public/`

This is the cleanest and safest option.

Upload these directories and files while preserving their structure:

- `app/`
- `config/`
- `db/`
- `scripts/`
- `public/`

If your hosting panel allows it, set the document root to:

```text
.../your-project/public
```

### Option B. Typical shared hosting: only `public_html/` is web-accessible

If you cannot change the document root, use this structure:

```text
home/
  app/
  config/
  db/
  scripts/
  public_html/
```

Copy the contents of `public/` into `public_html/`, not the `public` folder itself.

That means:

- `public/index.php` -> `public_html/index.php`
- `public/api/` -> `public_html/api/`
- `public/ui/` -> `public_html/ui/`
- `public/ui-next/` -> `public_html/ui-next/`
- `public/.htaccess` -> `public_html/.htaccess`

Place these runtime directories next to `public_html/`:

- `app/`
- `config/`
- `db/`
- `scripts/`

This layout is compatible with the current relative PHP includes.

## 3. Files Required in Production

Production needs:

- `app/`
- `config/`
- `db/`
- `scripts/`
- the contents of `public/`
- the generated `public/ui-next/` build

Production does not need:

- `frontend/node_modules/`
- `frontend/src/`
- `tests/`
- `docs/`
- `logs/`
- Playwright artifacts

## 4. Beta UI Behavior

The public router uses a strangler approach:

- default traffic is sent to the legacy UI in `public/ui/`
- adding `?beta=1` enables the new React UI from `public/ui-next/`
- adding `?beta=0` exits the beta ring

Examples:

- `https://example.com/?beta=1`
- `https://example.com/Heritage/public/?beta=1`

If `ui-next` is missing, the beta route returns a `503` and exits the beta cookie automatically.

## 5. Recommended Deployment Checklist

Before upload:

1. Pull the latest source from GitHub.
2. Run the frontend build locally.
3. Confirm that `public/ui-next/index.html` exists.
4. Confirm that `public/ui-next/assets/` contains hashed JS and CSS files.
5. Verify that `frontend/node_modules/` is not being uploaded.

After upload:

1. Open the normal app URL.
2. Open the beta URL with `?beta=1`.
3. Verify that the new UI loads.
4. Submit a real calculation and confirm `POST /api/calc.php` returns `200`.
5. Test `?beta=0` to confirm that legacy fallback still works.

## 6. Quick Manual Smoke Test

Check these URLs after deployment:

- `/`
- `/?beta=1`
- `/?beta=0`
- `/api/roles.php`

Then perform one real calculation through the UI.

## 7. Notes About Composer

The public API bootstraps through:

```text
scripts/calc_runtime.php
```

It supports hosting without Composer by falling back to a minimal PSR-4 autoloader for `App\\`.

That means shared hosting can run this project even if `vendor/` is absent, as long as PHP `8.1+` is available.

## 8. Suggested Workflow From GitHub to Production

Use this workflow every time:

1. Sync the latest source from GitHub.
2. Build the frontend locally.
3. Upload only the production runtime and public assets.
4. Smoke-test both legacy and beta entrypoints.
5. Only then expose the beta URL to real users.
