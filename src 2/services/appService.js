import { repository as supabaseRepository } from './supabaseRepository.js';
import { repository as mockRepository } from './mockRepository.js';
import { supabase } from './supabaseClient.js';

// If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't set at build time
// (e.g. a plain GitHub Pages deploy with no way to inject env vars),
// fall back to the bundled mock/demo data instead of throwing on every call.
if (!supabase) {
  console.warn('[QuizLab] Supabase is not configured — using mock/demo data instead.');
}
const repository = supabase ? supabaseRepository : mockRepository;

export const appService = {
  listQuizzes: filter => repository.listQuizzes(filter), getQuiz: id => repository.getQuiz(id), createQuiz: data => repository.createQuiz(data), updateQuiz: (id, patch) => repository.updateQuiz(id, patch),
  getQuestions: ids => repository.getQuestions(ids), listQuestions: filter => repository.listQuestions(filter), createQuestion: data => repository.createQuestion(data), updateQuestion: (id, patch) => repository.updateQuestion(id, patch), getQuestionHistory: id => repository.getQuestionHistory(id), revertQuestion: (id, versionId) => repository.revertQuestion(id, versionId),
  listAttempts: () => repository.listAttempts(), getAttempt: id => repository.getAttempt(id), getActiveAttempt: quizId => repository.getActiveAttempt(quizId), saveAttempt: a => repository.saveAttempt(a), currentUser: () => repository.getCurrentUser(), settings: () => repository.getPlatformSettings(), setTeacherMode: enabled => repository.setTeacherMode(enabled), guestState: () => repository.getGuestState(), useGuestAllocation: () => repository.useGuestAllocation(), users: () => repository.users(), session: () => repository.getSession(), setSession: action => repository.setSession(action),
  listGroups: teacherId => repository.listGroups(teacherId), getGroup: id => repository.getGroup(id), createGroup: data => repository.createGroup(data), deleteGroup: id => repository.deleteGroup(id), joinGroupByCode: (code,userId) => repository.joinGroupByCode(code,userId), removeGroupMember: (groupId,userId) => repository.removeGroupMember(groupId,userId), addGroupMembers: (groupId,userIds) => repository.addGroupMembers(groupId,userIds), listGroupsForMember: userId => repository.listGroupsForMember(userId), listAssignments: filter => repository.listAssignments(filter), createAssignment: data => repository.createAssignment(data), createAssignments: data => repository.createAssignments(data), deleteAssignment: id => repository.deleteAssignment(id), isUserAssignedQuiz: (userId,quizId) => repository.isUserAssignedQuiz(userId,quizId), listAttemptsForUser: userId => repository.listAttemptsForUser(userId)
};
