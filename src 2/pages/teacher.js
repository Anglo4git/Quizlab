import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';
import { parseRoster, matchRosterRows } from '../services/rosterParser.js';

const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fmtDate = iso => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString(); } catch (_) { return iso; } };

// Latest attempt a given user has for a given quiz, used to summarize a
// group member's status for one assignment. Attempts aren't strictly
// ordered by date in the mock store, so pick the most recently updated one.
function latestAttemptFor(userAttempts, quizId) {
  const matches = userAttempts.filter(a => a.quizId === quizId);
  if (!matches.length) return null;
  return matches.reduce((best, a) => (!best || new Date(a.date) > new Date(best.date)) ? a : best, null);
}

export async function renderTeacher(app, router) {
  const settings = await appService.settings();
  if (!settings.teacherModeEnabled) {
    app.innerHTML = shell({
      title: 'Teacher Mode is off', subtitle: 'The multi-teacher workflow is currently hidden.',
      nav: navLinks('/teacher'),
      content: '<div class="empty">An administrator can enable Teacher Mode from the Admin workspace.</div>'
    });
    return;
  }

  const session = await appService.session();
  const teacherId = session.identity;
  const selectedGroupId = new URLSearchParams(location.hash.split('?')[1] || '').get('group');

  const [groups, quizzes, users, myQuestions, myQuizzes] = await Promise.all([
    appService.listGroups(teacherId), appService.listQuizzes(), appService.users(),
    appService.listQuestions({ ownerId: teacherId }), appService.listQuizzes({ ownerId: teacherId })
  ]);
  // "Assign a quiz" intentionally lists every published quiz platform-wide,
  // not just this teacher's own — a teacher can assign admin-authored (or
  // another teacher's published) content to their class, not only what they
  // built themselves in My Quizzes.
  const publishedQuizzes = quizzes.filter(q => q.status === 'published');
  const usersById = new Map(users.map(u => [u.id, u]));
  const allAssignments = await appService.listAssignments({ teacherId });
  const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId) : null;

  let groupDetailHtml = '';
  if (selectedGroup) {
    const assignments = await appService.listAssignments({ groupId: selectedGroup.id });
    const memberAttempts = await Promise.all(selectedGroup.memberIds.map(uid => appService.listAttemptsForUser(uid)));

    const memberRows = selectedGroup.memberIds.length
      ? selectedGroup.memberIds.map(uid => `<div class="picker-row"><span><strong>${esc(usersById.get(uid)?.name || uid)}</strong></span><button class="button small ghost remove-member" data-uid="${esc(uid)}">Remove</button></div>`).join('')
      : '<p class="muted">No members yet — share the join code below.</p>';

    const assignmentRows = assignments.length ? assignments.map(a => {
      const quiz = quizzes.find(q => q.id === a.quizId);
      const resultRows = selectedGroup.memberIds.map((uid, i) => {
        const attempt = latestAttemptFor(memberAttempts[i], a.quizId);
        const name = usersById.get(uid)?.name || uid;
        const cell = !attempt ? '<span class="status">Not started</span>'
          : attempt.status === 'in_progress' ? '<span class="status in_progress">In progress</span>'
          : `<span class="status completed">${attempt.correctCount}/${attempt.totalCount}</span>`;
        return `<tr><td>${esc(name)}</td><td>${cell}</td></tr>`;
      }).join('');
      return `<div class="table-card" style="margin-bottom:14px"><div class="section-actions" style="justify-content:space-between;align-items:center;padding:14px 16px 0">
        <div><strong>${esc(quiz?.title || a.quizId)}</strong>${a.dueAt ? `<div class="muted">Due ${fmtDate(a.dueAt)}</div>` : ''}</div>
        <button class="button small ghost delete-assignment" data-id="${esc(a.id)}">Remove assignment</button>
      </div><table><thead><tr><th>Member</th><th>Result</th></tr></thead><tbody>${resultRows}</tbody></table></div>`;
    }).join('') : '<p class="muted">No quizzes assigned to this class yet.</p>';

    groupDetailHtml = `<section class="builder-card" style="margin-top:20px">
      <div class="builder-head"><div><span class="eyebrow">Class</span><h2>${esc(selectedGroup.name)}</h2><p>Join code <code>${esc(selectedGroup.code)}</code> &middot; ${selectedGroup.memberIds.length} member${selectedGroup.memberIds.length === 1 ? '' : 's'}</p></div>
        <button id="closeGroup" class="button secondary">Close</button></div>
      <fieldset><legend>Members</legend>${memberRows}</fieldset>
      <fieldset><legend>Import roster</legend>
        <p class="muted">Paste one learner per line — an email, or "Name, email" — and we'll match it against existing accounts. This only adds learners who already have an account; it doesn't create new ones.</p>
        <textarea id="rosterText" rows="4" placeholder="alex@quizlab.test&#10;Jamie Rivera, jamie@quizlab.test" style="width:100%;border:1px solid #dfe4ec;border-radius:9px;padding:10px;font:inherit"></textarea>
        <div class="workflow-actions"><button id="previewRoster" class="button secondary" type="button">Preview roster</button></div>
        <div id="rosterPreview"></div>
      </fieldset>
      <fieldset><legend>Assign a quiz</legend>
        <form id="assignForm" class="form-grid">
          <label>Quiz<select name="quizId" required>${publishedQuizzes.length ? publishedQuizzes.map(q => `<option value="${esc(q.id)}">${esc(q.title)}</option>`).join('') : '<option value="">No published quizzes yet</option>'}</select></label>
          <label>Due date (optional)<input name="dueAt" type="date"></label>
        </form>
        <div class="muted" style="margin:12px 0 6px">Classes to assign to</div>
        <div class="check-grid">${groups.map(g => `<label><input type="checkbox" form="assignForm" name="assignGroupIds" value="${esc(g.id)}" ${g.id === selectedGroup.id ? 'checked' : ''}> ${esc(g.name)}</label>`).join('')}</div>
        <div id="assignMsg" role="alert"></div>
        <div class="workflow-actions"><button form="assignForm" class="button primary" type="submit" ${publishedQuizzes.length ? '' : 'disabled'}>Assign to selected classes</button></div>
      </fieldset>
      <h3 style="margin:22px 0 10px">Assignments &amp; results</h3>
      ${assignmentRows}
    </section>`;
  }

  app.innerHTML = shell({
    title: 'Teacher dashboard', subtitle: 'Manage your classes, assignments, and learner results.',
    nav: navLinks('/teacher'),
    content: `<div class="dashboard-grid">
        <div class="admin-card"><span>My Classes</span><strong>${groups.length}</strong><small>Groups you manage</small></div>
        <div class="admin-card"><span>Assignments</span><strong>${allAssignments.length}</strong><small>Quizzes assigned to classes</small></div>
        <div class="admin-card"><span>Total Members</span><strong>${groups.reduce((n, g) => n + g.memberIds.length, 0)}</strong><small>Across all your classes</small></div>
        <a class="admin-card" href="#/teacher/questions"><span>My Questions</span><strong>${myQuestions.length}</strong><small>Your own authored question bank</small></a>
        <a class="admin-card" href="#/teacher/quizzes"><span>My Quizzes</span><strong>${myQuizzes.length}</strong><small>Build and publish your own quizzes</small></a>
      </div>
      <section class="table-card" style="margin-top:20px;padding:18px">
        <div class="section-actions" style="justify-content:space-between;align-items:center;padding:0 0 14px">
          <h3 style="margin:0">My classes</h3>
        </div>
        <form id="createGroupForm" style="display:flex;gap:8px;margin-bottom:16px;max-width:420px">
          <input name="name" aria-label="New class name" placeholder="New class name, e.g. Period 3 English" style="flex:1;border:1px solid #dfe4ec;border-radius:9px;padding:10px;font:inherit" required>
          <button class="button primary" type="submit">Create class</button>
        </form>
        <div id="createGroupMsg" role="alert"></div>
        <div class="dashboard-grid">${groups.length ? groups.map(g => `<div class="admin-card"><span>${esc(g.name)}</span><strong>${g.memberIds.length}</strong><small>Join code: <code>${esc(g.code)}</code></small><div style="display:flex;gap:8px;margin-top:10px"><button class="button small secondary manage-group" data-id="${esc(g.id)}">Manage</button><button class="button small ghost delete-group" data-id="${esc(g.id)}" data-name="${esc(g.name)}">Delete</button></div></div>`).join('') : '<p class="muted">You haven\'t created a class yet.</p>'}</div>
      </section>
      ${groupDetailHtml}`
  });

  document.querySelector('#createGroupForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const msg = document.querySelector('#createGroupMsg');
    const name = new FormData(e.target).get('name')?.trim();
    if (!name) { msg.innerHTML = '<div class="validation-box invalid">Enter a class name.</div>'; return; }
    btn.disabled = true; btn.textContent = 'Creating…';
    await appService.createGroup({ name, teacherId });
    router.renderCurrent();
  };
  document.querySelectorAll('.manage-group').forEach(b => b.onclick = () => {
    location.hash = `/teacher?group=${encodeURIComponent(b.dataset.id)}`;
    router.renderCurrent();
  });
  document.querySelectorAll('.delete-group').forEach(b => b.onclick = async () => {
    if (!confirm(`Delete "${b.dataset.name}"? This also removes every assignment and result for this class. This can't be undone.`)) return;
    await appService.deleteGroup(b.dataset.id);
    if (selectedGroupId === b.dataset.id) location.hash = '/teacher';
    router.renderCurrent();
  });
  document.querySelector('#closeGroup')?.addEventListener('click', () => { location.hash = '/teacher'; router.renderCurrent(); });
  document.querySelector('#assignForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const quizId = fd.get('quizId');
    const groupIds = fd.getAll('assignGroupIds');
    const msg = document.querySelector('#assignMsg');
    if (!quizId) return;
    if (!groupIds.length) { msg.innerHTML = '<div class="validation-box invalid">Select at least one class.</div>'; return; }
    const submitBtn = document.querySelector('#assignForm')?.closest('fieldset')?.querySelector('.workflow-actions .button');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Assigning…'; }
    const dueAt = fd.get('dueAt') ? new Date(fd.get('dueAt')).toISOString() : null;
    await appService.createAssignments({ groupIds, quizId, dueAt, assignedBy: teacherId });
    router.renderCurrent();
  });
  document.querySelectorAll('.delete-assignment').forEach(b => b.onclick = async () => {
    if (!confirm('Remove this assignment? Learners will no longer see it, and their results for it will no longer be tracked here.')) return;
    await appService.deleteAssignment(b.dataset.id);
    router.renderCurrent();
  });
  document.querySelectorAll('.remove-member').forEach(b => b.onclick = async () => {
    if (!confirm('Remove this member from the class? They will lose access to any restricted quizzes assigned only through this class.')) return;
    await appService.removeGroupMember(selectedGroup.id, b.dataset.uid);
    router.renderCurrent();
  });

  // Roster import (handoff item 14): parse the pasted text, match it
  // against known accounts + current membership, and let the teacher add
  // the matched rows in one action. Entirely in-place (no navigation) so
  // the pasted text and preview survive review before committing, the same
  // "review before it becomes real" shape as importPage.js's TSV flow.
  document.querySelector('#previewRoster')?.addEventListener('click', () => {
    const text = document.querySelector('#rosterText').value;
    const { rows, errors } = parseRoster(text);
    const box = document.querySelector('#rosterPreview');
    if (errors.length) { box.innerHTML = `<div class="validation-box invalid">${errors.map(esc).join('<br>')}</div>`; return; }
    matchRosterRows(rows, users, new Set(selectedGroup.memberIds));
    renderRosterPreview(rows);
  });

  function renderRosterPreview(rows) {
    const box = document.querySelector('#rosterPreview');
    const matched = rows.filter(r => r.matchStatus === 'matched');
    box.innerHTML = `<div class="table-card" style="margin-top:12px"><table><thead><tr><th>Row</th><th>Email</th><th>Name</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.rowNumber}</td><td>${esc(r.email || r.raw)}</td><td>${esc(r.userName || r.name || '—')}</td><td><span class="status ${r.statusClass}">${esc(r.statusLabel)}</span>${r.issues.length ? `<div class="muted">${r.issues.map(esc).join('<br>')}</div>` : ''}</td></tr>`).join('')}</tbody></table>
      <div class="section-actions" style="justify-content:flex-start;padding:12px 16px"><button id="addRosterMembers" class="button primary" ${matched.length ? '' : 'disabled'}>Add ${matched.length} member${matched.length === 1 ? '' : 's'}</button></div>
    </div>`;
    document.querySelector('#addRosterMembers')?.addEventListener('click', async () => {
      const btn = document.querySelector('#addRosterMembers');
      btn.disabled = true; btn.textContent = 'Adding…';
      await appService.addGroupMembers(selectedGroup.id, matched.map(r => r.userId));
      router.renderCurrent();
    });
  }
}
