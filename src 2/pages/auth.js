import { supabase } from '../services/supabaseClient.js';
import { store } from '../core/store.js';

export async function renderAuth(app, router) {
  if (!supabase) { app.innerHTML='<div class="empty"><h2>Supabase is not configured</h2><p>Add the two VITE_SUPABASE_* values to <code>.env.local</code> and restart the app.</p></div>'; return; }
  app.innerHTML=`<div class="auth-card"><div class="brand"><span class="brand-mark">Q</span><span>QuizLab</span></div><h1>Welcome to QuizLab</h1><p>Sign in to save your progress, join classes, and take assigned quizzes.</p><form id="auth-form"><input name="email" type="email" placeholder="Email" autocomplete="email" required><input name="password" type="password" placeholder="Password" autocomplete="current-password" minlength="6" required><button class="button primary" type="submit">Sign in</button><button id="signup" class="button secondary" type="button">Create account</button><div id="auth-msg" role="alert"></div></form></div>`;
  const msg=app.querySelector('#auth-msg');
  app.querySelector('#auth-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error){msg.textContent=error.message;return;}store.session=await (await import('../services/appService.js')).appService.session();store.user=await (await import('../services/appService.js')).appService.currentUser();router.navigate('/quizzes');};
  app.querySelector('#signup').onclick=async()=>{const f=new FormData(app.querySelector('#auth-form'));const {error}=await supabase.auth.signUp({email:f.get('email'),password:f.get('password')});msg.textContent=error?error.message:'Account created. Check your email if confirmation is enabled.';};
}
