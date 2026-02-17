/**
 * Project CRUD and upgrade workflow.
 * Projects stored in localStorage via storage.js
 */

function getProjectById(projectId) {
  const projects = getProjects();
  return projects.find((p) => p.id === projectId) || null;
}

function createProjectFromTemplate(templateId, templateVersion, templateDefinition) {
  const projectId = generateId();
  const items = [];
  (templateDefinition.sections || []).forEach((sec) => {
    (sec.items || []).forEach((item) => {
      items.push({
        id: item.id,
        sectionId: sec.id,
        sectionTitle: sec.title || sec.id,
        text: item.text,
        status: 'pending',
        notes: '',
        updated_at: null,
        flagged: false,
        na: false,
        code_ref: item.code_ref || null,
        article: item.article || null,
        comments: item.comments || null,
        details: item.details || item.explanatory_notes || null,
      });
    });
  });

  const project = {
    id: projectId,
    template_id: templateId,
    template_version: templateVersion,
    template_name: templateDefinition.name || templateId,
    created_at: new Date().toISOString(),
    completed_at: null,
    items,
    na_sections: [],
    superseded_by: null,
    upgraded_from: null,
  };

  const projects = getProjects();
  projects.unshift(project);
  setProjects(projects);
  addAuditEntry({ event: 'project_created', project_id: projectId, template_id: templateId, version: templateVersion });
  return project;
}

function updateProject(projectId, updates) {
  const projects = getProjects();
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  projects[idx] = { ...projects[idx], ...updates };
  setProjects(projects);
  return projects[idx];
}

function updateProjectItem(projectId, itemId, data) {
  const project = getProjectById(projectId);
  if (!project || !project.items) return null;
  const item = project.items.find((i) => i.id === itemId);
  if (!item) return null;
  Object.assign(item, data, { updated_at: new Date().toISOString() });
  return updateProject(projectId, { items: project.items });
}

function completeProject(projectId) {
  return updateProject(projectId, { completed_at: new Date().toISOString() });
}

function supersedeProject(oldProjectId, newProjectId) {
  updateProject(oldProjectId, { status: 'superseded', superseded_by: newProjectId });
  addAuditEntry({ event: 'project_superseded', old_id: oldProjectId, new_id: newProjectId });
}

function upgradeProject(oldProjectId, templateId, newVersion, templateDefinition) {
  const newProject = createProjectFromTemplate(templateId, newVersion, templateDefinition);
  newProject.upgraded_from = oldProjectId;
  const projects = getProjects();
  const idx = projects.findIndex((p) => p.id === newProject.id);
  if (idx !== -1) projects[idx] = newProject;
  setProjects(projects);

  supersedeProject(oldProjectId, newProject.id);
  addAuditEntry({
    event: 'project_upgraded',
    old_id: oldProjectId,
    new_id: newProject.id,
    template_id: templateId,
    new_version: newVersion,
  });
  return newProject;
}

function projectStatus(project) {
  if (project.superseded_by) return 'superseded';
  if (project.completed_at) return 'completed';
  return 'active';
}

function countItemsNeedingReview(project) {
  if (!project.items) return 0;
  return project.items.filter((i) => i.status === 'pending' && (i.notes || '').trim()).length;
}

function isSectionNA(project, sectionId) {
  const list = project.na_sections || [];
  return list.indexOf(sectionId) !== -1;
}

function setSectionNA(projectId, sectionId, na) {
  const project = getProjectById(projectId);
  if (!project) return null;
  let list = project.na_sections || [];
  const idx = list.indexOf(sectionId);
  if (na && idx === -1) list = list.concat(sectionId);
  else if (!na && idx !== -1) list = list.slice(0, idx).concat(list.slice(idx + 1));
  return updateProject(projectId, { na_sections: list });
}

function getApplicableCounts(project) {
  if (!project.items) return { total: 0, done: 0 };
  const naSections = project.na_sections || [];
  let total = 0, done = 0;
  project.items.forEach((i) => {
    if (naSections.indexOf(i.sectionId) !== -1 || i.na) return;
    total++;
    if (i.status === 'done') done++;
  });
  return { total, done };
}

function getSectionApplicableCounts(project, sectionId) {
  if (!project.items) return { total: 0, done: 0 };
  const naSections = project.na_sections || [];
  const sectionNA = naSections.indexOf(sectionId) !== -1;
  if (sectionNA) return { total: 0, done: 0 };
  let total = 0, done = 0;
  project.items.forEach((i) => {
    if (i.sectionId !== sectionId || i.na) return;
    total++;
    if (i.status === 'done') done++;
  });
  return { total, done };
}
