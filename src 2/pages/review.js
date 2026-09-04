import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export async function renderReview(app, id, router) {
  const attempt = await appService.getAttempt(id);
  if (!attempt) { app.innerHTML = '<div class="empty">Review not found.</div>'; return; }

  const quiz = await appService.getQuiz(attempt.quizId);
  if (!quiz) { app.innerHTML = '<div class="empty">Quiz not found.</div>'; return; }
  if (quiz.review !== 'full') {
    app.innerHTML = shell({
      title: 'Review unavailable',
      subtitle: quiz.title,
      nav: navLinks('/history'),
      content: `<div class="empty"><p>This quiz does not allow question-by-question review.</p><a class="button primary" href="#/result/${encodeURIComponent(attempt.id)}">Back to result</a></div>`
    });
    return;
  }

  const order = attempt.randomization?.questionOrder || [];
  const questions = await appService.getQuestions(order);
  const byVersion = new Map(questions.map(q => [q.versionId, q]));
  const items = order.map(versionId => ({ q: byVersion.get(versionId), versionId })).filter(x => x.q);
  if (!items.length) {
    app.innerHTML = shell({ title: 'Detailed review', subtitle: quiz.title, nav: navLinks('/history'), content: '<div class="empty">No reviewable questions were found.</div>' });
    return;
  }

  let current = 0;
  const render = () => {
    const item = items[current];
    const q = item.q;
    const response = attempt.responses?.[item.versionId];
    const answered = Number.isInteger(response?.a);
    const correct = answered && response.a === q.correctIndex;
    app.innerHTML = shell({
      title: 'Detailed review',
      subtitle: `${quiz.title} · Question ${current + 1} of ${items.length}`,
      nav: navLinks('/history'),
      content: `<section class="review-stage">
        <div class="review-stage-head"><a class="button ghost" href="#/result/${encodeURIComponent(attempt.id)}">← Result</a><span class="mode-badge">${quiz.mode === 'practice' ? 'Practice' : 'Assessment'}</span></div>
        <article class="question-card review-question">
          <div class="question-number">${current + 1}</div>
          <h2>${esc(q.question)}</h2>
          <div class="answers">${q.answers.map((answer, i) => {
            const isSelected = answered && response.a === i;
            const isCorrect = i === q.correctIndex;
            const cls = isCorrect ? 'correct' : (isSelected ? 'selected wrong' : '');
            return `<div class="answer review-answer ${cls}"><span>${esc(answer)}</span>${isCorrect ? '<small>Correct answer</small>' : (isSelected ? '<small>Your answer</small>' : '')}</div>`;
          }).join('')}</div>
          <div class="feedback ${correct ? 'correct' : 'wrong'}"><strong>${answered ? (correct ? 'Correct' : 'Incorrect') : 'Not answered'}</strong><p>${esc(q.explanation || 'No explanation was provided.')}</p></div>
        </article>
        <div class="review-controls">
          <button id="prevReview" class="button secondary" ${current === 0 ? 'disabled' : ''}>Previous</button>
          <div class="navigator">${items.map((x, i) => {
            const r = attempt.responses?.[x.versionId];
            const ok = Number.isInteger(r?.a) && r.a === x.q.correctIndex;
            return `<button class="dot ${i === current ? 'current' : ''} ${r ? 'answered' : ''} ${r && ok ? 'correct-dot' : ''}" data-review="${i}" aria-label="Question ${i + 1}${r ? (ok ? ', correct' : ', incorrect') : ', unanswered'}">${i + 1}</button>`;
          }).join('')}</div>
          <button id="nextReview" class="button primary" ${current === items.length - 1 ? 'disabled' : ''}>Next</button>
        </div>
      </section>`
    });
    document.querySelector('#prevReview')?.addEventListener('click', () => { current = clamp(current - 1, 0, items.length - 1); render(); });
    document.querySelector('#nextReview')?.addEventListener('click', () => { current = clamp(current + 1, 0, items.length - 1); render(); });
    document.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => { current = Number(b.dataset.review); render(); }));
  };
  render();
}
