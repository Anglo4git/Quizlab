// Derives whether the current viewer can start a quiz, given its stored
// `access` field (public/registered/restricted) plus the mock session and
// guest-allocation state. Pure and side-effect free — consuming the guest's
// free allocation is the caller's job (see quizPreview.js), triggered only
// once Start is actually clicked, not just because this was evaluated.
//
// Guests get exactly one free "registered" quiz before sign-in is required.
// "restricted" now requires real group-assignment membership (Teacher Mode,
// checkpoint 10) — a signed-in learner passes only if a teacher has assigned
// this quiz to a group they belong to. Staff (teacher/admin) can always
// preview a restricted quiz so they can check it before assigning it.
//
// `hasGroupAccess` is computed by the caller (see quizPreview.js/
// activeQuiz.js, which ask appService.isUserAssignedQuiz) and passed in here
// so this function stays pure and easy to unit-test.
export function evaluateAccess(quiz, session, guestState, hasGroupAccess = false) {
  const identity = session?.identity || 'guest';
  const isGuest = identity === 'guest';
  const isStaff = identity === 'u-teacher' || identity === 'u-admin';

  if (quiz.access === 'public') {
    return { allowed: true, label: 'Public', reason: 'Open to everyone, no account required.' };
  }

  if (!isGuest) {
    if (quiz.access === 'registered') {
      return { allowed: true, label: 'Sign-in required', reason: "You're signed in, so this quiz is available." };
    }
    if (quiz.access === 'restricted') {
      if (isStaff) {
        return { allowed: true, label: 'Restricted', reason: 'Staff can preview any restricted quiz regardless of group assignment.' };
      }
      if (hasGroupAccess) {
        return { allowed: true, label: 'Restricted', reason: 'This quiz has been assigned to a class you belong to.' };
      }
      return {
        allowed: false, label: 'Restricted',
        reason: "This quiz is restricted to specific classes and hasn't been assigned to you. Ask your teacher for an assignment or a join code."
      };
    }
  }

  // Guest viewer from here down.
  if (quiz.access === 'registered') {
    if (!guestState?.allocationUsed) {
      return {
        allowed: true, label: 'Sign-in required', consumesFreeQuiz: true,
        reason: 'This quiz normally requires an account — starting it will use your one free guest quiz.'
      };
    }
    return {
      allowed: false, label: 'Sign-in required',
      reason: "You've already used your free guest quiz. Sign in to access more registered quizzes."
    };
  }

  if (quiz.access === 'restricted') {
    return { allowed: false, label: 'Restricted', reason: 'This quiz is restricted and requires signing in.' };
  }

  return { allowed: false, label: quiz.access, reason: 'Sign in required to access this quiz.' };
}
