import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const fmtDate=iso=>{try{return new Date(iso).toLocaleString();}catch(_){return iso||'';}};

function versionRowHtml(q){
  const history=(q.history||[]).slice().reverse();
  const currentRow=`<div class="version-entry version-current"><div><strong>${esc(q.versionId)}</strong> <span class="status active">current</span><div class="muted">${esc(fmtDate(q.updated_at))}</div></div><div class="version-preview">${esc(q.question)}</div></div>`;
  const historyRows=history.map(v=>`<div class="version-entry" data-version="${esc(v.versionId)}"><div><strong>${esc(v.versionId)}</strong><div class="muted">${esc(fmtDate(v.savedAt))} &middot; ${esc(v.note||'Edited')}</div></div><div class="version-preview">${esc(v.question)}</div><button class="button small secondary revert" data-version="${esc(v.versionId)}">Revert to this</button></div>`).join('');
  const empty = history.length ? '' : '<p class="muted">No earlier versions yet — edits create a new version automatically.</p>';
  return `<tr class="history-row" data-history-for="${esc(q.id)}"><td colspan="7"><div class="version-list">${currentRow}${historyRows}${empty}</div></td></tr>`;
}

// options:
//   scopeOwnerId — when set, this page shows/manages only questions owned by
//     this id (a teacher's own authored content) instead of the full bank,
//     and new questions are created with this ownerId. When unset (the admin
//     workspace), the full bank is shown, including teacher-authored content,
//     with an Owner column so admins can see who authored what.
//   basePath/navActive — where this page lives and which nav link to highlight.
//   title/subtitle — page heading overrides.
export async function renderAdminQuestions(app, options = {}){
  const {
    scopeOwnerId = null,
    navActive = '/admin',
    title = 'Question bank',
    subtitle = 'Edit content while preserving stable human-facing question codes.'
  } = options;
  const allowCreate = !!scopeOwnerId;

  const [qs, users] = await Promise.all([
    appService.listQuestions(scopeOwnerId ? { ownerId: scopeOwnerId } : undefined),
    appService.users()
  ]);
  const usersById = new Map(users.map(u => [u.id, u]));
  const ownerLabel = id => id ? (usersById.get(id)?.name || id) : 'Admin';

  app.innerHTML=shell({title,subtitle,nav:navLinks(navActive),content:`<section class="table-card">
    <div class="section-actions" style="justify-content:space-between;align-items:center">
      ${scopeOwnerId ? '<span></span>' : `<a class="button primary" href="#/admin/import">Import questions</a>`}
      ${scopeOwnerId ? '<button id="newQuestion" class="button primary">New question</button>' : ''}
    </div>
    ${allowCreate ? `<div id="createForm" class="hidden" style="padding:0 16px 16px"></div>` : ''}
    <table><thead><tr><th>Code</th><th>Question</th><th>Category</th><th>Tags</th>${scopeOwnerId?'':'<th>Owner</th>'}<th>Status</th><th>Actions</th></tr></thead><tbody>${qs.map(q=>`<tr data-id="${esc(q.id)}"><td><code>${esc(q.question_code)}</code><div class="muted">${esc(q.versionId)}</div></td><td class="q-text">${esc(q.question)}</td><td>${esc(q.category)}</td><td>${esc(q.tags.join(', '))}</td>${scopeOwnerId?'':`<td>${esc(ownerLabel(q.ownerId))}</td>`}<td><select class="q-status" aria-label="Question status for ${esc(q.question_code)}"><option ${q.status==='draft'?'selected':''}>draft</option><option ${q.status==='validated'?'selected':''}>validated</option><option ${q.status==='active'?'selected':''}>active</option><option ${q.status==='deleted'?'selected':''}>deleted</option></select></td><td><button class="button small secondary edit">Edit</button> <button class="button small ghost history">History</button> <button class="button small ghost restore" ${q.status!=='deleted'?'disabled':''}>Restore</button></td></tr>`).join('') || `<tr><td colspan="${scopeOwnerId?6:7}" class="muted">${scopeOwnerId?"You haven't authored any questions yet — use \"New question\" above to add your first one.":'No questions yet.'}</td></tr>`}</tbody></table></section>`});

  if (allowCreate) {
    document.querySelector('#newQuestion')?.addEventListener('click', () => {
      const box = document.querySelector('#createForm');
      const hidden = box.classList.contains('hidden');
      box.classList.toggle('hidden');
      if (!hidden) return;
      box.innerHTML = `<form id="newQuestionForm" class="form-grid" style="padding-top:14px;border-top:1px solid #eef1f5">
        <label class="full-field">Question<input name="question" required placeholder="e.g. She ___ to school every day."></label>
        <label>Category<input name="category" required placeholder="e.g. Grammar"></label>
        <label>Tags<input name="tags" placeholder="e.g. A1"></label>
        <label class="full-field">Explanation<textarea name="explanation" rows="2" placeholder="Why the correct answer is correct"></textarea></label>
        <label class="full-field">Answers (comma-separated, correct answer first)<input name="answers" required placeholder="goes, go, going, went"></label>
        <div class="workflow-actions"><button class="button primary" type="submit">Create draft question</button></div>
      </form><div id="createMsg" role="alert"></div>`;
      const form = box.querySelector('#newQuestionForm');
      form.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const question = fd.get('question')?.trim();
        const category = fd.get('category')?.trim();
        const answers = (fd.get('answers')||'').split(',').map(x=>x.trim()).filter(Boolean);
        const msg = box.querySelector('#createMsg');
        if (!question || !category || answers.length < 2) {
          msg.innerHTML = '<div class="validation-box invalid">A question needs question text, a category, and at least two answers.</div>';
          return;
        }
        const submitBtn = form.querySelector('button[type="submit"]'); submitBtn.disabled=true; submitBtn.textContent='Creating…';
        await appService.createQuestion({
          question, category, tags: (fd.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean),
          explanation: fd.get('explanation')?.trim() || '', answers, correctIndex: 0, ownerId: scopeOwnerId
        });
        renderAdminQuestions(app, options);
      };
    });
  }

  app.querySelectorAll('.q-status').forEach(sel=>sel.onchange=async()=>{
    const prev=sel.dataset.prev||sel.value;
    if(sel.value==='deleted' && !confirm('Mark this question as deleted? It will be hidden from quiz building and question selection until restored.')){sel.value=prev;return;}
    await appService.updateQuestion(sel.closest('tr').dataset.id,{status:sel.value});
    sel.dataset.prev=sel.value;
    renderAdminQuestions(app, options);
  });
  app.querySelectorAll('.q-status').forEach(sel=>sel.dataset.prev=sel.value);
  app.querySelectorAll('.restore').forEach(btn=>btn.onclick=async()=>{if(btn.disabled)return;await appService.updateQuestion(btn.closest('tr').dataset.id,{status:'active'});renderAdminQuestions(app, options);});

  app.querySelectorAll('.edit').forEach(btn=>btn.onclick=async()=>{
    const tr=btn.closest('tr'), id=tr.dataset.id, q=qs.find(x=>x.id===id);
    const ownerCell = scopeOwnerId ? '' : `<td>${esc(ownerLabel(q.ownerId))}</td>`;
    tr.innerHTML=`<td><code>${esc(q.question_code)}</code><div class="muted">${esc(q.versionId)}</div></td><td><input class="edit-question" value="${esc(q.question)}"><textarea class="edit-explanation" rows="2" placeholder="Explanation">${esc(q.explanation||'')}</textarea></td><td><input class="edit-category" value="${esc(q.category)}"></td><td><input class="edit-tags" value="${esc(q.tags.join(', '))}"></td>${ownerCell}<td><span class="status ${q.status}">${q.status}</span></td><td><div class="muted" style="margin-bottom:6px">Answers (comma-separated, correct first)</div><input class="edit-answers" value="${esc(reorderCorrectFirst(q).join(', '))}"><div style="margin-top:8px"><button class="button small primary save">Save</button> <button class="button small secondary cancel">Cancel</button></div></td>`;
    tr.querySelector('.save').onclick=async()=>{
      const questionText=tr.querySelector('.edit-question').value.trim();
      const answers=tr.querySelector('.edit-answers').value.split(',').map(x=>x.trim()).filter(Boolean);
      if(!questionText || answers.length<2){
        alert('A question needs question text and at least two answers before it can be saved.');
        return;
      }
      const saveBtn=tr.querySelector('.save'); saveBtn.disabled=true; saveBtn.textContent='Saving…';
      await appService.updateQuestion(id,{
        question:tr.querySelector('.edit-question').value.trim(),
        explanation:tr.querySelector('.edit-explanation').value.trim(),
        category:tr.querySelector('.edit-category').value.trim(),
        tags:tr.querySelector('.edit-tags').value.split(',').map(x=>x.trim()).filter(Boolean),
        answers: answers.length?answers:q.answers,
        correctIndex: 0
      });
      renderAdminQuestions(app, options);
    };
    tr.querySelector('.cancel').onclick=()=>renderAdminQuestions(app, options);
  });

  app.querySelectorAll('.history').forEach(btn=>btn.onclick=()=>{
    const tr=btn.closest('tr'), id=tr.dataset.id;
    const existing=app.querySelector(`tr.history-row[data-history-for="${CSS.escape(id)}"]`);
    if(existing){existing.remove();return;}
    app.querySelectorAll('tr.history-row').forEach(r=>r.remove());
    const q=qs.find(x=>x.id===id);
    tr.insertAdjacentHTML('afterend', versionRowHtml(q));
    const row=app.querySelector(`tr.history-row[data-history-for="${CSS.escape(id)}"]`);
    row.querySelectorAll('.revert').forEach(rb=>rb.onclick=async()=>{
      if(!confirm(`Revert to version ${rb.dataset.version}? The current content will be saved into history as a new version, and this version's content becomes current.`))return;
      await appService.revertQuestion(id, rb.dataset.version);
      renderAdminQuestions(app, options);
    });
  });
}

function reorderCorrectFirst(q){
  const answers=q.answers.slice();
  const correct=answers[q.correctIndex];
  return [correct, ...answers.filter((_,i)=>i!==q.correctIndex)];
}
