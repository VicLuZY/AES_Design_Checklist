# AES Design Checklist

Static, Bloomberg-style checklist terminal. No backend, no login—pure HTML, CSS, and JavaScript.

## Features

- **Templates**: Versioned JSON files in `data/templates/` (immutable per version).
- **Projects**: Stored in the browser (`localStorage`). Create projects from templates, track items and notes.
- **Upgrade workflow**: When a template has a newer version, upgrade a project; old project is marked superseded, new one keeps lineage.
- **Export / Import**: Export all data or a single project as JSON; import replaces local data.
- **Deploy anywhere**: Open `index.html` locally, or host on any static server / GitHub Pages / Netlify.

## Quick start

1. Open `index.html` in a browser (or serve the folder locally).
2. Go to **Templates** → **Start New Project** on a template.
3. Use **Projects** to open, complete, or export checklists.

## Layout

- **Dashboard**: KPIs (Active, Completed, On Old Version, Needing Review), project activity table, recent template updates, audit feed.
- **Templates**: List of templates; start a new project from any template.
- **Projects**: List of your projects; Open, Export, or (from project detail) **Upgrade to New Version** when available.

## Adding a new template version

1. Copy the current version file, e.g. `electrical-checklist-2023.v1.json` → `electrical-checklist-2023.v2.json`.
2. Edit the new file (content, new items, etc.).
3. Update `data/templates/index.json`: add a new entry under `versions` and set `current_version` to the new version.

The UI will show an **Upgrade to New Version** button for projects still on the old version.

## Deploy

- **Local**: Unzip or clone, open `index.html`.
- **IIS**: Copy files to `C:\inetpub\wwwroot\checklists\`, browse to `http://yourserver/checklists/`.
- **NGINX**: Copy to `/var/www/checklists`, set `root` and `index index.html`, reload.
- **GitHub Pages**: Push to a repo, enable Pages, point to branch/folder.
- **Netlify**: Drag the folder into the Netlify dashboard.

## Data

- **Storage key**: `aes.projects` (and `aes.audit` for local audit events).
- **Export**: Full export includes `projects` and `audit`; single-project export is one project object.
- **Import**: JSON with a `projects` array; optional `audit` array. Replaces current local data.

## Not included (by design)

- No multi-user or shared storage.
- No centralized audit or real-time sync.
- No permissions or auth.

Suitable for single-user or team use with export/import; can be extended later with a REST backend and database without changing the frontend structure.
