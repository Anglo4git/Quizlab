import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';
import { deriveAvailability } from '../utils/availability.js';

const toLocalInputValue = iso => { if (!iso) return ''; const d = new Date(iso); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csv = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean);
const uniq = values => [...new Set(values)];

function levelFromQuestion(q) { return q.tags?.find(t => /^(A1|A2|B1|B2|C1|C2)$/.test(t)) || ''; }
function pickAutomatic(questions, form) {
  const level = form.level;
  const category = form.category;
  const tag = form.tag.trim().toLowerCase();
  const filtered = questions.filter(q => q.status === 'active')
    .filter(q => !category || q.category === category)
    .filter(q => !level || levelFromQuestion(q) === level)
    .filter(q => !tag || (q.tags || []).some(t => t.toLowerCase() === tag));
  return filtered.slice(0, Math.max(1, Number(form.count) || 1)).map(q => q.id);
}

// options:
//   scopeOwnerId — when set, the quiz table/editor is scoped to quizzes owned
//     by this id (a teacher's own authored quizzes); new quizzes are stamped
//     with this ownerId. The question picker and validation rules (active-
//     question eligibility, quiz-code uniqueness) always run against the FULL
//     unscoped question/quiz lists regardless of scope — those are platform-
//     wide constraints, not ownership boundaries, and a scoped teacher still
//     needs to be able to build from the shared active question bank.
//   basePath/navActive — where this page lives and which nav link to highlight.
//   title/subtitle — page heading overrides.
export async function renderAdminQuizzes(app, router, options = {}) {
  const {
    scopeOwnerId = null,
    basePath = '/admin/quizzes',
    navActive = '/admin',
    title = 'Quiz builder',
    subtitle = 'Draft, configure, validate, preview, test, and publish quizzes.'
  } = options;

  const [quizzes, questions] = await Promise.all([appService.listQuizzes(), appService.listQuestions()]);
  const visibleQuizzes = scopeOwnerId ? quizzes.filter(q => q.ownerId === scopeOwnerId) : quizzes;
  const categories = uniq(questions.map(q => q.category).filter(Boolean));
  const levels = ['A1','A2','B1','B2','C1','C2'];
  const editingId = new URLSearchParams(location.hash.split('?')[1] || '').get('edit');
  let editing = editingId ? visibleQuizzes.find(q => q.id === editingId) : null;

  const render = () => {
    app.innerHTML = shell({
      title,
      subtitle,
      nav: navLinks(navActive),
      content: `<div class="builder-layout">
        <section class="table-card">
          <div class="section-actions"><button id="newQuiz" class="button primary">New quiz</button></div>
          <table><thead><tr><th>Quiz</th><th>Mode</th><th>Status</th><th>Availability</th><th>Questions</th><th>Workflow</th></tr></thead><tbody>
          ${visibleQuizzes.map(q => { const avail = deriveAvailability(q); const availClass = avail.state === 'available' ? 'published' : avail.state === 'scheduled' ? 'scheduled' : avail.state === 'closed' ? 'error' : 'draft'; return `<tr><td><strong>${esc(q.title)}</strong><br><code>${esc(q.quiz_code)}</code></td><td>${esc(q.mode)}</td><td><span class="status ${esc(q.status)}">${esc(q.status)}</span></td><td><span class="status ${availClass}">${esc(avail.label)}</span></td><td>${q.questionIds?.length || q.questionCount || 0}</td><td><button class="button small secondary edit-quiz" data-id="${esc(q.id)}">Configure</button> <a class="button small ghost" href="#/quiz/${encodeURIComponent(q.id)}">Preview</a></td></tr>`; }).join('') || `<tr><td colspan="6" class="muted">${scopeOwnerId ? "You haven't created a quiz yet — use \"New quiz\" above to build your first one." : 'No quizzes yet.'}</td></tr>`}
          </tbody></table>
        </section>
        <section class="builder-card">
          ${editing ? `<div class="builder-head"><div><span class="eyebrow">${editing.status}</span><h2>${esc(editing.title)}</h2><p>${esc(editing.quiz_code)}</p></div><button id="closeEditor" class="button secondary">Close</button></div>` : `<div class="builder-head"><div><span class="eyebrow">New draft</span><h2>Create a quiz</h2><p>Choose automatic selection or curate the exact question set.</p></div></div>`}
          ${formMarkup(editing, categories, levels, questions)}
        </section>
      </div>`
    });
    wire();
  };

  const formMarkup = (q, cats, lvls, allQuestions) => {
    const selected = new Set(q?.questionIds || []);
    return `<form id="quizForm">
      <div class="form-grid">
        <label>Title<input name="title" required value="${esc(q?.title || '')}" placeholder="e.g. A2 Travel English"></label>
        <label>Quiz code<input name="quiz_code" required value="${esc(q?.quiz_code || '')}" placeholder="VOC-A2-TRAVEL"></label>
        <label>Mode<select name="mode"><option value="practice" ${q?.mode==='practice'?'selected':''}>Practice</option><option value="assessment" ${q?.mode==='assessment'?'selected':''}>Assessment</option></select></label>
        <label>Access<select name="access"><option value="public" ${q?.access==='public'?'selected':''}>Public</option><option value="registered" ${q?.access==='registered'?'selected':''}>Registered</option><option value="restricted" ${q?.access==='restricted'?'selected':''}>Restricted</option></select></label>
        <label>Review<select name="review"><option value="full" ${q?.review==='full'?'selected':''}>Full</option><option value="limited" ${q?.review==='limited'?'selected':''}>Limited</option><option value="none" ${q?.review==='none'?'selected':''}>None</option></select></label>
        <label>Time limit (minutes)<input name="timeLimit" type="number" min="1" value="${q?.timeLimit ?? ''}" placeholder="Untimed"></label>
        <label>Navigation<select name="navigation"><option value="free" ${(!q?.navigation || q?.navigation==='free')?'selected':''}>Free (jump between questions)</option><option value="sequential" ${q?.navigation==='sequential'?'selected':''}>Sequential (forward only)</option></select></label>
        <label>Category<select name="category"><option value="">Any category</option>${cats.map(c=>`<option ${q?.category===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>
        <label>Tags<input name="tags" value="${esc((q?.tags||[]).join(', '))}" placeholder="A2, Travel"></label>
        <label>Available from<input name="availableFrom" type="datetime-local" value="${esc(toLocalInputValue(q?.availableFrom))}"></label>
        <label>Available until<input name="availableTo" type="datetime-local" value="${esc(toLocalInputValue(q?.availableTo))}"></label>
      </div>
      <label class="full-field">Description<textarea name="description" rows="3" placeholder="What will learners practice?">${esc(q?.description || '')}</textarea></label>
      <fieldset><legend>Question selection</legend>
        <div class="segmented"><label><input type="radio" name="selectionType" value="automatic" ${(!q || q?.selectionRules) ? 'checked':''}> Automatic</label><label><input type="radio" name="selectionType" value="curated" ${q && !q.selectionRules ? 'checked':''}> Curated</label></div>
        <div id="automaticFields" class="selection-panel">
          <div class="form-grid"><label>CEFR level<select name="level"><option value="">Any level</option>${lvls.map(l=>`<option ${q?.selectionRules?.level===l?'selected':''}>${l}</option>`).join('')}</select></label>
          <label>Tag filter<input name="tag" value="${esc(q?.selectionRules?.tag || '')}" placeholder="e.g. Present Simple"></label>
          <label>Question count<input name="count" type="number" min="1" value="${q?.selectionRules?.count || q?.questionCount || 5}"></label></div>
          <p id="autoMatch" class="muted"></p>
        </div>
        <div id="curatedFields" class="selection-panel">
          <div class="question-picker">${allQuestions.filter(x=>x.status!=='deleted').map(x=>`<label class="picker-row"><input type="checkbox" name="questionIds" value="${esc(x.id)}" ${selected.has(x.id)?'checked':''}><span><strong>${esc(x.question_code)}</strong> · ${esc(levelFromQuestion(x))} · ${esc(x.category)}</span><small>${esc(x.question)}</small></label>`).join('')}</div>
        </div>
      </fieldset>
      <fieldset><legend>Behavior</legend><div class="check-grid"><label><input type="checkbox" name="randomizeQuestions" ${q?.randomizeQuestions?'checked':''}> Randomize questions</label><label><input type="checkbox" name="randomizeAnswers" ${q?.randomizeAnswers?'checked':''}> Randomize answers</label><label><input type="checkbox" name="flagging" ${q?.flagging!==false?'checked':''}> Allow flagging</label></div></fieldset>
      <div id="validationBox" class="validation-box" role="status" aria-live="polite"></div>
      <div class="workflow-actions"><button class="button primary" type="submit">Save configuration</button>${q ? `<button id="validateQuiz" class="button secondary" type="button">Validate</button><a class="button secondary" href="#/quiz/${encodeURIComponent(q.id)}">Preview / test</a><button id="publishQuiz" class="button primary" type="button">Publish</button>` : ''}</div>
    </form>`;
  };

  function currentFormData(form) {
    const fd = new FormData(form);
    const selectionType = fd.get('selectionType');
    const base = {
      title: fd.get('title')?.trim(), quiz_code: fd.get('quiz_code')?.trim().toUpperCase(), mode: fd.get('mode'), access: fd.get('access'), review: fd.get('review'),
      timeLimit: fd.get('timeLimit') ? Number(fd.get('timeLimit')) : null, category: fd.get('category'), tags: csv(fd.get('tags')), description: fd.get('description')?.trim(),
      randomizeQuestions: fd.get('randomizeQuestions') === 'on', randomizeAnswers: fd.get('randomizeAnswers') === 'on', flagging: fd.get('flagging') === 'on',
      navigation: fd.get('navigation') === 'sequential' ? 'sequential' : 'free',
      availableFrom: fd.get('availableFrom') ? new Date(fd.get('availableFrom')).toISOString() : null,
      availableTo: fd.get('availableTo') ? new Date(fd.get('availableTo')).toISOString() : null
    };
    // Only stamp ownerId when this page is itself owner-scoped (a teacher's
    // own authoring area). Leaving it out entirely when unscoped (the admin
    // workspace) means editing someone else's quiz there never touches their
    // existing ownerId.
    if (scopeOwnerId) base.ownerId = scopeOwnerId;
    if (selectionType === 'automatic') {
      base.selectionRules = { type:'automatic', category:base.category, level:fd.get('level') || '', tag:fd.get('tag')?.trim() || '', count:Math.max(1, Number(fd.get('count')) || 1) };
      base.questionIds = pickAutomatic(questions, base.selectionRules);
    } else {
      base.questionIds = fd.getAll('questionIds');
      delete base.selectionRules;
    }
    base.questionCount = base.questionIds.length;
    return base;
  }

  function validateDraft(data) {
    const errors = [];
    if (!data.title) errors.push('Title is required.');
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(data.quiz_code || '')) errors.push('Quiz code must use letters, numbers, and hyphens.');
    if (!data.questionIds.length) errors.push('Select at least one active question.');
    if (data.mode === 'assessment' && (!data.timeLimit || data.timeLimit < 1)) errors.push('Assessment quizzes require a positive time limit.');
    if (data.timeLimit && data.timeLimit > 180) errors.push('Time limit cannot exceed 180 minutes.');
    if (data.availableFrom && data.availableTo && Date.parse(data.availableTo) <= Date.parse(data.availableFrom)) errors.push('Available-until must be after available-from.');
    // Active-question eligibility and quiz-code uniqueness are platform-wide
    // constraints, so these always check against the full unscoped lists —
    // never just what's visible in a scoped (teacher) table.
    const active = new Set(questions.filter(q=>q.status==='active').map(q=>q.id));
    const inactive = data.questionIds.filter(id=>!active.has(id));
    if (inactive.length) errors.push(`${inactive.length} selected question(s) are not active.`);
    const duplicateCodes = quizzes.filter(q => q.id !== editing?.id && q.quiz_code === data.quiz_code);
    if (duplicateCodes.length) errors.push(`Quiz code already exists: ${data.quiz_code}.`);
    return errors;
  }

  function updateValidation() {
    const form = document.querySelector('#quizForm'); if (!form) return;
    const data = currentFormData(form); const errors = validateDraft(data);
    const box = document.querySelector('#validationBox');
    box.innerHTML = errors.length ? `<strong>Needs attention</strong><ul>${errors.map(esc).map(x=>`<li>${x}</li>`).join('')}</ul>` : `<strong>Ready</strong><p>${data.questionIds.length} question(s) selected. Configuration passes the frontend validation rules.</p>`;
    box.className = `validation-box ${errors.length ? 'invalid' : 'valid'}`;
    const auto = document.querySelector('#autoMatch'); if (auto) auto.textContent = `${data.questionIds.length} question(s) currently match the automatic rule.`;
  }

  function wire() {
    document.querySelector('#newQuiz')?.addEventListener('click', () => { location.hash=basePath; editing=null; render(); });
    document.querySelector('#closeEditor')?.addEventListener('click', () => { editing=null; location.hash=basePath; render(); });
    document.querySelectorAll('.edit-quiz').forEach(b => b.onclick = () => { editing=visibleQuizzes.find(q=>q.id===b.dataset.id); location.hash=`${basePath}?edit=${encodeURIComponent(editing.id)}`; render(); });
    const form=document.querySelector('#quizForm'); if(!form) return;
    form.addEventListener('input', updateValidation); form.addEventListener('change', updateValidation);
    document.querySelectorAll('input[name="selectionType"]').forEach(r=>r.addEventListener('change', () => { toggleSelection(); updateValidation(); }));
    toggleSelection(); updateValidation();
    form.onsubmit = async e => { e.preventDefault(); const data=currentFormData(form); const errors=validateDraft(data); if(errors.length){updateValidation();return;}
      const submitBtn=form.querySelector('button[type="submit"]'); submitBtn.disabled=true; submitBtn.textContent='Saving…';
      if(editing){ await appService.updateQuiz(editing.id,data); location.hash=`${basePath}?edit=${encodeURIComponent(editing.id)}`; } else { const created=await appService.createQuiz(data); location.hash=`${basePath}?edit=${encodeURIComponent(created.id)}`; } router.renderCurrent();
    };
    document.querySelector('#validateQuiz')?.addEventListener('click', async (e) => { const data=currentFormData(form); const errors=validateDraft(data); if(errors.length){updateValidation();return;} e.target.disabled=true; e.target.textContent='Validating…'; await appService.updateQuiz(editing.id,{...data,status:'draft'}); router.renderCurrent(); });
    document.querySelector('#publishQuiz')?.addEventListener('click', async (e) => {
      const data=currentFormData(form); const errors=validateDraft(data); if(errors.length){updateValidation();return;}
      if(!confirm(`Publish "${data.title}"? It will become visible and startable by learners according to its access and availability settings.`))return;
      e.target.disabled=true; e.target.textContent='Publishing…';
      await appService.updateQuiz(editing.id,{...data,status:'published',publishedAt:new Date().toISOString()}); router.renderCurrent();
    });
  }
  function toggleSelection(){ const type=document.querySelector('input[name="selectionType"]:checked')?.value; document.querySelector('#automaticFields')?.classList.toggle('hidden',type!=='automatic'); document.querySelector('#curatedFields')?.classList.toggle('hidden',type!=='curated'); }
  render();
}
