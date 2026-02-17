/**
 * App shell: routing, views, KPIs, status line, checklist progress.
 * TUI-inspired interface.
 */

(function () {
  const views = document.querySelectorAll('.tui-view');
  const navLinks = document.querySelectorAll('.tui-nav-item[data-view]');

  function setStatusLine(text) {
    const el = document.getElementById('status-line');
    if (el) el.textContent = text || '';
  }

  function showView(viewId) {
    views.forEach((v) => v.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    navLinks.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-view') === viewId);
    });
    if (viewId === 'dashboard') {
      renderDashboard();
      setStatusLine('Dashboard • [1]–[3] switch view • Click Open on a project');
    } else if (viewId === 'templates') {
      renderTemplates();
      setStatusLine('Templates • Click "Start" to create a new checklist project');
    } else if (viewId === 'projects') {
      renderProjects();
      setStatusLine('Projects • Import / Export all • Click Open to run checklist');
    }
  }

  function getHashView() {
    const hash = (window.location.hash || '#dashboard').slice(1);
    return hash === 'templates' ? 'templates' : hash === 'projects' ? 'projects' : 'dashboard';
  }

  window.addEventListener('hashchange', () => showView(getHashView()));
  navLinks.forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const view = a.getAttribute('data-view');
      window.location.hash = view;
      showView(view);
    });
  });

  // --- Dashboard ---
  function renderDashboard() {
    const projects = getProjects();
    const active = projects.filter((p) => !p.completed_at && !p.superseded_by).length;
    const completed = projects.filter((p) => p.completed_at).length;
    let oldVersion = 0;
    let needsReview = 0;
    fetchTemplatesIndex().then((index) => {
      projects.forEach((p) => {
        if (p.superseded_by) return;
        const t = index.find((x) => x.id === p.template_id);
        if (t && hasNewerVersion(t, p.template_version)) oldVersion++;
        needsReview += countItemsNeedingReview(p);
      });
      document.getElementById('kpi-active').textContent = active;
      document.getElementById('kpi-completed').textContent = completed;
      document.getElementById('kpi-old-version').textContent = oldVersion;
      document.getElementById('kpi-needs-review').textContent = needsReview;
    }).catch(() => {
      document.getElementById('kpi-active').textContent = active;
      document.getElementById('kpi-completed').textContent = completed;
      document.getElementById('kpi-old-version').textContent = '0';
      document.getElementById('kpi-needs-review').textContent = projects.reduce((s, p) => s + countItemsNeedingReview(p), 0);
    });

    const tbody = document.querySelector('#table-projects tbody');
    tbody.innerHTML = '';
    projects.slice(0, 20).forEach((p) => {
      const status = projectStatus(p);
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(p.template_name || p.template_id) + '</td>' +
        '<td>' + escapeHtml(p.template_id) + '</td>' +
        '<td>' + escapeHtml(p.template_version) + '</td>' +
        '<td class="status status-' + status + '">' + status + '</td>' +
        '<td>' + formatDate(p.created_at) + '</td>' +
        '<td><a href="#project/' + p.id + '" class="tui-btn" data-open-project="' + p.id + '">Open</a></td>';
      tbody.appendChild(tr);
    });
    if (projects.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="tui-empty">No projects yet. Go to Templates and start one.</td>';
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('[data-open-project]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('data-open-project');
        window.location.hash = 'project/' + id;
        showView('project-detail');
        openProjectDetail(id);
      });
    });

    fetchTemplatesIndex().then((index) => {
      const updates = [];
      index.forEach((t) => {
        (t.versions || []).slice(0, 2).forEach((v) => {
          updates.push({ name: t.name, version: v.version, published_at: v.published_at });
        });
      });
      updates.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
      const el = document.getElementById('template-updates');
      el.innerHTML = updates.slice(0, 5).map((u) =>
        '<div class="tui-update-item">' + escapeHtml(u.name) + ' ' + escapeHtml(u.version) + ' — ' + formatDate(u.published_at) + '</div>'
      ).join('') || '<div class="tui-empty">No template updates</div>';
    }).catch(() => {
      document.getElementById('template-updates').innerHTML = '<div class="tui-empty">Could not load templates.</div>';
    });

    const audit = getAudit();
    document.getElementById('audit-feed').innerHTML = audit.slice(0, 15).map((e) =>
      '<div class="tui-audit-item">' + formatDate(e.at) + ' — ' + escapeHtml(e.event + (e.message ? ': ' + e.message : '')) + '</div>'
    ).join('') || '<div class="tui-empty">No audit events</div>';
  }

  // --- Templates ---
  function renderTemplates() {
    const container = document.getElementById('templates-list');
    fetchTemplatesIndex().then((index) => {
      container.innerHTML = index.map((t) => {
        const latest = getTemplateLatestVersion(t);
        const versionInfo = latest ? latest.version + ' — ' + (latest.published_at ? formatDate(latest.published_at) : '') : '—';
        return (
          '<div class="tui-card">' +
          '<h3>' + escapeHtml(t.name) + '</h3>' +
          '<div class="tui-meta">ID: ' + escapeHtml(t.id) + ' • Current: ' + escapeHtml(t.current_version || '—') + '</div>' +
          '<div class="tui-versions">Versions: ' + (t.versions || []).map((v) => v.version).join(', ') + '</div>' +
          '<button type="button" class="tui-btn tui-btn-pri" data-start-project="' + escapeHtml(t.id) + '">Start project</button>' +
          '</div>'
        );
      }).join('') || '<div class="tui-empty">No templates</div>';

      container.querySelectorAll('[data-start-project]').forEach((btn) => {
        btn.addEventListener('click', () => startNewProject(btn.getAttribute('data-start-project')));
      });
    }).catch(() => {
      container.innerHTML = '<div class="tui-empty">Failed to load templates. Ensure data/templates/index.json exists.</div>';
    });
  }

  async function startNewProject(templateId) {
    const index = await fetchTemplatesIndex();
    const template = index.find((t) => t.id === templateId);
    if (!template) return;
    const versionInfo = getTemplateLatestVersion(template);
    if (!versionInfo) return;
    const definition = await fetchTemplateVersion(templateId, versionInfo.file);
    const project = createProjectFromTemplate(templateId, versionInfo.version, definition);
    window.location.hash = 'project/' + project.id;
    showView('project-detail');
    openProjectDetail(project.id);
  }

  // --- Projects ---
  function renderProjects() {
    const container = document.getElementById('projects-list');
    const projects = getProjects();
    container.innerHTML = projects.map((p) => {
      const status = projectStatus(p);
      return (
        '<div class="tui-project-card">' +
        '<div class="tui-project-info">' +
        '<strong>' + escapeHtml(p.template_name || p.template_id) + '</strong>' +
        '<span class="tui-meta">' + escapeHtml(p.template_id) + ' ' + escapeHtml(p.template_version) + ' • ' + formatDate(p.created_at) + ' • ' + status + '</span>' +
        '</div>' +
        '<div class="tui-actions">' +
        '<button type="button" class="tui-btn" data-open-project="' + p.id + '">Open</button>' +
        '<button type="button" class="tui-btn tui-btn-alt" data-export-project="' + p.id + '">Export</button>' +
        '</div>' +
        '</div>'
      );
    }).join('') || '<div class="tui-empty">No projects. Start one from Templates.</div>';

    container.querySelectorAll('[data-open-project]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-open-project');
        window.location.hash = 'project/' + id;
        showView('project-detail');
        openProjectDetail(id);
      });
    });
    container.querySelectorAll('[data-export-project]').forEach((btn) => {
      btn.addEventListener('click', () => exportOneProject(btn.getAttribute('data-export-project')));
    });
  }

  // --- Project detail (checklist) ---
  let currentProjectId = null;

  function openProjectDetail(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    currentProjectId = projectId;
    showView('project-detail');
    document.getElementById('project-detail-title').textContent = (project.template_name || project.template_id) + ' — ' + project.template_version;

    fetchTemplatesIndex().then((index) => {
      const template = index.find((t) => t.id === project.template_id);
      const showUpgrade = template && hasNewerVersion(template, project.template_version);
      const btn = document.getElementById('btn-upgrade-project');
      btn.style.display = showUpgrade ? 'inline-block' : 'none';
      if (showUpgrade) {
        btn.onclick = () => doUpgrade(project, template);
      }
    }).catch(() => {
      document.getElementById('btn-upgrade-project').style.display = 'none';
    });

    const body = document.getElementById('checklist-body');
    const sections = (project.items || []).reduce((acc, item) => {
      const sid = item.sectionId || 'default';
      if (!acc[sid]) acc[sid] = [];
      acc[sid].push(item);
      return acc;
    }, {});

    const totalItems = project.items ? project.items.length : 0;
    const doneItems = project.items ? project.items.filter((i) => i.status === 'done').length : 0;
    const progressEl = document.getElementById('checklist-progress');
    if (progressEl) {
      progressEl.innerHTML = '<strong>' + doneItems + '/' + totalItems + '</strong> done';
    }
    setStatusLine('Checklist • ◀ Back to list • Check items, add notes, Export when done');

    body.innerHTML = Object.entries(sections).map(([sectionId, items]) => {
      const sectionTitle = (items[0] && items[0].sectionTitle) || sectionId;
      const sectionDone = items.filter((i) => i.status === 'done').length;
      const sectionTotal = items.length;
      return (
        '<div class="tui-section">' +
        '<div class="tui-section-head">' +
        '<span class="tui-section-title">' + escapeHtml(sectionTitle) + '</span>' +
        '<span class="tui-section-progress">' + sectionDone + '/' + sectionTotal + '</span>' +
        '</div>' +
        items.map((item) => {
          const done = item.status === 'done';
          return (
            '<div class="tui-item' + (done ? ' tui-item-done' : '') + '" data-item-id="' + escapeHtml(item.id) + '">' +
            '<input type="checkbox" class="tui-item-check" ' + (done ? 'checked' : '') + ' data-item-check />' +
            '<div class="tui-item-text">' + escapeHtml(item.text) + '</div>' +
            '<div class="tui-item-time">' + (item.updated_at ? formatDate(item.updated_at) : '') + '</div>' +
            '<div class="tui-item-notes"><textarea placeholder="Notes" data-item-notes>' + escapeHtml(item.notes || '') + '</textarea></div>' +
            '</div>'
          );
        }).join('') +
        '</div>'
      );
    }).join('');

    body.querySelectorAll('[data-item-check]').forEach((cb) => {
      cb.addEventListener('change', function () {
        const item = this.closest('.tui-item');
        const itemId = item.getAttribute('data-item-id');
        updateProjectItem(projectId, itemId, { status: this.checked ? 'done' : 'pending' });
        item.classList.toggle('tui-item-done', this.checked);
        const p = getProjectById(projectId);
        const total = p.items ? p.items.length : 0;
        const done = p.items ? p.items.filter((i) => i.status === 'done').length : 0;
        const head = item.closest('.tui-section').querySelector('.tui-section-progress');
        if (head) {
          const secItems = item.closest('.tui-section').querySelectorAll('.tui-item');
          const secDone = Array.from(secItems).filter((row) => row.querySelector('[data-item-check]').checked).length;
          head.textContent = secDone + '/' + secItems.length;
        }
        const progressEl = document.getElementById('checklist-progress');
        if (progressEl) progressEl.innerHTML = '<strong>' + done + '/' + total + '</strong> done';
      });
    });
    body.querySelectorAll('[data-item-notes]').forEach((ta) => {
      ta.addEventListener('blur', function () {
        const item = this.closest('.tui-item');
        const itemId = item.getAttribute('data-item-id');
        updateProjectItem(projectId, itemId, { notes: this.value });
      });
    });
  }

  async function doUpgrade(project, template) {
    const versionInfo = getTemplateLatestVersion(template);
    if (!versionInfo || versionInfo.version === project.template_version) return;
    const definition = await fetchTemplateVersion(project.template_id, versionInfo.file);
    const newProject = upgradeProject(project.id, project.template_id, versionInfo.version, definition);
    currentProjectId = newProject.id;
    openProjectDetail(newProject.id);
    renderDashboard();
  }

  document.getElementById('btn-back-from-project').addEventListener('click', () => {
    showView('projects');
    window.location.hash = 'projects';
  });
  document.getElementById('btn-export-project').addEventListener('click', () => {
    if (currentProjectId) exportOneProject(currentProjectId);
  });

  function exportOneProject(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aes-project-' + projectId + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatusLine('Exported project to file');
  }

  // --- Export / Import ---
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aes-checklists-export-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatusLine('Exported all data');
  });

  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('input-import').click());
  document.getElementById('input-import').addEventListener('change', function () {
    const file = this.files && this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        importData(json);
        renderProjects();
        renderDashboard();
        showView('projects');
        setStatusLine('Import complete.');
      } catch (e) {
        setStatusLine('Import failed: ' + e.message);
      }
    };
    reader.readAsText(file);
    this.value = '';
  });

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function checkHash() {
    const match = (window.location.hash || '').match(/^#project\/(.+)$/);
    if (match) {
      showView('project-detail');
      openProjectDetail(match[1]);
      return;
    }
    showView(getHashView());
  }

  window.addEventListener('hashchange', checkHash);
  checkHash();
})();
