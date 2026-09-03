import './styles.css';
import { Router } from './core/router.js';
import { store } from './core/store.js';
import { appService } from './services/appService.js';
import { renderQuizBrowse } from './pages/quizBrowse.js';
import { renderQuizPreview } from './pages/quizPreview.js';
import { renderActiveQuiz } from './pages/activeQuiz.js';
import { renderResult } from './pages/result.js';
import { renderHistory } from './pages/history.js';
import { renderAdmin } from './pages/admin.js';
import { renderAdminQuestions } from './pages/adminQuestions.js';
import { renderImport } from './pages/importPage.js';
import { renderAdminQuizzes } from './pages/adminQuizzes.js';
import { renderTeacher } from './pages/teacher.js';
import { renderReview } from './pages/review.js';
import { renderAuth } from './pages/auth.js';

const app=document.querySelector('#app'); const router=new Router(path=>render(path));
async function loadSession(){
  store.session=await appService.session();
  store.user=await appService.currentUser();
  store.guest=await appService.guestState();
}
function wireShell(){
  const sel=app.querySelector('#session-switch');
  if(!sel)return;
  sel.onclick=async()=>{await appService.setSession('guest');await loadSession();router.navigate('/quizzes');};
}
async function init(){await loadSession();store.teacherModeEnabled=(await appService.settings()).teacherModeEnabled;router.renderCurrent()}
async function render(rawPath){
 try{
  // Strip any `?query` before route matching so pages that stash UI state
  // in the hash query (e.g. adminQuizzes.js's `?edit=id`, teacher.js's
  // `?group=id`) still resolve to their route on a hashchange navigation —
  // otherwise an exact-string route match never matches a hash with a
  // query string attached and every such navigation 404s.
  const path = rawPath.split('?')[0];
  const identity = store.session?.identity || 'guest';
  const isAdmin = store.user?.role === 'admin';
  const isTeacher = store.user?.role === 'teacher' || isAdmin;
  if(path==='/admin' || path.startsWith('/admin/')) {
    if(!isAdmin) { app.innerHTML='<div class="empty"><h2>Admin access required</h2><p>Switch to the Admin identity to open this workspace.</p><a class="button primary" href="#/quizzes">Back to quizzes</a></div>'; return; }
  }
  if((path==='/teacher' || path.startsWith('/teacher/')) && !isTeacher) {
    app.innerHTML='<div class="empty"><h2>Teacher access required</h2><p>Switch to the Teacher or Admin identity to open this workspace.</p><a class="button primary" href="#/quizzes">Back to quizzes</a></div>'; return;
  }
  if(path==='/') return router.navigate('/quizzes');
  if(path==='/quizzes'){await renderQuizBrowse(app);wireShell();return;}
  if(path==='/history'){await renderHistory(app,router);wireShell();return;}
  if(path==='/admin'){await renderAdmin(app);wireShell();return;}
  if(path==='/admin/questions'){await renderAdminQuestions(app);wireShell();return;}
  if(path==='/admin/import'){await renderImport(app);wireShell();return;}
  if(path==='/admin/quizzes'){await renderAdminQuizzes(app,router);wireShell();return;}
  if(path==='/teacher'){await renderTeacher(app,router);wireShell();return;}
  if(path==='/teacher/questions'){await renderAdminQuestions(app,{scopeOwnerId:identity,basePath:'/teacher/questions',navActive:'/teacher',title:'My questions',subtitle:'Author and manage your own question bank — separate from the admin-authored bank.'});wireShell();return;}
  if(path==='/teacher/quizzes'){await renderAdminQuizzes(app,router,{scopeOwnerId:identity,basePath:'/teacher/quizzes',navActive:'/teacher',title:'My quizzes',subtitle:'Build and publish your own quizzes, then assign them to your classes.'});wireShell();return;}
  let m=path.match(/^\/quiz\/([^/]+)\/active$/); if(m){await renderActiveQuiz(app,m[1],router);wireShell();return;}
  m=path.match(/^\/quiz\/([^/]+)$/); if(m){await renderQuizPreview(app,m[1],router);wireShell();return;}
  m=path.match(/^\/result\/([^/]+)\/review$/); if(m){await renderReview(app,m[1],router);wireShell();return;}
  m=path.match(/^\/result\/([^/]+)$/); if(m){await renderResult(app,m[1],router);wireShell();return;}
  app.innerHTML='<div class="empty">Page not found.</div>';
 }catch(e){console.error(e);app.innerHTML=`<div class="error-page"><h2>Something went wrong</h2><p>${e.message}</p></div>`}
}
init();
