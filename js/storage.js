/**
 * Storage layer: localStorage for projects and audit feed.
 * Keys: aes.projects, aes.audit
 */

const STORAGE_KEY_PROJECTS = 'aes.projects';
const STORAGE_KEY_AUDIT = 'aes.audit';
const MAX_AUDIT_ENTRIES = 100;

function getProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('getProjects', e);
    return [];
  }
}

function setProjects(projects) {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
    return true;
  } catch (e) {
    console.error('setProjects', e);
    return false;
  }
}

function getAudit() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function addAuditEntry(entry) {
  const audit = getAudit();
  audit.unshift({
    ...entry,
    at: new Date().toISOString(),
  });
  const trimmed = audit.slice(0, MAX_AUDIT_ENTRIES);
  localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(trimmed));
}

function exportAllData() {
  return {
    exported_at: new Date().toISOString(),
    projects: getProjects(),
    audit: getAudit(),
  };
}

function importData(json) {
  if (!json || !Array.isArray(json.projects)) {
    throw new Error('Invalid import: expected object with projects array');
  }
  setProjects(json.projects);
  if (Array.isArray(json.audit)) {
    localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(json.audit));
  }
  addAuditEntry({ event: 'import', message: 'Data imported from file' });
}

function generateId() {
  return 'proj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}
