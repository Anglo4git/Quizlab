export const quizCard = quiz => `<article class="quiz-card">
  <div class="quiz-card-top"><span class="eyebrow">${quiz.category}</span><span class="tag">${quiz.tags[0] || ''}</span></div>
  <h3>${quiz.title}</h3><p>${quiz.description || `${quiz.category} · ${quiz.tags.join(' · ')}`}</p>
  ${quiz.access && quiz.access !== 'public' ? `<span class="tag access-tag">${quiz.access === 'restricted' ? 'Restricted' : 'Sign-in required'}</span>` : ''}
  <a class="button primary" href="#/quiz/${quiz.id}">Start Quiz</a>
</article>`;
