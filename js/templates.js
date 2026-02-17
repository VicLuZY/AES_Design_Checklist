/**
 * Load templates from versioned JSON files.
 * data/templates/index.json + data/templates/<template>.<version>.json
 */

const TEMPLATES_INDEX = 'data/templates/index.json';
const TEMPLATES_BASE = 'data/templates/';

let templatesIndexCache = null;

async function fetchTemplatesIndex() {
  if (templatesIndexCache) return templatesIndexCache;
  const res = await fetch(TEMPLATES_INDEX);
  if (!res.ok) throw new Error('Failed to load templates index');
  templatesIndexCache = await res.json();
  return templatesIndexCache;
}

async function fetchTemplateVersion(templateId, versionFile) {
  const url = TEMPLATES_BASE + versionFile;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load template: ' + versionFile);
  return res.json();
}

function getTemplateLatestVersion(template) {
  if (!template.versions || template.versions.length === 0) return null;
  const current = template.current_version;
  const v = template.versions.find((x) => x.version === current);
  return v || template.versions[template.versions.length - 1];
}

function getTemplateVersionInfo(template, version) {
  return template.versions.find((v) => v.version === version) || null;
}

function hasNewerVersion(template, currentVersion) {
  const latest = getTemplateLatestVersion(template);
  if (!latest) return false;
  const cur = template.versions.findIndex((v) => v.version === currentVersion);
  const lat = template.versions.findIndex((v) => v.version === latest.version);
  return lat > cur;
}
