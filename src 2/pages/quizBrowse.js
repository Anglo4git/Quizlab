import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';
import { quizCard } from '../components/quizCard.js';
import { deriveAvailability } from '../utils/availability.js';

export async function renderQuizBrowse(app) {
  const quizzes = (await appService.listQuizzes()).filter(q => deriveAvailability(q).visible);
  app.innerHTML = shell({title:'Find a quiz', subtitle:'Choose a topic and start practicing.', nav:navLinks('/quizzes'), content:`
    <section class="toolbar"><div class="search-wrap"><span aria-hidden="true">⌕</span><input id="quiz-search" aria-label="Search quizzes, topics or levels" placeholder="Search quizzes, topics or levels…"/></div><div class="filters"><select id="cat" aria-label="Filter by category"><option value="">All categories</option>${[...new Set(quizzes.map(q=>q.category))].map(x=>`<option>${x}</option>`).join('')}</select><select id="level" aria-label="Filter by level"><option value="">All levels</option>${['A1','A2','B1','B2','C1','C2'].map(x=>`<option>${x}</option>`).join('')}</select></div></section>
    <p id="quiz-result-count" class="sr-only" role="status" aria-live="polite"></p>
    <div id="quiz-grid" class="quiz-grid">${quizzes.map(quizCard).join('')}</div>`});
  const render = () => {
    const s=document.querySelector('#quiz-search').value.toLowerCase(), c=document.querySelector('#cat').value, l=document.querySelector('#level').value;
    const matches=quizzes.filter(q=>(!s||`${q.title} ${q.category} ${q.tags.join(' ')}`.toLowerCase().includes(s))&&(!c||q.category===c)&&(!l||q.tags.includes(l)));
    document.querySelector('#quiz-grid').innerHTML=matches.map(quizCard).join('')||'<div class="empty">No quizzes match your search.</div>';
    document.querySelector('#quiz-result-count').textContent=`${matches.length} quiz${matches.length===1?'':'zes'} found.`;
  };
  document.querySelector('#quiz-search').addEventListener('input',render); document.querySelector('#cat').addEventListener('change',render); document.querySelector('#level').addEventListener('change',render);
}
