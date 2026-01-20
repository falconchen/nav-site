# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a monorepo containing multiple HTML/CSS projects:

- **nav-site/**: A Cloudflare Workers-based navigation website with user authentication and cloud sync
- **dxy/**: A simple HTML page (legacy)
- **sassy/**: A CSS styling project (legacy)

The primary active project is `nav-site`.

## nav-site Architecture

### Technology Stack

- **Runtime**: Cloudflare Workers with Hono framework
- **Frontend**: Vanilla JavaScript (no frameworks), HTML5, CSS3
- **Storage**: Cloudflare KV for user sessions and data
- **AI**: Cloudflare AI binding for website analysis
- **Build**: esbuild for minification, html-minifier-terser for HTML
- **Testing**: Vitest with @cloudflare/vitest-pool-workers

### Key Components

**Server (`server/`):**
- `server/index.js` - Main Hono app, routes all API endpoints
- `server/api/auth.js` - GitHub OAuth authentication flow
- `server/api/user-data.js` - User data storage and versioning system
- `server/api/analyze.js` - AI-powered website metadata extraction
- `server/api/proxy-image.js` - Image proxy for CORS

**Frontend (`public/`):**
- `public/index.html` - Main HTML structure with inline theme script
- `public/styles.css` - Complete styling with CSS variables for theming
- `public/script.js` - Main application logic (103KB, handles UI interactions)
- `public/data.js` - Default categories and websites data structure
- `public/auth.js` - Frontend authentication and session management
- `public/sync.js` - Cloud sync with version history (direct overwrite, no merge)
- `public/session.js` - Local session management
- `public/category-edit.js` - Category editing UI and logic
- `public/icon-selector.js` - Icon selection modal
- `public/utils.js` - Shared utility functions

### Data Sync System

The sync system uses **direct overwrite** (no complex merging):
- Upload: Overwrites cloud data, creates version snapshot (max 5 versions)
- Download: Overwrites local data from selected version
- Versions use timestamps (`Date.now()`) not incremental integers
- Auto-save triggers 2 seconds after data changes
- Version history stored in KV with 30-day TTL

### Build System

The build process (`build-script.js`):
1. Cleans and creates `dist/` directory
2. Uses esbuild to minify all JS and CSS files
3. Copies `public/img/` to `dist/img/`
4. Minifies HTML with html-minifier-terser
5. Injects build timestamp version (format: `yymmddHHMM` in Asia/Shanghai timezone)
6. Adds build time comment to HTML

## Development Commands

```bash
# Navigate to nav-site directory first
cd nav-site

# Development
npm run dev          # Start Wrangler dev server (localhost:8787)
npm start           # Alias for dev

# Building
npm run build       # Build production assets to dist/

# Testing
npm test            # Run Vitest tests

# Deployment
npm run deploy      # Deploy to Cloudflare Workers production
```

### Environment Configuration

**Development vs Production:**
- Development: Uses `public/` directory, KV namespace for dev
- Production: Uses `dist/` directory, separate KV namespace
- Configured in `wrangler.jsonc` under `env.production`

**Required Secrets:**
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app secret
- `JWT_SECRET` - JWT signing secret

Set secrets with: `wrangler secret put SECRET_NAME`

**Environment Variables:**
- `JWT_EXPIRATION_DAYS` - 3 (dev) / 90 (production)
- `environment` - "development" / "production"

### Wrangler Configuration

Key bindings in `wrangler.jsonc`:
- `ASSETS` - Static file serving from public/ or dist/
- `AI` - Cloudflare AI binding for website analysis
- `USER_SESSIONS` - KV namespace for sessions and data

## Architecture Patterns

### Theme System
- CSS variables driven (`data-theme="light|dark"`)
- Accent color system (`data-accent="blue|purple|green|orange"`)
- Sidebar mode (`data-sidebar="normal|compact"`)
- Inline script in HTML prevents flash of wrong theme
- All preferences stored in localStorage

### Authentication Flow
1. User clicks GitHub login
2. Redirect to `/api/auth/github` (generates state, stores in KV)
3. GitHub callback to `/api/auth/github/callback`
4. Server validates state, exchanges code for token
5. Fetches user info, signs JWT with user data
6. Returns HTML with postMessage to parent window
7. Frontend stores JWT, updates UI

### Data Structure
Categories and websites stored as nested objects:
```javascript
{
  categories: [{
    id: string,
    name: string,
    icon: string,
    order: number,
    websites: [{ id, name, url, icon, description, pinned, dateAdded }]
  }],
  version: timestamp,
  lastUpdated: ISO string
}
```

## File Organization

- Build outputs go to `dist/` (gitignored)
- Static assets in `public/` for dev, `dist/` for production
- Server code never bundled, runs directly on Workers
- No TypeScript - pure JavaScript throughout
- No JSX - vanilla HTML and DOM manipulation

## Important Notes

- The app supports offline-first: all data in localStorage, cloud sync optional
- AI analysis uses Cloudflare's `@cf/meta/llama-3.3-70b-instruct-fp8-fast` model
- Image proxy required because many sites don't allow direct embedding
- Version management maintains only 5 recent versions (30-day TTL)
- Build version format in `index.html`: `<span id="version">dev</span>` → replaced with timestamp
