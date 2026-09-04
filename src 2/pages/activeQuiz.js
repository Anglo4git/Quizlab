import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';
import { store } from '../core/store.js';
import { deriveAvailability } from '../utils/availability.js';
import { evaluateAccess } from '../utils/access.js';

function remainingMs(attempt) { return attempt.expiresAt ? Math.max(0, attempt.expiresAt - Date.now()) : null; }

export async function renderActiveQuiz(app, id, router) {
  const quiz = await appService.getQuiz(id);
  if (!quiz) { app.innerHTML = '<div class="empty">Quiz unavailable.</div>'; return; }

  let attempt = await appService.getActiveAttempt(id);
  if (!attempt) {
    const avail = deriveAvailability(quiz);
    const identity = store.session?.identity;
    const hasGroupAccess = store.user?.id ? await appService.isUserAssignedQuiz(identity, quiz.id) : false;
    const access = evaluateAccess(quiz, store.session, store.guest, hasGroupAccess);
    if (!avail.visible || !access.allowed) {
      app.innerHTML = `<div class="empty">This quiz isn't currently available to you. <a href="#/quiz/${id}">View quiz details</a>.</div>`;
      return;
    }
    if (access.consumesFreeQuiz) store.guest = await appService.useGuestAllocation();
    if (!store.user?.id) { app.innerHTML = '<div class="empty">Please sign in to start this quiz.</div>'; return; }
    const started = await appService.startAttempt(id);
    attempt = { id: started.attempt_id, quizId: id, quizVersionId: quiz.versionId, status: started.status, expiresAt: started.expires_at ? new Date(started.expires_at).getTime() : null, correctCount: 0, totalCount: started.question_order?.length || 0, randomization: { questionOrder: started.question_order || [], answerMapping: started.answer_mapping || {} }, responses: {}, flags: {} };
  } else {
    attempt.expiresAt = attempt.expiresAt || null;
    attempt.responses ||= {};
    attempt.flags ||= {};
  }

  const rawQuestions = await appService.getAttemptQuestions(attempt.id);
  const byId = new Map(rawQuestions.map(q => [q.versionId, q]));
  const ids = attempt.randomization.questionOrder || [];
  const mapping = ids.map(versionId => {
    const q = byId.get(versionId);
    const displayOrder = attempt.randomization.answerMapping?.[versionId] || q?.answers?.map((_, i) => i) || [];
    return q ? { q, answers: displayOrder.map(index => ({ index, text: q.answers[index] })) } : null;
  }).filter(Boolean);
  if (!mapping.length) { app.innerHTML = '<div class="empty">This quiz has no questions.</div>'; return; }

  store.currentAttempt = attempt;
  let current = Math.max(0, Number(attempt.currentQuestionIndex || 0));

  const finish = async () => {
    clearInterval(window.__quizTimer);
    try {
      await appService.finalizeAttempt(attempt.id, attempt.responses || {});
      router.navigate(`/result/${attempt.id}`);
    } catch (error) {
      app.innerHTML = `<div class="empty">Could not submit this attempt. ${String(error.message || error).replace(/[<>]/g,'')}</div>`;
    }
  };

  const render = async () => {
    const item = mapping[current];
    if (!item) return finish();
    attempt.currentQuestionIndex = current;
    const response = attempt.responses[item.q.versionId];
    const locked = quiz.mode === 'practice' && !!response;
    const feedback = quiz.mode === 'practice' && response && item.q.correctIndex !== null && item.q.correctIndex !== undefined
      ? `<div class="feedback ${response.a === item.q.correctIndex ? 'correct' : 'wrong'}"><strong>${response.a === item.q.correctIndex ? 'Correct' : 'Not quite'}</strong><p>${item.q.explanation || ''}</p></div>` : '';

    app.innerHTML = shell({
      title: quiz.title,
      subtitle: `Question ${current + 1} of ${mapping.length}`,
      nav: navLinks('/quizzes'),
      content: `<section class="quiz-stage">
        <div class="quiz-topline"><span class="mode-badge">${quiz.mode === 'practice' ? 'Practice' : 'Assessment'}</span>${attempt.expiresAt ? '<span id="timer" class="timer">--:--</span>' : ''}</div>
        <div class="question-card"><div class="question-number">${current + 1}</div><h2>${item.q.question}</h2>
          <div class="answers">${item.answers.map(a => `<button class="answer ${response && a.index === response.a ? 'selected' : ''} ${response && quiz.mode === 'practice' && a.index === item.q.correctIndex ? 'correct' : ''}" data-index="${a.index}" ${locked ? 'disabled' : ''}>${a.text}</button>`).join('')}</div>
          ${feedback}
        </div>
        <div class="quiz-controls"><button id="prev" class="button secondary" ${current === 0 || quiz.navigation === 'sequential' ? 'disabled' : ''}>Previous</button>
          <div class="navigator" role="group" aria-label="Question navigator">${mapping.map((x, i) => { const answered = !!attempt.responses[x.q.versionId]; const flagged = !!attempt.flags[x.q.versionId]; return `<button class="dot ${i === current ? 'current' : ''} ${answered ? 'answered' : ''} ${flagged ? 'flagged' : ''}" data-q="${i}" ${quiz.navigation === 'sequential' ? 'disabled' : ''}>${i + 1}</button>`; }).join('')}</div>
          ${quiz.flagging ? `<button id="flag" class="button ghost">${attempt.flags[item.q.versionId] ? 'Unflag' : 'Flag'}</button>` : ''}
          ${current === mapping.length - 1 ? '<button id="finish" class="button primary">Finish</button>' : '<button id="next" class="button primary">Next</button>'}
        </div></section>`
    });

    document.querySelectorAll('.answer').forEach(b => b.onclick = () => {
      if (locked) return;
      attempt.responses[item.q.versionId] = { a: Number(b.dataset.index), s: 1 };
      render();
    });
    document.querySelector('#prev')?.addEventListener('click', () => { current--; render(); });
    document.querySelector('#next')?.addEventListener('click', () => { current++; render(); });
    document.querySelector('#finish')?.addEventListener('click', () => {
      const unanswered = mapping.filter(x => !attempt.responses[x.q.versionId]).length;
      if (unanswered && !confirm(`${unanswered} question${unanswered === 1 ? '' : 's'} unanswered. Finish anyway?`)) return;
      finish();
    });
    document.querySelector('#flag')?.addEventListener('click', () => { attempt.flags[item.q.versionId] = !attempt.flags[item.q.versionId]; render(); });
    document.querySelectorAll('.dot').forEach(b => b.onclick = () => { current = Number(b.dataset.q); render(); });

    if (attempt.expiresAt) {
      const timer = document.querySelector('#timer');
      const tick = async () => {
        const left = remainingMs(attempt);
        timer.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
        if (left <= 0) await finish();
      };
      clearInterval(window.__quizTimer); tick(); window.__quizTimer = setInterval(tick, 500);
    }
  };
  await render();
}
