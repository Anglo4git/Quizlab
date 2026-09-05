import { shell, navLinks } from '../components/layout.js';
import { parseFile, detectDuplicates, validateRow, revalidateDuplicate, buildDraftPayload } from '../services/importParser.js';
import { appService } from '../services/appService.js';

const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

// Correct answer is entered first, matching the convention already used in
// adminQuestions.js, so a reviewer editing an imported row sees the same
// pattern they'd see editing a published question.
function answersToEditableValue(row) {
  const correct = row.answers[row.correctIndex];
  const rest = row.answers.filter((_, i) => i !== row.correctIndex);
  return [correct, ...rest].filter(Boolean).join(', ');
}

export async function renderImport(app){
  app.innerHTML=shell({title:'Import questions',subtitle:'Parse and review rows before they become drafts.',nav:navLinks('/admin'),content:`<section class="import-card"><div class="dropzone"><div class="upload-icon" aria-hidden="true">↑</div><h2>Choose a TSV or XLSX file</h2><p>Required: question, category, tag, explanation, correct_index, answer_1–answer_8.</p><input id="file" type="file" accept=".tsv,.xlsx"/><label for="file" class="button primary">Choose file</label><p id="file-status" class="muted" role="status" aria-live="polite">No file selected.</p></div><div><h3>Validation workflow</h3><div class="pipeline"><span>Parse</span><b>→</b><span>Schema</span><b>→</b><span>Normalize</span><b>→</b><span>Duplicates</span><b>→</b><span>Review</span><b>→</b><span>Draft</span></div><p class="muted">A bad row should never invalidate the whole upload. Valid rows can be corrected or excluded independently.</p></div></section><section id="validation"></section>`});
  document.querySelector('#file').addEventListener('change', async e => {
    const file=e.target.files[0]; if(!file)return; document.querySelector('#file-status').textContent=`Parsing ${file.name}…`;
    const result=await parseFile(file); document.querySelector('#file-status').textContent=`${file.name} • ${result.rows.length} data row(s)`;
    const target=document.querySelector('#validation');
    if(result.errors.length){target.innerHTML=`<div class="error-page"><h3>Cannot validate this file</h3><p>${result.errors.map(esc).join('<br>')}</p></div>`;return;}

    const existingQuestions = await appService.listQuestions();
    detectDuplicates(result.rows, existingQuestions);
    result.rows.forEach(r => { if (r.duplicate?.type === 'exact') r.excluded = true; });

    const dupBadge = r => {
      if (!r.duplicate) return '';
      const pct = Math.round(r.duplicate.score * 100);
      return r.duplicate.type === 'exact'
        ? `<div class="status duplicate-exact">Exact duplicate of ${esc(r.duplicate.against)}</div>`
        : `<div class="status duplicate-potential">Possible duplicate of ${esc(r.duplicate.against)} (${pct}%)</div>`;
    };
    const rowState = r => r.imported ? 'Drafted' : r.duplicate?.type === 'exact' ? 'Duplicate' : r.state;

    const renderCounts = () => `<strong>${result.rows.filter(r=>r.state==='Valid'&&!r.duplicate&&!r.imported).length} valid</strong><span class="muted"> ${result.rows.filter(r=>r.state==='Error').length} errors</span><span class="muted"> ${result.rows.filter(r=>r.duplicate?.type==='exact').length} exact duplicates</span><span class="muted"> ${result.rows.filter(r=>r.duplicate?.type==='potential').length} possible duplicates</span><span class="muted"> ${result.rows.filter(r=>r.imported).length} drafted</span>`;

    function draftsPanelHtml() {
      const drafted = result.rows.filter(r => r.imported);
      if (!drafted.length) return '';
      return `<div class="notice" id="drafts-panel"><strong>${drafted.length} question(s) created as draft.</strong><div class="review-list" style="border:0;padding-top:12px;margin-top:12px">${drafted.map(r => `<div class="review-row"><div class="review-row-top"><strong>${esc(r.question)}</strong><code>${esc(r.imported.question_code)}</code></div><p class="muted">${esc(r.category)} · ${esc(r.tag)} · from row ${r.rowNumber}</p></div>`).join('')}</div><a class="button small secondary" href="#/admin/questions">View in question bank</a></div>`;
    }

    function rowHtml(r, i) {
      return `<tr data-row="${i}" ${r.excluded?'style="opacity:.45"':''}><td>${r.rowNumber}</td><td>${esc(r.question)}</td><td>${esc(r.category)}</td><td>${esc(r.tag)}</td><td>${r.answers.length}</td><td><span class="status ${rowState(r).toLowerCase()}">${rowState(r)}</span>${r.issues.length?`<div class="muted">${r.issues.map(esc).join('<br>')}</div>`:''}${dupBadge(r)}</td><td>${r.imported?'<span class="muted">—</span>':`<button class="button small secondary edit">Edit</button> <button class="button small secondary exclude">${r.excluded?'Include':'Exclude'}</button>`}</td></tr>`;
    }

    function renderTable() {
      target.innerHTML=`<div class="table-card import-results"><div class="section-actions" id="import-counts">${renderCounts()}</div><table><thead><tr><th>Row</th><th>Question</th><th>Category</th><th>Tag</th><th>Answers</th><th>Status</th><th>Action</th></tr></thead><tbody>${result.rows.map(rowHtml).join('')}</tbody></table><div class="section-actions"><button id="import-valid" class="button primary">Import selected valid rows as drafts</button></div></div>${draftsPanelHtml()}`;
      wireRowActions();
      target.querySelector('#import-valid').onclick = async () => {
        const btn = target.querySelector('#import-valid');
        const toImport = result.rows.filter(r => r.state==='Valid' && !r.excluded && !r.imported);
        if (!toImport.length) return;
        btn.disabled = true; btn.textContent = 'Creating drafts…';
        for (const r of toImport) {
          const created = await appService.createQuestion(buildDraftPayload(r));
          r.imported = { question_code: created.question_code, id: created.id };
        }
        renderTable();
      };
    }

    function editRow(i) {
      const r = result.rows[i];
      const tr = target.querySelector(`tr[data-row="${i}"]`);
      tr.innerHTML = `<td>${r.rowNumber}</td><td><input class="edit-question" value="${esc(r.question)}"><textarea class="edit-explanation" rows="2" placeholder="Explanation">${esc(r.explanation||'')}</textarea></td><td><input class="edit-category" value="${esc(r.category)}"></td><td><input class="edit-tag" value="${esc(r.tag||'')}"></td><td colspan="2"><div class="muted" style="margin-bottom:6px">Answers (comma-separated, correct first)</div><input class="edit-answers" value="${esc(answersToEditableValue(r))}"></td><td><button class="button small primary save">Save</button> <button class="button small secondary cancel">Cancel</button></td>`;
      tr.querySelector('.save').onclick = () => {
        const answers = tr.querySelector('.edit-answers').value.split(',').map(x=>x.trim()).filter(Boolean);
        r.question = tr.querySelector('.edit-question').value.trim();
        r.explanation = tr.querySelector('.edit-explanation').value.trim();
        r.category = tr.querySelector('.edit-category').value.trim();
        r.tag = tr.querySelector('.edit-tag').value.trim();
        r.answers = answers;
        r.correctIndex = answers.length ? 0 : NaN;
        validateRow(r);
        revalidateDuplicate(r, result.rows, existingQuestions);
        if (r.duplicate?.type === 'exact') r.excluded = true;
        renderTable();
      };
      tr.querySelector('.cancel').onclick = () => renderTable();
    }

    function wireRowActions() {
      target.querySelectorAll('.exclude').forEach(btn=>btn.onclick=()=>{const row=result.rows[Number(btn.closest('tr').dataset.row)];row.excluded=!row.excluded;renderTable();});
      target.querySelectorAll('.edit').forEach(btn=>btn.onclick=()=>editRow(Number(btn.closest('tr').dataset.row)));
    }

    renderTable();
  });
}
