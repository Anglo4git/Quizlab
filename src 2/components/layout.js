import { store } from '../core/store.js';

function sessionSwitcher() {
  const user = store.user;
  if (!user) return '<a class="button small secondary" href="#/auth">Sign in</a>';
  return `<button id="session-switch" class="button small secondary" type="button">Sign out · ${user.name || 'Account'}</button>`;
}

function guestBanner() {
  if ((store.session?.identity || 'u-learner') !== 'guest') return '';
  const used = store.guest?.allocationUsed;
  return used
    ? `<div class="guest-banner used">Your free guest quiz has been used. Switch to a signed-in identity above for full access.</div>`
    : `<div class="guest-banner">Browsing as guest — you have <strong>one free quiz</strong> before sign-in is required for anything beyond public quizzes.</div>`;
}

export const shell = ({ title='QuizLab', subtitle='', nav='', content='' }) => `
<div class="app-shell">
  <header class="topbar">
    <a class="brand" href="#/quizzes"><span class="brand-mark" aria-hidden="true">Q</span><span>QuizLab</span></a>
    <nav class="main-nav">${nav}</nav>
    <div class="top-actions">${sessionSwitcher()}</div>
  </header>
  ${guestBanner()}
  <main class="main"><div class="page-heading"><div><h1>${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}</div></div>${content}</main>
</div>`;

export const navLinks = active => {
  const links = [`/quizzes:Quizzes`,`/history:History`];
  if(store.user?.role === 'admin') links.push(`/admin:Admin`);
  if(store.user?.role === 'teacher' || store.user?.role === 'admin') links.push(`/teacher:Teacher`);
  return links.map(x=>{const [p,t]=x.split(':');return `<a class="nav-link ${active===p?'active':''}" href="#${p}">${t}</a>`}).join('');
};

export const toast = (message, type='info') => `<div class="toast ${type}">${message}</div>`;
