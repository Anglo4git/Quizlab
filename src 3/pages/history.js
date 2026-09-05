import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';
import { store } from '../core/store.js';

const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Learner-facing "join a class" panel. Only meaningful for a signed-in
// identity — a code redeems into that identity's group memberships, and a
// guest has no persistent identity to attach membership to.
async function classesPanel() {
  const identity = store.session?.identity;
  if (!identity || identity === 'guest') {
    return `<section class="table-card" style="padding:20px;margin-bottom:20px"><h3 style="margin-top:0">My classes</h3><p class="muted">Sign in (switch away from Guest at the top of the page) to join a class with a code from your teacher.</p></section>`;
  }
  const [groups, quizzes] = await Promise.all([appService.listGroupsForMember(identity), appService.listQuizzes()]);
  const quizById = new Map(quizzes.map(q => [q.id, q]));
  const assignmentLists = await Promise.all(groups.map(g => appService.listAssignments({ groupId: g.id })));
  const groupRows = groups.map((g, i) => {
    const asg = assignmentLists[i];
    const quizLinks = asg.length
      ? asg.map(a => { const q = quizById.get(a.quizId); return q ? `<a class="tag" href="#/quiz/${encodeURIComponent(q.id)}">${esc(q.title)}${a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleDateString()}` : ''}</a>` : ''; }).join(' ')
      : '<span class="muted">No quizzes assigned yet.</span>';
    return `<div class="admin-card" style="min-height:auto"><span>${esc(g.name)}</span><div style="margin:6px 0">${quizLinks}</div></div>`;
  }).join('') || '<p class="muted">You haven\'t joined a class yet.</p>';
  return `<section class="table-card" style="padding:20px;margin-bottom:20px">
    <h3 style="margin-top:0">My classes</h3>
    <form id="joinClassForm" style="display:flex;gap:8px;margin-bottom:16px;max-width:360px">
      <input name="code" aria-label="Class join code" placeholder="Enter join code" style="flex:1;border:1px solid #dfe4ec;border-radius:9px;padding:10px;font:inherit;text-transform:uppercase" maxlength="8" required>
      <button class="button primary" type="submit">Join</button>
    </form>
    <div id="joinClassMsg" role="alert"></div>
    <div class="dashboard-grid">${groupRows}</div>
  </section>`;
}

export async function renderHistory(app, router) {
  const attempts = await appService.listAttempts();
  app.innerHTML = shell({
    title: 'Attempt history', subtitle: 'Your recent quiz activity.', nav: navLinks('/history'),
    content: `${await classesPanel()}<section class="table-card"><table><thead><tr><th>Quiz</th><th>Mode</th><th>Date</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody>${attempts.map(a => `<tr><td>${esc(a.quizTitle)}</td><td>${esc(a.mode)}</td><td>${new Date(a.date).toLocaleDateString()}</td><td><span class="status ${a.status}">${a.status.replaceAll('_', ' ')}</span></td><td>${a.status === 'in_progress' ? '—' : `${a.correctCount}/${a.totalCount}`}</td><td>${a.status === 'in_progress' ? `<a class="button small primary" href="#/quiz/${a.quizId}/active">Resume</a>` : `<a class="button small secondary" href="#/result/${a.id}">Review</a>`}</td></tr>`).join('')}</tbody></table></section>`
  });

  const form = app.querySelector('#joinClassForm');
  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      const code = new FormData(form).get('code')?.trim();
      const msg = app.querySelector('#joinClassMsg');
      if (!code) { msg.innerHTML = '<div class="validation-box invalid">Enter a join code.</div>'; return; }
      const btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Joining…';
      try {
        const group = await appService.joinGroupByCode(code, store.user.id);
        msg.innerHTML = `<div class="notice">Joined <strong>${esc(group.name)}</strong>.</div>`;
        await renderHistory(app, router);
      } catch (err) {
        msg.innerHTML = `<div class="validation-box invalid">${esc(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'Join';
      }
    };
  }
}
