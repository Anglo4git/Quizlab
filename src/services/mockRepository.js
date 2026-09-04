import { questions, quizzes, attempts, users, groups, assignments } from '../data/mockData.js';

const clone = value => structuredClone(value);
const STORAGE_KEY = 'quizlab.mock.v2';

function bumpVersion(versionId) {
  const m = /^(.*)-v(\d+)$/.exec(versionId || '');
  if (!m) return `${versionId || 'q'}-v2`;
  return `${m[1]}-v${parseInt(m[2], 10) + 1}`;
}

// Mirrors the human-facing code shape already used by the seed data,
// e.g. GRM-A1-000123: a 3-letter category prefix, the tag/level, and a
// zero-padded sequence number. Retries on the rare collision.
function generateQuestionCode(category, tag, existingCodes) {
  const prefix = (String(category || 'GEN').replace(/[^a-zA-Z]/g, '') || 'GEN').slice(0, 3).toUpperCase();
  const level = (String(tag || 'GEN').replace(/[^a-zA-Z0-9]/g, '') || 'GEN').toUpperCase();
  let code;
  do {
    const seq = String(Math.floor(100000 + Math.random() * 900000));
    code = `${prefix}-${level}-${seq}`;
  } while (existingCodes.has(code));
  return code;
}

// Same shape as generateQuestionCode's collision-avoidance, for group join
// codes: short, human-typeable, and excludes visually ambiguous characters
// (0/O, 1/I) since a teacher may read this aloud or write it on a board.
function generateJoinCode(existingCodes) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (existingCodes.has(code));
  return code;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.attempts && saved?.questions && saved?.quizzes) {
      // Backfill fields added in later checkpoints so state saved by an
      // older build of the app doesn't crash on the newer code paths.
      saved.guest ||= { allocationUsed: false, id: crypto.randomUUID() };
      saved.session ||= { identity: 'u-learner' };
      saved.settings ||= { teacherModeEnabled: true };
      saved.groups ||= [];
      saved.assignments ||= [];
      // Backfill ownership on content saved before teacher-authored questions/
      // quizzes existed. Absent/undefined means admin/global content.
      saved.questions.forEach(q => { if (!('ownerId' in q)) q.ownerId = null; });
      saved.quizzes.forEach(qz => { if (!('ownerId' in qz)) qz.ownerId = null; });
      return saved;
    }
  } catch (_) {}
  return {
    questions: clone(questions), quizzes: clone(quizzes), attempts: clone(attempts), users: clone(users),
    groups: clone(groups), assignments: clone(assignments),
    settings: { teacherModeEnabled: true },
    guest: { allocationUsed: false, id: crypto.randomUUID() },
    session: { identity: 'u-learner' }
  };
}

const state = loadState();
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

