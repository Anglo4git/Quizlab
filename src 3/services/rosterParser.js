// Lightweight roster/CSV import for group membership (handoff item 14).
// Deliberately simpler than importParser.js's TSV/XLSX pipeline: no file
// upload, no schema/header row — a teacher just pastes a list, one learner
// per line, either "email" alone or "Name, email" / "Name<TAB>email". This
// mirrors importParser's two-phase shape (parse+validate the pasted text
// itself, then a second pass that checks rows against external data — here
// the platform's existing accounts and the group's current membership —
// the same way detectDuplicates() checks parsed rows against existing
// questions) without pulling in the heavier file-format machinery that
// doesn't apply to a short pasted roster.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Splits one pasted line into a { name, email } guess. Accepts "email",
// "email,Name", "Name,email", or the same with a tab instead of a comma —
// whichever field looks like an email wins; the other becomes the name.
function splitLine(line) {
  const parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) return { name: '', email: parts[0] };
  const emailPart = parts.find(p => EMAIL_RE.test(p));
  if (!emailPart) return { name: parts[0], email: parts[1] || '' };
  const namePart = parts.find(p => p !== emailPart) || '';
  return { name: namePart, email: emailPart };
}

// Parses pasted roster text into rows with issues, same shape convention
// as importParser's parseTSV: { rowNumber, raw, name, email, issues, state }.
export function parseRoster(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ['Paste at least one learner (email, or "Name, email") first.'] };
  const rows = lines.map((line, i) => {
    const { name, email } = splitLine(line);
    const issues = [];
    if (!email) issues.push('No email found on this line.');
    else if (!EMAIL_RE.test(email)) issues.push('Not a valid email address.');
    return { rowNumber: i + 1, raw: line, name, email: email.trim().toLowerCase(), issues, state: issues.length ? 'Error' : 'Valid' };
  });
  return { rows, errors: [] };
}

// Second pass: matches each syntactically-valid row against the platform's
// known accounts and the group's current membership, mutating each row
// in place with a `matchStatus` + human `statusLabel`/`statusClass` (the
// latter reusing existing .status.<class> CSS states so no new styles are
// needed) and, when matched, the `userId`/`userName` to add.
//   matched          — a real, not-yet-a-member account; can be added.
//   already_member   — a real account that's already in this group.
//   not_found        — no account exists with this email (this mock
//                       platform doesn't self-service-create accounts from
//                       a roster import; only existing accounts can join).
//   duplicate        — the same email appears again earlier in this paste.
//   invalid          — failed the parseRoster-stage email check.
export function matchRosterRows(rows, users, existingMemberIds) {
  const usersByEmail = new Map(users.map(u => [String(u.email || '').toLowerCase(), u]));
  const seenEmails = new Set();
  for (const row of rows) {
    if (row.state === 'Error') {
      row.matchStatus = 'invalid'; row.statusLabel = 'Invalid'; row.statusClass = 'error';
      continue;
    }
    if (seenEmails.has(row.email)) {
      row.matchStatus = 'duplicate'; row.statusLabel = 'Duplicate in paste'; row.statusClass = 'duplicate';
      continue;
    }
    seenEmails.add(row.email);
    const user = usersByEmail.get(row.email);
    if (!user) {
      row.matchStatus = 'not_found'; row.statusLabel = 'No account found'; row.statusClass = 'error';
      continue;
    }
    row.userId = user.id;
    row.userName = user.name;
    if (existingMemberIds.has(user.id)) {
      row.matchStatus = 'already_member'; row.statusLabel = 'Already a member'; row.statusClass = 'scheduled';
    } else {
      row.matchStatus = 'matched'; row.statusLabel = 'Will add'; row.statusClass = 'active';
    }
  }
  return rows;
}
