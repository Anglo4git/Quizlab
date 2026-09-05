import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function renderResult(app, id, router) {
  const a = await appService.getAttempt(id);
  if (!a) { app.innerHTML = '<div class="empty">Result not found.</div>'; return; }
  const quiz = await appService.getQuiz(a.quizId);
  const review = quiz?.review || 'full';
  const pct = a.totalCount ? Math.round(a.correctCount / a.totalCount * 100) : 0;
  const statusLabel = a.status === 'time_expired' ? 'Time expired' : 'Completed';

  let breakdown = '';
  if (review === 'full' && a.randomization?.questionOrder?.length) {
    const ids = a.randomization.questionOrder;
    const questions = await appService.getQuestions(ids);
    const byVersion = new Map(questions.map(q => [q.versionId, q]));
    const rows = ids.map((versionId, i) => {
      const q = byVersion.get(versionId); if (!q) return '';
      const response = a.responses?.[versionId];
      const correct = response?.a === q.correctIndex;
      return `<div class="review-row ${correct ? 'correct' : 'wrong'}"><div class="review-row-top"><strong>Q${i + 1}. ${esc(q.question)}</strong><span class="status ${correct ? 'active' : 'error'}">${correct ? 'Correct' : 'Incorrect'}</span></div>
        <p class="muted">Your answer: ${esc(response ? q.answers[response.a] : 'Not answered')}${!correct ? ` · Correct answer: ${esc(q.answers[q.correctIndex])}` : ''}</p>
        <p class="muted">${esc(q.explanation || '')}</p></div>`;
    }).join('');
    breakdown = `<section class="review-list"><h3>Question review</h3>${rows}</section>`;
  } else if (review === 'limited') {
    breakdown = `<div class="notice">Detailed answer review is limited for this quiz. Your score is shown above; individual questions and explanations are not available.</div>`;
  } else if (review === 'none') {
    breakdown = `<div class="notice">This quiz does not provide a review. Your result has been recorded.</div>`;
  }

  const showScore = review !== 'none';
  app.innerHTML = shell({
    title: 'Your result', subtitle: a.quizTitle, nav: navLinks('/history'),
    content: `<section class="result-card">
      ${showScore ? `<div class="score-ring"><strong>${pct}%</strong><span>${a.correctCount} / ${a.totalCount}</span></div>` : ''}
      <h2>${statusLabel}</h2>
      <p>${a.mode === 'practice' ? 'Review the answers and explanations from your practice attempt.' : 'Your assessment result has been recorded.'}</p>
      <div class="actions"><a class="button secondary" href="#/history">Attempt history</a>${review === 'full' ? `<a class="button secondary" href="#/result/${encodeURIComponent(a.id)}/review">Detailed review</a>` : ''}<a class="button primary" href="#/quiz/${a.quizId}">Retake</a></div>
      ${breakdown}
    </section>`
  });
}
