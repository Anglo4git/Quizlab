// Derives learner-facing availability from workflow status (draft/validated/published)
// plus an optional availability window (availableFrom/availableTo). Storage always keeps
// the workflow status as set by the builder; this derivation never mutates the record.
export function deriveAvailability(quiz, now = Date.now()) {
  if (quiz.status !== 'published') {
    return { visible: false, state: 'unpublished', label: 'Not published' };
  }
  const from = quiz.availableFrom ? Date.parse(quiz.availableFrom) : null;
  const to = quiz.availableTo ? Date.parse(quiz.availableTo) : null;
  if (from && now < from) {
    return { visible: false, state: 'scheduled', label: `Scheduled for ${new Date(from).toLocaleString()}` };
  }
  if (to && now > to) {
    return { visible: false, state: 'closed', label: `Closed since ${new Date(to).toLocaleString()}` };
  }
  return { visible: true, state: 'available', label: 'Live' };
}
