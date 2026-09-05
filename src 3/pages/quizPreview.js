import { appService } from '../services/appService.js';
import { shell, navLinks } from '../components/layout.js';
import { deriveAvailability } from '../utils/availability.js';
import { evaluateAccess } from '../utils/access.js';
import { store } from '../core/store.js';
export async function renderQuizPreview(app,id,router){
 const quiz=await appService.getQuiz(id); if(!quiz){app.innerHTML='<div class="empty">Quiz not found.</div>';return;}
 const accessLabel=quiz.access==='public'?'Public':quiz.access==='registered'?'Sign-in required':'Restricted';
 const avail=deriveAvailability(quiz);
 const identity=store.session?.identity;
 const hasGroupAccess=(identity && identity!=='guest') ? await appService.isUserAssignedQuiz(identity, quiz.id) : false;
 const access=evaluateAccess(quiz, store.session, store.guest, hasGroupAccess);
 const canStart=avail.visible && access.allowed;
 const notices=[];
 if(!avail.visible) notices.push(`This quiz is not currently open to learners: ${avail.label}.`);
 else notices.push('Questions and randomization details stay hidden until the quiz begins.');
 if(avail.visible) notices.push(access.reason);
 app.innerHTML=shell({title:quiz.title,subtitle:quiz.category+' · '+quiz.tags.join(' · '),nav:navLinks('/quizzes'),content:`<section class="preview-card"><div class="mode-badge">${quiz.mode==='practice'?'Practice':'Assessment'}</div><h2>${quiz.title}</h2><p class="lead">${quiz.description||''}</p><div class="meta-grid"><div><small>Access</small><strong>${accessLabel}</strong></div><div><small>Review</small><strong>${quiz.review}</strong></div><div><small>Timing</small><strong>${quiz.timeLimit?quiz.timeLimit+' min':'Untimed'}</strong></div></div>${notices.map(n=>`<div class="notice">${n}</div>`).join('')}<div class="actions"><a class="button secondary" href="#/quizzes">Back</a><button id="start" class="button primary" ${canStart?'':'disabled'}>Start ${quiz.mode==='practice'?'Practice':'Assessment'}</button></div></section>`});
 document.querySelector('#start').onclick=()=>{
   if(!canStart) return;
   router.navigate(`/quiz/${id}/active`);
 };
}
