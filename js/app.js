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
      document.getElementById('float-completion-bar').setAttribute('aria-hidden', 'true');
    } else if (viewId === 'templates') {
      renderTemplates();
      setStatusLine('Templates • Click "Start" to create a new checklist project');
      document.getElementById('float-completion-bar').setAttribute('aria-hidden', 'true');
    } else if (viewId === 'projects') {
      renderProjects();
      setStatusLine('Projects • Import / Export all • Click Open to run checklist');
      document.getElementById('float-completion-bar').setAttribute('aria-hidden', 'true');
    } else if (viewId === 'project-detail') {
      document.getElementById('float-completion-bar').setAttribute('aria-hidden', 'false');
    } else if (viewId === 'editor') {
      renderEditor();
      setStatusLine('Editor • Load a template, edit sections/items, Save as revision (name + timestamp)');
      document.getElementById('float-completion-bar').setAttribute('aria-hidden', 'true');
    }
  }

  function getHashView() {
    const hash = (window.location.hash || '#dashboard').slice(1);
    if (hash === 'templates') return 'templates';
    if (hash === 'projects') return 'projects';
    if (hash === 'editor') return 'editor';
    return 'dashboard';
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
  let checklistFilter = { status: 'all', sectionId: '' };

  function getLevelAndXP(project) {
    const { total, done } = getApplicableCounts(project);
    if (total === 0) return { level: 1, xp: 0, pct: 0 };
    const pct = Math.round((done / total) * 100);
    const level = pct >= 100 ? 5 : pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1;
    const naSections = project.na_sections || [];
    const sections = {};
    (project.items || []).forEach((i) => {
      if (i.na || naSections.indexOf(i.sectionId) !== -1) return;
      sections[i.sectionId] = sections[i.sectionId] || { total: 0, done: 0 };
      sections[i.sectionId].total++;
      if (i.status === 'done') sections[i.sectionId].done++;
    });
    let xp = done * 10;
    Object.keys(sections).forEach((sid) => {
      const s = sections[sid];
      if (s.total > 0 && s.done === s.total) xp += 50;
    });
    return { level: level, xp: xp, pct: pct };
  }

  function showToast(msg, type) {
    const el = document.getElementById('game-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-toast game-toast-show' + (type ? ' game-toast-' + type : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.className = 'game-toast';
    }, 2500);
  }

  function updateFloatBar(projectId) {
    const bar = document.getElementById('float-completion-bar');
    const fill = document.getElementById('float-bar-fill');
    const text = document.getElementById('float-bar-text');
    const project = getProjectById(projectId);
    if (!project || !project.items) return;
    const { total, done } = getApplicableCounts(project);
    const { level, xp, pct } = getLevelAndXP(project);
    fill.style.width = pct + '%';
    const levelLabel = pct >= 100 ? 'Complete!' : 'Lv.' + level + ' • ' + pct + '%';
    text.textContent = done + ' / ' + total + ' done • ' + levelLabel + ' • ' + xp + ' XP';
  }

  function updateGameStats(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    const { total, done } = getApplicableCounts(project);
    const { level, xp, pct } = getLevelAndXP(project);
    const levelEl = document.getElementById('game-level');
    const xpEl = document.getElementById('game-xp');
    const progEl = document.getElementById('checklist-progress');
    if (levelEl) levelEl.textContent = pct >= 100 ? '★' : 'Lv.' + level;
    if (xpEl) xpEl.textContent = xp + ' XP';
    if (progEl) progEl.innerHTML = '<strong>' + done + '/' + total + '</strong> applicable';
  }

  function applyChecklistFilter() {
    const status = checklistFilter.status;
    const sectionId = checklistFilter.sectionId;
    const body = document.getElementById('checklist-body');
    if (!body) return;
    body.querySelectorAll('.tui-section').forEach((sec) => {
      const sid = sec.getAttribute('data-section-id') || '';
      const sectionMatch = !sectionId || sid === sectionId;
      let anyVisible = false;
      sec.querySelectorAll('.tui-item').forEach((row) => {
        const flagged = row.getAttribute('data-flagged') === 'true';
        const done = row.querySelector('[data-item-check]').checked;
        const statusMatch = status === 'all' ||
          (status === 'flagged' && flagged) ||
          (status === 'pending' && !done) ||
          (status === 'done' && done);
        const show = sectionMatch && statusMatch;
        row.classList.toggle('tui-item-hidden', !show);
        if (show) anyVisible = true;
      });
      sec.classList.toggle('tui-section-hidden', !sectionMatch || !anyVisible);
    });
  }

  function openProjectDetail(projectId) {
    const project = getProjectById(projectId);
    if (!project) return;
    currentProjectId = projectId;
    checklistFilter = { status: 'all', sectionId: '' };
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

    const { total: totalApplicable, done: doneApplicable } = getApplicableCounts(project);
    updateGameStats(projectId);
    setStatusLine('Checklist • Mark items/sections N/A so they don\'t count • Level up as you complete!');
    updateFloatBar(projectId);
    document.getElementById('float-completion-bar').setAttribute('aria-hidden', 'false');

    const naSections = project.na_sections || [];
    body.innerHTML = Object.entries(sections).map(([sectionId, items]) => {
      const sectionNA = naSections.indexOf(sectionId) !== -1;
      const sectionTitle = (items[0] && items[0].sectionTitle) || sectionId;
      const secCounts = getSectionApplicableCounts(project, sectionId);
      return (
        '<div class="tui-section' + (sectionNA ? ' tui-section-na' : '') + '" id="section-' + escapeHtml(sectionId) + '" data-section-id="' + escapeHtml(sectionId) + '" data-section-na="' + (sectionNA ? 'true' : 'false') + '">' +
        '<div class="tui-section-head">' +
        '<span class="tui-section-title">' + escapeHtml(sectionTitle) + '</span>' +
        '<span class="tui-section-progress">' + secCounts.done + '/' + secCounts.total + '</span>' +
        '<button type="button" class="tui-section-na-btn" data-section-na-btn="' + escapeHtml(sectionId) + '" title="Mark entire section N/A">' + (sectionNA ? 'Restore section' : 'N/A section') + '</button>' +
        '</div>' +
        items.map((item) => {
          const done = item.status === 'done';
          const flagged = !!item.flagged;
          const na = !!item.na;
          const hasDetails = !!(item.code_ref || item.article || item.comments || item.details);
          const detailsHtml = hasDetails ? (
            '<div class="tui-item-details" data-item-details>' +
            (item.code_ref ? '<div class="tui-detail-row"><span class="tui-detail-label">Code:</span> ' + escapeHtml(item.code_ref) + '</div>' : '') +
            (item.article ? '<div class="tui-detail-row"><span class="tui-detail-label">Article:</span> ' + escapeHtml(item.article) + '</div>' : '') +
            (item.comments ? '<div class="tui-detail-row"><span class="tui-detail-label">Comments:</span> ' + escapeHtml(item.comments) + '</div>' : '') +
            (item.details ? '<div class="tui-detail-row tui-detail-notes"><span class="tui-detail-label">Notes:</span> ' + escapeHtml(item.details) + '</div>' : '') +
            '</div>'
          ) : '';
          return (
            '<div class="tui-item' + (done ? ' tui-item-done' : '') + (flagged ? ' tui-item-flagged' : '') + (na ? ' tui-item-na' : '') + '" data-item-id="' + escapeHtml(item.id) + '" data-flagged="' + (flagged ? 'true' : 'false') + '" data-status="' + (done ? 'done' : 'pending') + '" data-na="' + (na ? 'true' : 'false') + '">' +
            '<input type="checkbox" class="tui-item-check" ' + (done ? 'checked' : '') + ' data-item-check ' + (na ? 'disabled' : '') + ' />' +
            '<button type="button" class="tui-item-flag" data-item-flag title="Flag">' + (flagged ? '★' : '☆') + '</button>' +
            '<button type="button" class="tui-item-na-btn" data-item-na title="Not applicable">' + (na ? 'N/A' : '—') + '</button>' +
            '<div class="tui-item-text' + (hasDetails ? ' tui-item-expandable' : '') + '" data-item-expand="' + (hasDetails ? 'true' : 'false') + '">' + (hasDetails ? '<span class="tui-expand-icon">▶</span> ' : '') + escapeHtml(item.text) + '</div>' +
            '<div class="tui-item-time">' + (item.updated_at ? formatDate(item.updated_at) : '') + '</div>' +
            detailsHtml +
            '<div class="tui-item-notes"><textarea placeholder="Notes" data-item-notes>' + escapeHtml(item.notes || '') + '</textarea></div>' +
            '</div>'
          );
        }).join('') +
        '</div>'
      );
    }).join('');

    const navList = document.getElementById('checklist-nav-list');
    navList.innerHTML = Object.entries(sections).map(([sectionId, items]) => {
      const sectionTitle = (items[0] && items[0].sectionTitle) || sectionId;
      const secCounts = getSectionApplicableCounts(project, sectionId);
      const sectionNA = naSections.indexOf(sectionId) !== -1;
      return '<a class="tui-nav-link' + (sectionNA ? ' tui-nav-link-na' : '') + '" href="#section-' + escapeHtml(sectionId) + '">' + escapeHtml(sectionTitle) + ' <span class="tui-nav-count">' + secCounts.done + '/' + secCounts.total + '</span></a>';
    }).join('');

    const sectionSelect = document.getElementById('filter-section');
    sectionSelect.innerHTML = '<option value="">All sections</option>' + Object.entries(sections).map(([sectionId, items]) => {
      const sectionTitle = (items[0] && items[0].sectionTitle) || sectionId;
      return '<option value="' + escapeHtml(sectionId) + '">' + escapeHtml(sectionTitle) + '</option>';
    }).join('');

    navList.querySelectorAll('.tui-nav-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    document.querySelectorAll('#checklist-filters .tui-filter-btn').forEach((btn) => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#checklist-filters .tui-filter-btn').forEach((b) => b.classList.remove('active'));
        this.classList.add('active');
        checklistFilter.status = this.getAttribute('data-filter');
        applyChecklistFilter();
      });
    });
    sectionSelect.addEventListener('change', function () {
      checklistFilter.sectionId = this.value || '';
      applyChecklistFilter();
    });

    body.querySelectorAll('[data-item-check]').forEach((cb) => {
      cb.addEventListener('change', function () {
        const item = this.closest('.tui-item');
        const itemId = item.getAttribute('data-item-id');
        updateProjectItem(projectId, itemId, { status: this.checked ? 'done' : 'pending' });
        item.classList.toggle('tui-item-done', this.checked);
        item.setAttribute('data-status', this.checked ? 'done' : 'pending');
        const p = getProjectById(projectId);
        const total = p.items ? p.items.length : 0;
        const done = p.items ? p.items.filter((i) => i.status === 'done').length : 0;
        const head = item.closest('.tui-section');
        if (head) {
          const secItems = head.querySelectorAll('.tui-item');
          const secDone = Array.from(secItems).filter((row) => row.querySelector('[data-item-check]').checked).length;
          const prog = head.querySelector('.tui-section-progress');
          if (prog) prog.textContent = secDone + '/' + secItems.length;
        }
        const progressEl = document.getElementById('checklist-progress');
        if (progressEl) progressEl.innerHTML = '<strong>' + done + '/' + total + '</strong> done';
        updateFloatBar(projectId);
        applyChecklistFilter();
      });
    });

    body.querySelectorAll('[data-item-flag]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const item = this.closest('.tui-item');
        const itemId = item.getAttribute('data-item-id');
        const project = getProjectById(projectId);
        const it = project.items.find((i) => i.id === itemId);
        const next = !it.flagged;
        updateProjectItem(projectId, itemId, { flagged: next });
        item.classList.toggle('tui-item-flagged', next);
        item.setAttribute('data-flagged', next ? 'true' : 'false');
        this.textContent = next ? '★' : '☆';
        applyChecklistFilter();
      });
    });

    body.querySelectorAll('[data-item-notes]').forEach((ta) => {
      ta.addEventListener('blur', function () {
        const item = this.closest('.tui-item');
        const itemId = item.getAttribute('data-item-id');
        updateProjectItem(projectId, itemId, { notes: this.value });
      });
    });

    body.querySelectorAll('[data-item-expand="true"]').forEach((el) => {
      el.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('textarea')) return;
        const item = this.closest('.tui-item');
        const details = item.querySelector('[data-item-details]');
        if (!details) return;
        item.classList.toggle('tui-item-expanded');
        const icon = this.querySelector('.tui-expand-icon');
        if (icon) icon.textContent = item.classList.contains('tui-item-expanded') ? '▼' : '▶';
      });
    });

    body.querySelectorAll('[data-section-na-btn]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const sectionId = this.getAttribute('data-section-na-btn');
        const project = getProjectById(projectId);
        const isNA = isSectionNA(project, sectionId);
        setSectionNA(projectId, sectionId, !isNA);
        const section = document.getElementById('section-' + sectionId);
        if (section) {
          section.classList.toggle('tui-section-na', !isNA);
          section.setAttribute('data-section-na', !isNA ? 'true' : 'false');
        }
        this.textContent = isNA ? 'N/A section' : 'Restore section';
        const p = getProjectById(projectId);
        navList.innerHTML = Object.entries(sections).map(([sid, items]) => {
          const st = (items[0] && items[0].sectionTitle) || sid;
          const sc = getSectionApplicableCounts(p, sid);
          const sna = (p.na_sections || []).indexOf(sid) !== -1;
          return '<a class="tui-nav-link' + (sna ? ' tui-nav-link-na' : '') + '" href="#section-' + escapeHtml(sid) + '">' + escapeHtml(st) + ' <span class="tui-nav-count">' + sc.done + '/' + sc.total + '</span></a>';
        }).join('');
        navList.querySelectorAll('.tui-nav-link').forEach((a) => {
          a.addEventListener('click', (e) => { e.preventDefault(); const id = a.getAttribute('href').slice(1); const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        });
        updateGameStats(projectId);
        updateFloatBar(projectId);
      });
    });

    body.querySelectorAll('[data-item-na]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const item = this.closest('.tui-item');
        const itemId = item.getAttribute('data-item-id');
        const project = getProjectById(projectId);
        const it = project.items.find((i) => i.id === itemId);
        const next = !it.na;
        updateProjectItem(projectId, itemId, { na: next });
        item.classList.toggle('tui-item-na', next);
        item.setAttribute('data-na', next ? 'true' : 'false');
        item.querySelector('[data-item-check]').disabled = next;
        this.textContent = next ? 'N/A' : '—';
        const head = item.closest('.tui-section');
        if (head) {
          const secId = head.getAttribute('data-section-id');
          const sc = getSectionApplicableCounts(getProjectById(projectId), secId);
          const prog = head.querySelector('.tui-section-progress');
          if (prog) prog.textContent = sc.done + '/' + sc.total;
        }
        updateGameStats(projectId);
        updateFloatBar(projectId);
        applyChecklistFilter();
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

  // --- Editor: load template, edit, save as revision ---
  let editorDraft = null;
  let editorTemplateId = null;
  let editorCurrentVersion = null;

  function renderEditor() {
    const tplSelect = document.getElementById('editor-template-select');
    const verSelect = document.getElementById('editor-version-select');
    const loadBtn = document.getElementById('editor-load-btn');
    const saveBtn = document.getElementById('editor-save-revision-btn');
    if (!tplSelect) return;
    fetchTemplatesIndex().then((index) => {
      tplSelect.innerHTML = '<option value="">— Select template —</option>' + index.map((t) => '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + '</option>').join('');
      tplSelect.addEventListener('change', function () {
        const id = this.value;
        verSelect.innerHTML = '<option value="">—</option>';
        editorDraft = null;
        saveBtn.disabled = true;
        if (!id) return;
        const t = index.find((x) => x.id === id);
        if (t && t.versions && t.versions.length) {
          verSelect.innerHTML = t.versions.map((v) => '<option value="' + escapeHtml(v.file) + '">' + escapeHtml(v.version) + '</option>').join('');
        }
      });
      verSelect.addEventListener('change', function () { editorDraft = null; saveBtn.disabled = true; });
    }).catch(() => { tplSelect.innerHTML = '<option value="">Failed to load index</option>'; });

    loadBtn.addEventListener('click', async function () {
      const tplId = tplSelect.value;
      const file = verSelect.value;
      if (!tplId || !file) { setStatusLine('Select template and version first.'); return; }
      try {
        const def = await fetchTemplateVersion(tplId, file);
        editorDraft = JSON.parse(JSON.stringify(def));
        editorTemplateId = tplId;
        editorCurrentVersion = def.version || 'v1';
        renderEditorTree();
        saveBtn.disabled = false;
        setStatusLine('Template loaded. Edit below, then Save as revision.');
      } catch (e) {
        setStatusLine('Load failed: ' + e.message);
      }
    });

    saveBtn.addEventListener('click', function () {
      if (!editorDraft) return;
      const modal = document.getElementById('editor-save-modal');
      document.getElementById('editor-name-input').value = '';
      document.getElementById('editor-timestamp-input').value = new Date().toISOString().slice(0, 19).replace('T', ' ');
      document.getElementById('editor-changelog-input').value = '';
      modal.hidden = false;
    });

    document.getElementById('editor-modal-cancel').addEventListener('click', () => {
      document.getElementById('editor-save-modal').hidden = true;
    });
    document.getElementById('editor-modal-backdrop').addEventListener('click', () => {
      document.getElementById('editor-save-modal').hidden = true;
    });
    document.getElementById('editor-modal-download').addEventListener('click', function () {
      const name = (document.getElementById('editor-name-input').value || '').trim();
      const timestamp = (document.getElementById('editor-timestamp-input').value || '').trim();
      const changelog = (document.getElementById('editor-changelog-input').value || '').trim();
      if (!name) { setStatusLine('Enter editor name.'); return; }
      const nextVer = nextVersionNumber(editorCurrentVersion);
      const fileName = editorTemplateId + '.' + nextVer + '.json';
      editorDraft.version = nextVer;
      const blob = new Blob([JSON.stringify(editorDraft, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      const indexEntry = '\n  {\n    "version": "' + nextVer + '",\n    "file": "' + fileName + '",\n    "published_at": "' + new Date().toISOString() + '",\n    "changelog": "By ' + name + (changelog ? ': ' + changelog : '') + '"\n  }';
      setStatusLine('Downloaded ' + fileName + '. Add to data/templates/ and add this to the template\'s versions in index.json:' + indexEntry);
      document.getElementById('editor-save-modal').hidden = true;
    });
  }

  function nextVersionNumber(current) {
    const m = (current || 'v1').match(/^v(\d+)$/i);
    return 'v' + (m ? parseInt(m[1], 10) + 1 : 1);
  }

  function renderEditorTree() {
    const tree = document.getElementById('editor-tree');
    if (!tree || !editorDraft || !editorDraft.sections) return;
    tree.innerHTML = editorDraft.sections.map((sec, sIdx) => (
      '<div class="tui-editor-section" data-section-idx="' + sIdx + '">' +
      '<div class="tui-editor-section-head">' +
      '<input type="text" class="tui-editor-input" data-sec-title value="' + escapeHtml(sec.title || '') + '" placeholder="Section title" />' +
      '<input type="text" class="tui-editor-input tui-editor-id" data-sec-id value="' + escapeHtml(sec.id || '') + '" placeholder="id" />' +
      '<button type="button" class="tui-btn tui-editor-rm" data-remove-section title="Remove section">×</button>' +
      '</div>' +
      '<div class="tui-editor-items">' +
      (sec.items || []).map((item, iIdx) => (
        '<div class="tui-editor-item" data-item-idx="' + iIdx + '">' +
        '<input type="text" class="tui-editor-input" data-item-text value="' + escapeHtml(item.text || '') + '" placeholder="Item text" />' +
        '<input type="text" class="tui-editor-input tui-editor-small" data-item-code value="' + escapeHtml(item.code_ref || '') + '" placeholder="Code ref" />' +
        '<input type="text" class="tui-editor-input tui-editor-small" data-item-details value="' + escapeHtml(item.details || item.comments || '') + '" placeholder="Details / notes" />' +
        '<button type="button" class="tui-btn tui-editor-rm" data-remove-item title="Remove item">×</button>' +
        '</div>'
      )).join('') +
      '</div>' +
      '<button type="button" class="tui-btn tui-btn-alt tui-editor-add-item" data-add-item data-section-idx="' + sIdx + '">+ Item</button>' +
      '</div>'
    )).join('') +
    '<button type="button" class="tui-btn tui-btn-pri" id="editor-add-section">+ Section</button>';

    tree.querySelectorAll('[data-sec-title]').forEach((inp) => {
      inp.addEventListener('change', function () {
        const idx = parseInt(this.closest('[data-section-idx]').getAttribute('data-section-idx'), 10);
        editorDraft.sections[idx].title = this.value;
      });
    });
    tree.querySelectorAll('[data-sec-id]').forEach((inp) => {
      inp.addEventListener('change', function () {
        const idx = parseInt(this.closest('[data-section-idx]').getAttribute('data-section-idx'), 10);
        editorDraft.sections[idx].id = this.value || editorDraft.sections[idx].id;
      });
    });
    tree.querySelectorAll('[data-item-text]').forEach((inp) => {
      inp.addEventListener('change', function () {
        const sec = this.closest('[data-section-idx]');
        const sIdx = parseInt(sec.getAttribute('data-section-idx'), 10);
        const iIdx = parseInt(this.closest('[data-item-idx]').getAttribute('data-item-idx'), 10);
        editorDraft.sections[sIdx].items[iIdx].text = this.value;
      });
    });
    tree.querySelectorAll('[data-item-code]').forEach((inp) => {
      inp.addEventListener('change', function () {
        const sec = this.closest('[data-section-idx]');
        const sIdx = parseInt(sec.getAttribute('data-section-idx'), 10);
        const iIdx = parseInt(this.closest('[data-item-idx]').getAttribute('data-item-idx'), 10);
        editorDraft.sections[sIdx].items[iIdx].code_ref = this.value || null;
      });
    });
    tree.querySelectorAll('[data-item-details]').forEach((inp) => {
      inp.addEventListener('change', function () {
        const sec = this.closest('[data-section-idx]');
        const sIdx = parseInt(sec.getAttribute('data-section-idx'), 10);
        const iIdx = parseInt(this.closest('[data-item-idx]').getAttribute('data-item-idx'), 10);
        editorDraft.sections[sIdx].items[iIdx].details = this.value || null;
      });
    });
    tree.querySelectorAll('[data-remove-section]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const idx = parseInt(this.closest('[data-section-idx]').getAttribute('data-section-idx'), 10);
        editorDraft.sections.splice(idx, 1);
        renderEditorTree();
      });
    });
    tree.querySelectorAll('[data-remove-item]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const sec = this.closest('[data-section-idx]');
        const sIdx = parseInt(sec.getAttribute('data-section-idx'), 10);
        const iIdx = parseInt(this.closest('[data-item-idx]').getAttribute('data-item-idx'), 10);
        editorDraft.sections[sIdx].items.splice(iIdx, 1);
        renderEditorTree();
      });
    });
    tree.querySelectorAll('[data-add-item]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const sIdx = parseInt(this.getAttribute('data-section-idx'), 10);
        const sec = editorDraft.sections[sIdx];
        const newId = 'item-' + sIdx + '-' + (sec.items.length + 1);
        sec.items = sec.items || [];
        sec.items.push({ id: newId, text: '', type: 'checkbox' });
        renderEditorTree();
      });
    });
    document.getElementById('editor-add-section').addEventListener('click', function () {
      const newId = 'sec-' + (editorDraft.sections.length + 1);
      editorDraft.sections.push({ id: newId, title: 'New section', items: [] });
      renderEditorTree();
    });
  }

  window.addEventListener('hashchange', checkHash);
  checkHash();
})();