export const repository = {
  // filter.ownerId, when passed, scopes results to that owner's own authored
  // content (teacher-authoring areas); omitted/undefined returns everything,
  // which is what the admin's unscoped workspace still expects.
  async listQuizzes(filter = {}) {
    return clone(filter.ownerId ? state.quizzes.filter(q => q.ownerId === filter.ownerId) : state.quizzes);
  },
  async getQuiz(id) { return clone(state.quizzes.find(q => q.id === id)); },
  async createQuiz(data) {
    const id = `quiz-${crypto.randomUUID().slice(0, 8)}`;
    const quiz = {
      id, quiz_code: data.quiz_code, title: data.title, category: data.category || 'General', tags: clone(data.tags || []),
      description: data.description || '', mode: data.mode || 'practice', status: 'draft', questionIds: clone(data.questionIds || []),
      questionCount: (data.questionIds || []).length, timeLimit: data.timeLimit || null, access: data.access || 'public',
      review: data.review || 'full', randomizeQuestions: !!data.randomizeQuestions, randomizeAnswers: !!data.randomizeAnswers,
      flagging: data.flagging !== false, selectionRules: data.selectionRules ? clone(data.selectionRules) : null,
      navigation: data.navigation === 'sequential' ? 'sequential' : 'free',
      availableFrom: data.availableFrom || null, availableTo: data.availableTo || null,
      ownerId: data.ownerId || null,
      versionId: `${id}-v1`, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    state.quizzes.unshift(quiz); persist(); return clone(quiz);
  },
  async updateQuiz(id, patch) {
    const i = state.quizzes.findIndex(q => q.id === id);
    if (i < 0) throw new Error('Quiz not found');
    const next = { ...state.quizzes[i], ...clone(patch), updated_at: new Date().toISOString() };
    const configFields = ['title','quiz_code','description','mode','access','review','timeLimit','category','tags','questionIds','selectionRules','randomizeQuestions','randomizeAnswers','flagging','navigation','availableFrom','availableTo'];
    if (!('status' in patch) && configFields.some(f => f in patch)) next.status = 'draft';
    next.questionCount = next.questionIds?.length || 0;
    if ('status' in patch && patch.status === 'published') next.publishedAt ||= new Date().toISOString();
    state.quizzes[i] = next; persist(); return clone(next);
  },
  async getQuestions(ids) { return clone(state.questions.filter(q => ids.includes(q.id) || ids.includes(q.versionId))); },
  // Same ownerId-scoping convention as listQuizzes above.
  async listQuestions(filter = {}) {
    return clone(filter.ownerId ? state.questions.filter(q => q.ownerId === filter.ownerId) : state.questions);
  },
  // Creates a new draft question, e.g. from an accepted import row. Generates
  // a stable question_code/versionId the same way the rest of the app expects.
  async createQuestion(data) {
    const existingCodes = new Set(state.questions.map(q => q.question_code));
    const code = generateQuestionCode(data.category, data.tags?.[0], existingCodes);
    const now = new Date().toISOString();
    const question = {
      id: code, question_code: code, versionId: `${code}-v1`,
      question: data.question, category: data.category || 'General', tags: clone(data.tags || []),
      explanation: data.explanation || '', answers: clone(data.answers || []), correctIndex: data.correctIndex || 0,
      status: 'draft', history: [], source: data.source ? clone(data.source) : { type: 'manual' },
      ownerId: data.ownerId || null,
      created_at: now, updated_at: now
    };
    state.questions.unshift(question);
    persist();
    return clone(question);
  },
  async updateQuestion(id, patch) {
    const i = state.questions.findIndex(q => q.id === id);
    if (i < 0) throw new Error('Question not found');
    const current = state.questions[i];
    const CONTENT_FIELDS = ['question', 'category', 'tags', 'explanation', 'answers', 'correctIndex'];
    const contentChanged = CONTENT_FIELDS.some(f => f in patch && JSON.stringify(patch[f]) !== JSON.stringify(current[f]));
    let next = { ...current, ...clone(patch), updated_at: new Date().toISOString() };
    if (contentChanged) {
      const history = current.history ? clone(current.history) : [];
      history.push({
        versionId: current.versionId,
        question: current.question, category: current.category, tags: clone(current.tags),
        explanation: current.explanation, answers: clone(current.answers), correctIndex: current.correctIndex,
        savedAt: current.updated_at || current.created_at || new Date(0).toISOString(),
        note: 'Edited'
      });
      next.history = history;
      next.versionId = bumpVersion(current.versionId);
    }
    state.questions[i] = next;
    persist();
    return clone(state.questions[i]);
  },
  async getQuestionHistory(id) {
    const q = state.questions.find(q => q.id === id);
    if (!q) throw new Error('Question not found');
    return clone(q.history || []);
  },
  async revertQuestion(id, versionId) {
    const i = state.questions.findIndex(q => q.id === id);
    if (i < 0) throw new Error('Question not found');
    const current = state.questions[i];
    const history = current.history ? clone(current.history) : [];
    const target = history.find(v => v.versionId === versionId);
    if (!target) throw new Error('Version not found');
    const remainingHistory = history.filter(v => v.versionId !== versionId);
    remainingHistory.push({
      versionId: current.versionId,
      question: current.question, category: current.category, tags: clone(current.tags),
      explanation: current.explanation, answers: clone(current.answers), correctIndex: current.correctIndex,
      savedAt: current.updated_at || new Date().toISOString(),
      note: `Replaced by revert to ${versionId}`
    });
    state.questions[i] = {
      ...current,
      question: target.question, category: target.category, tags: clone(target.tags),
      explanation: target.explanation, answers: clone(target.answers), correctIndex: target.correctIndex,
      versionId: bumpVersion(current.versionId),
      history: remainingHistory,
      updated_at: new Date().toISOString()
    };
    persist();
    return clone(state.questions[i]);
  },
  async listAttempts() { return clone(state.attempts); },
  async getAttempt(id) { return clone(state.attempts.find(a => a.id === id)); },
  async getActiveAttempt(quizId) { return clone(state.attempts.find(a => a.quizId === quizId && a.status === 'in_progress')); },
  async saveAttempt(attempt) {
    const i = state.attempts.findIndex(a => a.id === attempt.id);
    if (i >= 0) state.attempts[i] = clone(attempt); else state.attempts.unshift(clone(attempt));
    persist(); return clone(attempt);
  },
  async getCurrentUser() {
    if (state.session.identity === 'guest') return null;
    return clone(state.users.find(u => u.id === state.session.identity)) || null;
  },
  async getPlatformSettings() { return clone(state.settings); },
  async setTeacherMode(enabled) { state.settings.teacherModeEnabled = !!enabled; persist(); return clone(state.settings); },
  async getGuestState() { return clone(state.guest); },
  async useGuestAllocation() { state.guest.allocationUsed = true; persist(); return clone(state.guest); },
  async listUsers() { return clone(state.users); },
  async users() { return clone(state.users); },
  async getSession() { return clone(state.session); },
  // Mock identity switch — stands in for real sign-in until an auth backend exists.
  async setSession(identity) {
    const valid = new Set(['guest', 'u-learner', 'u-teacher', 'u-admin']);
    state.session = { identity: valid.has(identity) ? identity : 'guest' };
    persist();
    return clone(state.session);
  },

  // --- Teacher Mode: groups, join codes, assignments, results ---
  async listGroups(teacherId) {
    return clone(teacherId ? state.groups.filter(g => g.teacherId === teacherId) : state.groups);
  },
  async getGroup(id) { return clone(state.groups.find(g => g.id === id)); },
  async createGroup({ name, teacherId }) {
    const existingCodes = new Set(state.groups.map(g => g.code));
    const group = {
      id: `grp-${crypto.randomUUID().slice(0, 8)}`, code: generateJoinCode(existingCodes),
      name: name || 'Untitled group', teacherId, memberIds: [], created_at: new Date().toISOString()
    };
    state.groups.unshift(group); persist(); return clone(group);
  },
  async deleteGroup(id) {
    state.groups = state.groups.filter(g => g.id !== id);
    state.assignments = state.assignments.filter(a => a.groupId !== id);
    persist();
  },
  // Learner-facing: redeems a join code for the given user. Case/space
  // tolerant since a person may retype a code shown on a projector.
  async joinGroupByCode(code, userId) {
    const normalized = String(code || '').trim().toUpperCase();
    const group = state.groups.find(g => g.code === normalized);
    if (!group) throw new Error('No class found with that code.');
    if (!userId) throw new Error('Sign in before joining a class.');
    if (!group.memberIds.includes(userId)) group.memberIds.push(userId);
    persist();
    return clone(group);
  },
  async removeGroupMember(groupId, userId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) throw new Error('Group not found');
    group.memberIds = group.memberIds.filter(id => id !== userId);
    persist();
    return clone(group);
  },
  // Bulk version of the join-code path above, for the teacher-facing roster
  // import (handoff item 14): adds every given user id that isn't already a
  // member, silently no-op'ing on ones that already are (same idempotency
  // as joinGroupByCode). Returns which ids were actually newly added.
  async addGroupMembers(groupId, userIds) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) throw new Error('Group not found');
    const added = [];
    for (const userId of userIds) {
      if (!group.memberIds.includes(userId)) { group.memberIds.push(userId); added.push(userId); }
    }
    persist();
    return { group: clone(group), added };
  },
  async listGroupsForMember(userId) {
    return clone(state.groups.filter(g => g.memberIds.includes(userId)));
  },
  async listAssignments(filter = {}) {
    let list = state.assignments;
    if (filter.groupId) list = list.filter(a => a.groupId === filter.groupId);
    if (filter.teacherId) {
      const groupIds = new Set(state.groups.filter(g => g.teacherId === filter.teacherId).map(g => g.id));
      list = list.filter(a => groupIds.has(a.groupId));
    }
    return clone(list);
  },
  async createAssignment({ groupId, quizId, dueAt, assignedBy }) {
    if (!state.groups.some(g => g.id === groupId)) throw new Error('Group not found');
    if (!state.quizzes.some(q => q.id === quizId)) throw new Error('Quiz not found');
    const assignment = {
      id: `asg-${crypto.randomUUID().slice(0, 8)}`, groupId, quizId,
      dueAt: dueAt || null, assignedBy, created_at: new Date().toISOString()
    };
    state.assignments.unshift(assignment); persist(); return clone(assignment);
  },
  // Multi-class assignment (handoff item 14): assigns one quiz to several
  // groups in a single action instead of repeating the single-group flow
  // above once per class. A group already carrying this quiz is skipped
  // rather than creating a duplicate assignment row — idempotent the same
  // way addGroupMembers/joinGroupByCode are.
  async createAssignments({ groupIds, quizId, dueAt, assignedBy }) {
    if (!state.quizzes.some(q => q.id === quizId)) throw new Error('Quiz not found');
    const created = []; const skipped = [];
    for (const groupId of groupIds) {
      if (!state.groups.some(g => g.id === groupId)) { skipped.push({ groupId, reason: 'group_missing' }); continue; }
      if (state.assignments.some(a => a.groupId === groupId && a.quizId === quizId)) { skipped.push({ groupId, reason: 'already_assigned' }); continue; }
      const assignment = {
        id: `asg-${crypto.randomUUID().slice(0, 8)}`, groupId, quizId,
        dueAt: dueAt || null, assignedBy, created_at: new Date().toISOString()
      };
      state.assignments.unshift(assignment);
      created.push(assignment);
    }
    persist();
    return { created: clone(created), skipped };
  },
  async deleteAssignment(id) {
    state.assignments = state.assignments.filter(a => a.id !== id);
    persist();
  },
  // Real "restricted" access check: true if the user belongs to any group
  // that has an assignment for this quiz. Used by src/utils/access.js so
  // restricted enforcement is no longer just "any signed-in account".
  async isUserAssignedQuiz(userId, quizId) {
    if (!userId) return false;
    const groupIds = new Set(state.groups.filter(g => g.memberIds.includes(userId)).map(g => g.id));
    return state.assignments.some(a => groupIds.has(a.groupId) && a.quizId === quizId);
  },
  // All attempts made by a given user, newest first — used to build the
  // per-member results view without exposing the whole attempts table.
  async listAttemptsForUser(userId) {
    return clone(state.attempts.filter(a => a.userId === userId));
  }
};
