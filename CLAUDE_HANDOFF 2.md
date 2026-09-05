# Claude Handoff — Frontend Checkpoint 13 + Supabase Database v1

## Current status

Frontend prototype is now at a stronger functional checkpoint. Learner quiz attempts have frozen randomization state and local persistence, TSV import parsing/validation is functional in-browser (with in-place row correction and real draft creation), the question bank has editable lifecycle controls plus versioning/revert, import duplicate detection is implemented, the quiz builder covers availability scheduling/review depth/navigation mode, there is a mock identity switcher (Guest / Learner / Teacher / Admin) with a guest one-free-quiz allocation, a detailed question-by-question review route, and role-aware route guards on Admin/Teacher. Teacher Mode is a real workflow: teachers create classes with shareable join codes, learners redeem a code to join, teachers assign published quizzes to a class (with an optional due date) and see each member's result per assignment, and `restricted` quiz access is genuinely gated by group-assignment membership instead of "any signed-in account". As of checkpoint 11, the previously-open polish item (item 8) is done: destructive actions confirm before running, mutating forms give loading/disabled feedback and reject empty/whitespace-only input, and screen-reader support (aria-live status regions, aria-labels on icon-only/unlabeled controls, a visible focus ring on every interactive element) has been added across the app. As of checkpoint 12, item 15 is done: teachers now get their own scoped content-authoring area (`My Questions`/`My Quizzes`) instead of only being able to assign quizzes admins already published. As of checkpoint 13, item 14 is done: a teacher can bulk-add class members via a pasted roster (previewed before committing) and assign a quiz to several of their classes in a single action instead of repeating the assign flow once per class.

## Checkpoint 13 — Roster import + multi-class assignment (item 14)

- **New file `src/services/rosterParser.js`**: a lightweight, paste-based roster parser — deliberately not the heavier TSV/XLSX pipeline in `importParser.js`, since this is a short pasted list, not a file upload. `parseRoster(text)` splits pasted lines (one learner per line: `email` alone, or `Name, email` / `Name<TAB>email`, whichever field looks like an email wins) into rows with per-row `issues`/`state`, mirroring `importParser.parseTSV`'s row shape. `matchRosterRows(rows, users, existingMemberIds)` is a second pass — mirrors `importParser.detectDuplicates`'s "parse first, then check against external data" split — that classifies each row as `matched` (real, not-yet-a-member account — can be added), `already_member`, `not_found` (no account exists; this mock platform doesn't create new accounts from a roster, only existing ones can be added), `duplicate` (same email repeated in the same paste), or `invalid`. Each status maps to an existing `.status.<class>` CSS state (active/scheduled/error/duplicate) so no new styles were needed.
- **`mockRepository.js`**: added `addGroupMembers(groupId, userIds)` — bulk version of the existing single-member-add logic used by `joinGroupByCode`, idempotent on ids that are already members (skips them silently, same idempotency convention as the rest of the repository). Added `createAssignments({ groupIds, quizId, dueAt, assignedBy })` — the multi-class counterpart to the existing single-group `createAssignment`; loops over the given groups, skips any group that already has this quiz assigned (`already_assigned`) or doesn't exist (`group_missing`) instead of throwing or creating a duplicate row, and returns `{ created, skipped }` so the caller can tell what happened. The original single-group `createAssignment` is untouched and still available (kept for any other future single-assign use), but `teacher.js` now calls the bulk form for every assignment, including a single class, since "assign to these N classes" subsumes "assign to this one class."
- **`appService.js`**: passthroughs added for both (`addGroupMembers`, `createAssignments`).
- **`teacher.js`**:
  - New "Import roster" fieldset inside a class's detail view: a textarea for the pasted list, a "Preview roster" button that parses + matches in place (no navigation — same "review before it becomes real" shape as `importPage.js`'s TSV flow) and renders a small status table, and an "Add N members" button (disabled at 0 matches) that calls `addGroupMembers` with just the matched, not-yet-member rows.
  - "Assign a quiz" changed from a single implicit target (whichever class's detail view is open) to a checkbox list of **all** of the teacher's classes, pre-checking the currently open one; submitting calls `createAssignments` with every checked class in one action. A teacher assigning inside "Period 3" can now also check "Period 4" and "Period 5" in the same step instead of navigating to each class separately.

### Verification (checkpoint 13)

- `node --check` passed for every modified/new file and, as a regression check, every other `.js` file in `src/`.
- Ran `rosterParser.js` directly against representative pasted input covering all five states in one paste (`matched`, `not_found`, a repeated email → `duplicate`, a non-email line → `invalid`) plus a separate case for `already_member` and for `Name<TAB>email` tab-separated parsing — all classified correctly.
- Ran an end-to-end Node script against the real `mockRepository`: created two new classes, bulk-added a member via `addGroupMembers` (confirmed idempotent on re-add), then called `createAssignments` to assign one quiz to three classes (the two new ones plus the pre-existing seed demo class) in a single call — confirmed all three created; re-ran the identical call and confirmed all three were correctly skipped as `already_assigned` (zero duplicate rows created); confirmed `listAssignments` reflects the right per-group and per-teacher totals afterward. Separately confirmed `createAssignments` handles a nonexistent `groupId` gracefully (skipped with `group_missing`, no throw) rather than failing the whole batch.
- The DOM-facing pieces (the roster preview table's in-place render/re-render, the checkbox-list assign form, the `form="assignForm"` attribute associating checkboxes that live outside the `<form>` tag itself) were reviewed by hand against the same patterns already proven out elsewhere in the app (no DOM harness available offline, consistent with prior checkpoints) — `form="..."` is a standard HTML association attribute already relied on implicitly by the pre-existing submit button pattern in this same fieldset, so this isn't a new technique, just a new use of the same one.
- `npm install`/`npm run build` were not re-attempted this session — the registry-403 sandbox limitation noted in checkpoints 11–12 is environmental and unrelated to these changes; still recommend running `npm install && npm run build` in an environment with registry access before shipping.

## Supabase database v1

**Note on scope:** the planning doc this was based on assumed a Mylingo ZIP export would be inspected first to produce a real source→target migration mapping. That ZIP was never provided, and the "Mylingo app v1" Supabase project turned out to be an empty, freshly-provisioned target database (0 rows in every table before this session), not the legacy Mylingo data itself. Per explicit instruction, this schema was therefore built to match what checkpoint 12's frontend actually implements today, NOT the full aspirational architecture in the planning doc. **If a real Mylingo export surfaces later, this schema still needs to go through the doc's original Phase 1/2 reconciliation before any real migration** — treat everything below as "checkpoint-12-equivalent," not "Mylingo-verified."

### What's built (9 migrations + 1 fix migration, all applied and verified against the live DB)

- **Enums + extensions**: `user_role`, `question_status`, `quiz_mode`, `quiz_status`, `quiz_access`, `quiz_review`, `quiz_navigation`, `attempt_status`. `pgcrypto` enabled.
- **`profiles`**: 1:1 with `auth.users`, auto-created on signup via an `on_auth_user_created` trigger reading `role`/`display_name` from `raw_user_meta_data` (defaults to `learner`). Mirrors `mockData.js` `users[]`.
- **`platform_settings`**: singleton row, `teacher_mode_enabled`. Mirrors `state.settings`.
- **`questions`**: flat shape matching `mockData.js`/`mockRepository.js` exactly — `question_code`, `version_id`, `answers text[]`, `correct_index`, `status`, `owner_id` (null = admin/global), and an inline `history jsonb` array (NOT a separate `question_versions` table — the frontend doesn't do true immutable versioning; edits still just bump `version_id` and push a snapshot into `history` on the same row, exactly like `mockRepository.updateQuestion`/`revertQuestion`). Constraints: min 2 answers, `correct_index` in range.
- **`quizzes`**: matches `adminQuizzes.js`'s builder fields 1:1 (title, quiz_code, mode, access, review, time_limit_minutes, category/tags, description, randomize_questions/answers, flagging, navigation, available_from/to, selection_rules jsonb, owner_id). `question_ids text[]` (ordered, referencing `questions.question_code`) instead of a normalized `quiz_questions` join table — same reasoning as `questions.history`, this mirrors what the frontend actually stores. A trigger (`check_quiz_question_ids`) enforces referential integrity on that array since Postgres has no native array FK. Constraints: quiz_code format, assessment-mode-requires-time-limit (mirrors `validateDraft`), time limit ≤180min, availability window ordering.
- **`groups`** + **`group_memberships`**: mirrors `mockData.js` `groups[]`, but `memberIds` (a JS array on the mock object) is normalized into a real join table here — the direct relational equivalent, needed for per-row RLS.
- **`assignments`**: mirrors `mockData.js` `assignments[]` exactly (group-only; no individual-learner assignment exists in the frontend, so no `learner_id` column was speculatively added).
- **`guest_allocations`**: the one-free-guest-quiz allocation record (mirrors `state.guest`), but real and server-side-enforced — see "genuine upgrades" below.
- **`attempts`**: mirrors `mockData.js` `attempts[]`. Deliberately does NOT include `question_order`/`answer_mapping`/`responses` columns from the original planning doc — the frontend doesn't currently freeze per-attempt question/answer order or persist individual responses server-side, and the doc itself flagged that as an open product decision (its gap 47.F). Adding those columns now would be guessing ahead of an undecided requirement. Constraints: `user_id XOR guest_id`, `correct_count <= total_count`, and a **real one-active-attempt-per-user/per-guest uniqueness index** (the planning doc's gap #20, done as an actual DB constraint rather than just an app-level assumption).
- **RLS on every table**, encoding the exact ownership/visibility rules already live in `mockRepository.js`/`adminQuestions.js`/`adminQuizzes.js`/`utils/access.js`: owner-scoping for questions/quizzes (admin sees all; teacher sees active + their own drafts), `public`/`registered`/`restricted` quiz visibility (restricted requires a real group-assignment join, not just "signed in"), group/assignment visibility scoped to the owning teacher or member learners, and `attempts`/`guest_allocations` with NO direct policies at all for guests — reachable only through security-definer RPC functions (below), so the one-free-quiz rule can't be bypassed by a raw table write. This is a genuine strictness upgrade over the current frontend, which only enforces guest allocation client-side via localStorage.
- **Security-definer RPC functions** (per the planning doc's gap #14/#22/#31 — "these should go through secure server-side functions"): `get_guest_allocation`, `start_guest_attempt` (enforces the one-free-quiz rule; public quizzes never consume it, restricted quizzes reject guests outright), `complete_guest_attempt` (verifies the caller's guest_id actually owns the attempt), `join_group_by_code` (case/whitespace-tolerant, matching `mockRepository.joinGroupByCode`; avoids a standing SELECT policy that would expose every group's code). Plus RLS-recursion-avoidance helpers: `is_admin`, `is_teacher_or_admin`, `current_role`, `is_group_member`, `is_group_teacher`, `is_assigned_quiz`, `teaches_group_of_user` — all `SECURITY DEFINER` so cross-table RLS checks don't recursively re-trigger RLS on the tables they check (see "bug found and fixed" below).
- **Seed data**: 3 real Supabase Auth users (`admin@quizlab.test` / `teacher@quizlab.test` / `learner@quizlab.test`, password `quizlab-demo-2026` for all three — placeholder, rotate before any real use) plus the exact 8 questions / 5 quizzes / 1 group / 1 assignment from `mockData.js`, byte-for-byte matching content.

### Bug found and fixed during verification

The first RLS pass caused `ERROR 42P17: infinite recursion detected in policy for relation "groups"` — several policies (`quizzes` restricted-access, `group_memberships`, `assignments`) queried other RLS-protected tables directly in their `USING` clause, and those tables' own policies queried back, creating a cycle Postgres couldn't resolve. Fixed in migration `010_fix_rls_recursion` by moving every cross-table membership/ownership check into `SECURITY DEFINER` helper functions (which run outside the caller's RLS context, so there's nothing left to recurse into) — same pattern already used for `is_admin()`. Re-verified working afterward (see below). **If any *future* RLS policy needs to check membership/ownership across `groups`/`group_memberships`/`assignments`/`quizzes`, use or extend the existing helper functions rather than writing a fresh cross-table subquery directly in a policy — that's exactly how this bug happened the first time.**

### Verification performed (all against the live database, not just written and assumed correct)

- Row counts confirmed to match `mockData.js` exactly after seeding (3 profiles, 8 questions, 5 quizzes, 1 group, 1 membership, 1 assignment, 1 settings row), and confirmed still exactly that after cleanup post-testing.
- Constraint rejection tested directly (not just "exists"): bad `quiz_code` format, assessment-without-time-limit, a quiz referencing an unknown `question_code`, and out-of-range `correct_index` were all confirmed **rejected**; a valid row was confirmed **accepted**.
- One-active-attempt uniqueness: confirmed a second concurrent `in_progress` attempt for the same quiz+learner is rejected (both the per-user and per-guest partial unique indexes).
- Guest allocation RPC flow: confirmed a `registered`-access quiz consumes the allocation, a `public`-access quiz does NOT (still works even after allocation is used), allocation is tracked correctly per-guest-id (one guest exhausting theirs doesn't affect another), and `complete_guest_attempt` correctly rejects a mismatched `guest_id` trying to finalize someone else's attempt.
- `join_group_by_code`: confirmed case/whitespace-tolerant (`'  demo01  '` → matches `DEMO01`) and idempotent (redeeming twice yields exactly one `group_memberships` row).
- RLS-as-anon: confirmed `attempts` and `guest_allocations` are completely inaccessible via direct table read as `anon` (0 rows visible either way), forcing all guest interaction through the RPC functions.
- RLS-as-authenticated (post-recursion-fix): confirmed a learner sees a `restricted` quiz only after being assigned it via their group (0 visible before, 1 visible after), confirmed an unrelated learner (not in the group) sees neither the restricted quiz nor the group itself, confirmed the owning teacher sees her own group's membership/assignment rows, and confirmed admin sees all quizzes/groups regardless of ownership.
- All test/scratch data (test quiz, test guest allocations, test attempts, a throwaway "outsider" auth user) was cleaned up afterward — the database was re-confirmed to hold exactly the checkpoint-12-equivalent seed data and nothing else before finishing.

### What's genuinely stronger than the current frontend (not just a port)

- Guest one-free-quiz allocation is enforced server-side and atomically (`for update` row lock in `start_guest_attempt`), not just trusted from a client-side `localStorage` boolean.
- One-active-attempt-per-user/guest is a real DB constraint, not just an assumption `getActiveAttempt` happens to uphold in the mock.
- `restricted` quiz access is enforced by RLS at the database layer itself, not just by `utils/access.js`'s client-side `evaluateAccess` check (which a modified frontend build could currently bypass entirely, since there's no real backend yet).

### What's intentionally NOT built yet (matches frontend gaps, not oversights)

- No `question_versions`/`quiz_versions` normalization, no `question_shares` (teacher-to-teacher content sharing), no normalized `tags`/`question_tags`, no `import_batches`/`import_rows` staging tables. All of these were in the original planning doc but the frontend doesn't implement the corresponding behavior yet (true versioning, content sharing, tag-based filtering beyond simple array matching, or a reviewable bulk-import pipeline) — adding the tables now would be schema speculation ahead of a product decision. Build these when the corresponding frontend feature is actually being built, using the planning doc as the reference design.
- No individual-learner (non-group) assignments — mirrors the frontend, which only supports group assignment.
- No attempt-level `question_order`/`answer_mapping`/`responses` persistence — mirrors the frontend, which doesn't send that to any backend today (open decision, planning doc gap 47.F).

### Explicitly NOT done this session

- **The frontend is NOT wired to this database.** `mockRepository.js`/`appService.js` are completely unchanged; the app still runs on localStorage exactly as before. Swapping the mock repository for real Supabase client calls (auth, RLS-aware queries, the new RPC functions for guest/join-code flows) is a separate, substantial next step — do not assume it's done because the schema exists.
- No Supabase Auth email templates, redirect URLs, or any other project-level auth configuration were touched — only the database schema.
- The demo seed password (`quizlab-demo-2026`) is a placeholder for local dev/testing only.

### Next recommended task

Item 14 is now done too (see the Checkpoint 13 section above). The remaining live frontend candidates are a genuine content-sharing/permissions model now that two authoring workspaces exist (so a teacher could, for instance, see and reuse another teacher's published quiz content rather than only assigning it — right now "sharing" is limited to assignment-level publish visibility, not co-authoring), or building out the standalone detailed-review route's remaining edge cases noted in item 5 if review usage grows. Separately, wiring the frontend to this new Supabase schema (swap `mockRepository.js` for a Supabase-client-backed implementation; move guest/join-code logic to call the new RPC functions instead of local mock logic; handle real Supabase Auth sessions instead of the mock identity switcher) is still an open, substantial task of its own — these two threads (further frontend-on-mock-data work vs. wiring to the real database) are independent; decide which to pick up rather than assuming one follows from the other. Re-running `npm install && npm run build` for the frontend in an environment with registry access is still outstanding from checkpoint 12 and unrelated to either.


## Checkpoint 12 — Teacher-scoped content authoring (item 15)

- Added an `ownerId` field to both questions and quizzes (`null` = admin/global content, otherwise the id of the teacher who authored it). Seed data ships with `ownerId: null`; `mockRepository.loadState()` backfills `ownerId: null` onto any question/quiz from a saved `localStorage` blob that predates this checkpoint, so upgrading doesn't crash on the new field.
- `mockRepository.js`'s `createQuestion`/`createQuiz` stamp `ownerId` from the caller (defaulting to `null` if omitted). `listQuestions(filter)`/`listQuizzes(filter)` now accept an optional `{ ownerId }` filter — omitted/undefined still returns everything (unchanged behavior for the admin workspace); passed, it scopes results to that owner's own content. `appService.js` passes the filter argument straight through.
- `adminQuestions.js` and `adminQuizzes.js` were both generalized to accept an `options` object (`scopeOwnerId`, `basePath`, `navActive`, `title`, `subtitle`) instead of being hardcoded to the admin workspace:
  - Unscoped (admin, unchanged defaults): shows the full question/quiz bank exactly as before, plus a new read-only **Owner** column on the question table so admins can see which questions were authored by which teacher vs. the admin-authored bank.
  - Scoped (`scopeOwnerId` set): the table/editor only shows and edits that owner's own content; the Owner column is hidden (everything shown already belongs to them); a "New question" / "New quiz" affordance lets them author directly instead of only importing. New content is stamped with `scopeOwnerId` on create.
  - **Deliberately NOT scoped even in the scoped page:** the curated question picker in the quiz builder (draws from the full active question bank platform-wide, since there's still no content-sharing/permissions model — see the pre-existing "In progress" note below — a brand-new teacher with zero authored questions still needs something to build a first quiz from) and `validateDraft`'s active-question-eligibility and quiz-code-uniqueness checks (both platform-wide constraints, checked against the full unscoped `questions`/`quizzes` lists regardless of which view is open). Editing a quiz from the *unscoped* admin view never touches its existing `ownerId` — `currentFormData` only adds an `ownerId` field to the save payload when the page itself is owner-scoped, so an admin editing a teacher's quiz can't accidentally reassign its ownership.
- New routes `#/teacher/questions` ("My questions") and `#/teacher/quizzes` ("My quizzes") in `main.js`, both calling the same `renderAdminQuestions`/`renderAdminQuizzes` functions the admin workspace uses, scoped to the signed-in teacher's identity. The `/teacher` route guard was broadened from an exact-string match to `path==='/teacher' || path.startsWith('/teacher/')` so the two new sub-routes are guarded the same way the existing route is (Teacher or Admin identity required).
- `teacher.js`'s dashboard gained two new cards — **My Questions** and **My Quizzes** — showing real counts (`appService.listQuestions({ownerId})`/`listQuizzes({ownerId})`) and linking to the new routes, replacing the static placeholder numbers item 15 called out. "Assign a quiz" was deliberately left listing every published quiz platform-wide (not just the teacher's own) — a teacher can assign admin-authored or another teacher's published content to their class, not only what they built themselves; this already worked correctly before this checkpoint since `listAssignments`/`isUserAssignedQuiz` never filtered by content ownership, only by class membership.
- `src/styles.css` — added a generic `.hidden{display:none}` utility (the codebase previously only had the narrower `.selection-panel.hidden`), used to toggle the new inline "New question" create form open/closed in `adminQuestions.js`.

### Verification (checkpoint 12)

- `node --check` passed for every modified file (`mockData.js`, `mockRepository.js`, `appService.js`, `adminQuestions.js`, `adminQuizzes.js`, `main.js`, `teacher.js`) and, as a regression check, every other `.js` file in `src/`.
- Ran an end-to-end Node script against the real `mockRepository` module (`localStorage` stubbed, real `crypto`): a teacher-authored question is created as `draft` with the correct `ownerId` and is invisible in another owner's scoped list but visible in the unscoped (admin) list alongside the full seed bank; activating it and building a curated quiz from it works; the quiz saves with `ownerId` intact through validate → publish; the scoped quiz list shows exactly the teacher's one quiz while the unscoped list shows all six; assigning the newly-published quiz to the teacher's own class and checking `isUserAssignedQuiz` confirms a joined learner gets real `restricted` access while an unrelated identity does not; and confirmed that patching a quiz through a payload that omits `ownerId` (simulating an *admin* editing a teacher's quiz from the unscoped workspace) leaves the existing `ownerId` untouched.
- Also separately verified the `ownerId` backfill path: a hand-built `localStorage` blob shaped like a pre-checkpoint-12 save (questions/quizzes with no `ownerId` key at all) loads cleanly and both backfill to `ownerId: null` rather than throwing or leaving the field `undefined`.
- The DOM-facing pieces (the new "New question" inline form's show/hide toggle, the Owner column's conditional rendering, the two new dashboard cards, the `#/teacher/questions`/`#/teacher/quizzes` route guard) were reviewed by hand against the same patterns already proven out elsewhere in the app (no DOM harness available offline, consistent with prior checkpoints) — the create-form toggle reuses the same `.hidden` class toggle pattern `adminQuizzes.js`'s `toggleSelection()` already used for `#automaticFields`/`#curatedFields`, just previously scoped to `.selection-panel.hidden` instead of a generic rule, which is why a generic `.hidden` utility was added rather than reusing the narrower selector.
- `npm install` failed in this environment with a registry 403 (no network access available this session), so `npm run build` could not be run. Nothing in this checkpoint added, removed, or upgraded a dependency, so this is a pre-existing environment limitation rather than a checkpoint-12 regression risk; recommend running `npm install && npm run build` before shipping.

### Next recommended task

Item 15 is done. The strongest remaining candidates are: a lightweight roster import and multi-class quiz assignment once real class sizes justify it (item 14), a genuine content-sharing/permissions model now that two authoring workspaces exist (so a teacher could, for instance, see and reuse another teacher's published quiz content rather than only assigning it — right now "sharing" is limited to assignment-level publish visibility, not co-authoring), or building out the standalone detailed-review route's remaining edge cases noted in item 5 if review usage grows. Re-running `npm install && npm run build` in an environment with registry access, to confirm the last two checkpoints' changes didn't regress the production build, would also be a good first move next session. Do not begin Supabase work.


## Completed

- Vite frontend foundation and responsive iOS-inspired design.
- Hash routing and reusable application shell.
- Mock repository/application-service architecture.
- Learner browse/search/category/CEFR filtering.
- Minimal quiz cards and preview.
- Practice and Assessment quiz experiences.
- Practice answer lock + immediate feedback.
- Assessment feedback hidden during quiz.
- Question navigator, previous/next, optional flagging.
- Timer only after quiz starts.
- Attempt randomization frozen at attempt creation.
- Persisted question order and answer-position mapping.
- LocalStorage persistence for mock attempts/questions/settings.
- Existing active attempts are resumed rather than duplicated.
- Attempt current-question position is persisted.
- Attempt history and results.
- TSV parser with required-column validation and per-row validation states.
- Import review table with exclusion/include controls.
- Import-valid-rows-as-drafts UI representation.
- XLSX adapter boundary explicitly represented; no XLSX dependency added yet.
- Question bank status controls: draft, validated, active, deleted.
- Question restore control.
- Inline question/category/tag editing through mock service.
- Stable question codes remain unchanged during edits.
- Import duplicate detection: normalized exact-match check against the current question bank and against other rows in the same file; word-overlap similarity check (≥60% Jaccard on normalized text) surfaces "possible duplicate" warnings against the closest existing question code.
- Exact duplicates are auto-excluded by default (still overridable via Include); possible duplicates are flagged but left included for reviewer judgment.
- Import review table now shows duplicate counts in the summary bar and a per-row duplicate badge naming the matched question code (or file row) and similarity score.
- Question versioning: content edits (question/explanation/category/tags/answers/correctIndex) automatically bump `versionId` (e.g. `-v1` → `-v2`) and push the prior content into a per-question `history[]` array with a timestamp and note. Status-only changes (draft/validated/active/deleted) intentionally do NOT bump the version — only content edits do.
- Question edit form now also edits explanation and answers (comma-separated, correct answer entered first) alongside question/category/tags; saving always resolves `correctIndex` to 0 since the UI keeps the correct answer first-listed.
- History UI: an inline "History" button per question row expands a version list (current version pinned at top, prior versions below with timestamp + note), each past version showing a "Revert to this" action.
- Revert restores a prior version's content onto the current record, bumps to a new version (it does not delete history — the version being replaced is appended to history too), and leaves `question_code` (the stable human-facing code) untouched.
- Import review rows can now be corrected in place (question, explanation, category, tag, answers with correct answer entered first, matching the question-bank edit form's convention) without re-uploading the file. Saving a correction re-runs both row validation (`Error` ↔ `Valid`) and duplicate detection (exact/potential) against the current bank and the rest of the file, and auto-excludes the row again if the correction turns it into an exact duplicate.
- "Import selected valid rows as drafts" now actually creates question-bank records via a new `mockRepository.createQuestion()` — no longer just a count. Each accepted row becomes a real `status: 'draft'` question with a generated `question_code`/`versionId` (same `PREFIX-TAG-000000` shape as the seed data, prefix derived from category, tag copied in as the level/tag, sequence number randomized with a uniqueness check) and a `source: { type: 'import', rowNumber }` field so drafted questions can be traced back to their originating row. Imported rows show a "Drafted" status, list their generated code in a "created as draft" summary panel with a link to the question bank, and can't be re-imported or re-edited once drafted.
- Mock identity switching: a dropdown in the topbar (`src/components/layout.js`) lets the person switch between Guest, Alex Learner, Ms. Taylor (Teacher), and Admin at any time. The choice is persisted (`mockRepository` `session` state, same `localStorage` blob as everything else) and drives `store.session`/`store.user` app-wide via a new `appService.session()`/`setSession()` pair. `getCurrentUser()` now resolves from the active session instead of being hardcoded to the learner.
- Guest one-free-quiz allocation is now real, not just a stored flag: `src/utils/access.js` exports `evaluateAccess(quiz, session, guestState)`, a pure helper mirroring `deriveAvailability`'s shape. A guest gets exactly one free `registered`-access quiz before sign-in is required for further ones; `public` quizzes are always open to everyone; `restricted` always requires a signed-in account (mocked — no group/assignment model yet, see item 7). Signed-in learner/teacher/admin identities can start any `registered` or `restricted` quiz (restricted is explicitly labeled as a mocked approximation in its `reason` text, since real group/assignment gating doesn't exist yet).
- `quizPreview.js` now combines `deriveAvailability` (workflow/scheduling) with `evaluateAccess` (account-level gating) to decide whether Start is enabled, and surfaces both as plain-language notices (e.g. "starting it will use your one free guest quiz" before the guest commits, or "you've already used your free guest quiz" after). The actual allocation consumption happens once the quiz genuinely starts (see next point), not just from evaluating the preview.
- `activeQuiz.js` re-checks `deriveAvailability`/`evaluateAccess` itself before starting a **fresh** attempt (guards a direct/bookmarked `#/quiz/:id/active` link that skipped the preview page) and is the single place that calls `useGuestAllocation()` — this was deliberately centralized in one spot instead of also consuming from `quizPreview.js`, because consuming in both places double-spent the guest's one free quiz and produced a false "already used" lockout on the very attempt they'd just been granted. The gate is skipped entirely when resuming an attempt already in progress, so a guest who spent their free quiz mid-attempt can still finish it.
- `quizBrowse.js` continues to only list quizzes that are workflow-available (`deriveAvailability(...).visible`); it does **not** hide `registered`/`restricted` quizzes from guests — they stay browsable with a small badge (`quizCard.js`) and the real gate applies at Start, so browsing itself never requires an account.
- Backfilled `mockRepository.loadState()` to default in the newly-added `session` field (and re-default `guest`/`settings` if missing) when restoring an older saved blob from `localStorage`, so upgrading to this checkpoint on a browser with existing mock state doesn't crash on the new session-aware code paths.
- **Checkpoint 10 — Teacher Mode workflows (item 7):** `src/services/mockRepository.js` gained `groups`/`assignments` persisted state plus `createGroup`/`deleteGroup`/`joinGroupByCode`/`removeGroupMember`/`listGroupsForMember`/`listGroups`/`listAssignments`/`createAssignment`/`deleteAssignment`/`isUserAssignedQuiz`/`listAttemptsForUser`. A group is a teacher's class with a generated 6-character join code (visually-unambiguous alphabet, case/whitespace-tolerant redemption); an assignment links a group to a published quiz with an optional due date; deleting a group cascade-deletes its assignments.
- `src/pages/teacher.js` was rewritten from a static dashboard mock into a real workspace: create a class, see its join code and member list, remove a member, delete a class, assign a published quiz to a class with an optional due date, remove an assignment, and see a per-member result row (Not started / In progress / score) for every assignment. Class detail is addressed via a `?group=id` hash query param, following the same pattern `adminQuizzes.js` already used for `?edit=id`.
- `src/pages/history.js` gained a "My classes" panel for signed-in learners: a join-code redemption form plus a read-only list of joined classes and the quizzes assigned to each (with due dates), so a learner can see what they've been assigned without visiting Teacher Mode.
- Attempts now carry a `userId` (the signed-in identity at the time the attempt was created, or `null` for a guest), stamped in `activeQuiz.js` on both fresh-attempt creation and legacy-attempt migration. This is what makes the per-member results table in Teacher Mode possible; seed attempts were backfilled with `userId: 'u-learner'`.
- **Real "restricted" enforcement** (closing the gap flagged in checkpoint 8/item 7): `src/utils/access.js`'s `evaluateAccess()` now takes an optional `hasGroupAccess` boolean. A `restricted` quiz is allowed for a signed-in learner only if they belong to a group with an assignment for that quiz; staff (`u-teacher`/`u-admin`) can still always preview a restricted quiz so they can check it before assigning it; guests remain always blocked. `quizPreview.js` and `activeQuiz.js` both compute `hasGroupAccess` via the new `appService.isUserAssignedQuiz()` before calling `evaluateAccess`.
- **Two pre-existing bugs fixed in passing:** (1) `src/main.js`'s route dispatch matched routes by exact string equality against the full hash including any `?query`, so a hash like `/admin/quizzes?edit=id` or the new `/teacher?group=id` never matched its route and fell through to "Page not found" — `render()` now strips the query before matching. (2) `renderAdminQuizzes` was being invoked from `main.js` without its `router` argument, so its internal `router.renderCurrent()` calls would have thrown on `undefined`; the dispatch now passes `router` through.

## In progress / intentionally simplified

- XLSX parsing still requires a browser-safe XLSX parser dependency.
- Duplicate detection currently runs on question text only (not answers/category); it is a heuristic (word-overlap), not a true similarity/embedding model — good enough to flag for human review, not to auto-reject.
- Version history has no diff highlighting (shows full prior text, not a word-level diff) and no way to permanently delete old versions.
- Detailed question-by-question review screen is not yet implemented as its own route (result.js's inline breakdown is functional but minimal — see item 5 below).
- Identity switching is a mock dropdown, not real auth — there's no password/session token, and anyone can flip to Admin instantly. This is fine for prototyping but is explicitly not a security boundary. This also means Teacher Mode's classes are scoped to a single fixed `u-teacher` identity (and separately to `u-admin` if an admin creates classes) rather than to real per-teacher accounts.
- Only one mock learner account (`u-learner`) exists, so a class's member list can only ever really grow to one real member in this prototype; the member-list/removal/results UI is built to handle many members correctly, but multi-learner testing will need either more mock users or real auth.
- Teacher Mode has no content sharing/permissions model yet ("Shared Content" on the dashboard is still a static number) — a teacher can only assign quizzes that already exist and are published, not build or share their own private question/quiz library.
- No bulk actions yet (assign one quiz to one class at a time; no CSV roster import for group membership, no assigning multiple classes to one quiz in one step).
- Timer is still client-side in the frontend prototype; server authority belongs to the later Supabase phase.
- No automated test runner is installed.

## Remaining — next priority

1. ~~Add import correction/review UI and generated draft metadata representation (structured draft object per accepted row, not just a count).~~ Done (checkpoint 7).
2. ~~Build automatic and curated quiz configuration forms.~~ Done (checkpoint 5).
3. ~~Add quiz validation and draft → configure → validate → preview/test → publish workflow.~~ Done (checkpoint 5).
4. ~~Add availability/access/review/navigation/timing configuration.~~ Done (checkpoint 6 for availability/review/navigation; `access` enforcement done checkpoint 8).
5. Build a detailed, question-by-question review screen respecting Practice/Assessment review settings beyond what `result.js` now does inline (e.g. a dedicated `/result/:id/review` route with question navigation, rather than one long scrolling list) — current implementation is functional but minimal.
6. ~~Add guest one-free-quiz UX, mock auth state switching, and access gates. Once this exists, come back and actually enforce `access: registered/restricted` on `quizBrowse.js` and `quizPreview.js`.~~ Done (checkpoint 8).
7. ~~Complete Teacher Mode workflows: groups, join codes, assignments, results. This is also the prerequisite for real "restricted" quiz enforcement.~~ Done for the core loop (checkpoint 10): classes/join codes/assignments/per-member results, and `restricted` access now genuinely checks group-assignment membership. Not done: teacher content sharing/permissions (a private question/quiz library a teacher builds and shares), and multi-teacher/multi-learner support is limited by there being only one mock account per role (see "In progress" above).
8. ~~Add loading/confirmation/form validation/accessibility states.~~ Done (checkpoint 11): confirmations on all destructive actions, disabled/"…ing" button states during mutations, empty/whitespace input rejection on the two previously-unguarded forms, global focus-visible ring, and aria-live/aria-label coverage for icon-only controls and status regions.
9. ~~Install/run production build and perform route/flow verification in an environment with dependencies available and network access.~~ Done (checkpoint 10) — see Verification below; `npm install`/`npm run build` both succeeded.
10. Consider whether duplicate detection should also weigh category/tag/answers, not just question text, once real import volume is known.
11. Consider adding word-level diff highlighting to the version history view once real edit volume shows it's needed.
12. Consider whether `deriveAvailability`'s "closed" quizzes should be surfaced anywhere for learners (e.g. attempt history still linking to a since-closed quiz) rather than only affecting browse/preview.
13. ~~Consider gating `/admin` and `/teacher` routes by the new mock session identity now that real identities exist.~~ Done (checkpoint 9).
14. ~~Consider a lightweight roster/CSV import for group membership, and letting a quiz be assigned to multiple classes at once, once real class sizes make one-at-a-time assignment tedious.~~ Done (checkpoint 13): a teacher can paste a roster (one learner per line, email or "Name, email"), preview matches against existing accounts before committing, and assign a quiz to several of their classes in one action.
15. ~~Consider giving teachers their own scoped question/quiz authoring area (the "My Questions" / "Shared Content" dashboard numbers are still static placeholders).~~ Done (checkpoint 12): `#/teacher/questions` and `#/teacher/quizzes` give teachers their own `ownerId`-scoped authoring workspace, with real dashboard counts. A genuine content-sharing/permissions model between teachers (beyond publish-time assignment visibility) remains out of scope.

## Files changed in checkpoint 8 (this checkpoint, 9 files)

- `src/utils/access.js` — new. `evaluateAccess(quiz, session, guestState)`, a pure helper (same style as `deriveAvailability`) that returns `{ allowed, label, reason, consumesFreeQuiz? }` for a quiz's `access` field against the current mock session/guest state.
- `src/services/mockRepository.js` — added `session` to persisted state (defaults to `{ identity: 'u-learner' }`, backfilled for older saved blobs); added `getSession()`/`setSession(identity)`; `getCurrentUser()` now resolves from the active session (returns `null` for `guest`) instead of being hardcoded to `u-learner`.
- `src/services/appService.js` — exposes `session()`/`setSession(identity)`.
- `src/core/store.js` — added `session` field.
- `src/main.js` — added `loadSession()` (populates `store.session`/`store.user`/`store.guest` together) and `wireShell()` (wires the topbar identity `<select>` after every route render); `init()` and `render()` updated to call both.
- `src/components/layout.js` — `shell()` now renders a session-identity `<select>` in the topbar (replacing the old static "Learner" link) and, for the guest identity, a banner stating whether their free quiz is still available or already used.
- `src/components/quizCard.js` — shows a small badge on non-public quizzes ("Sign-in required" / "Restricted") in the browse grid.
- `src/pages/quizPreview.js` — combines `deriveAvailability` and the new `evaluateAccess` to gate the Start button and surface a plain-language reason; no longer consumes the guest allocation itself (see `activeQuiz.js`).
- `src/pages/activeQuiz.js` — re-checks availability/access before starting a genuinely new attempt (protects direct/bookmarked links that skip the preview page) and is now the single place `useGuestAllocation()` is called, to avoid double-consuming a guest's free quiz; the check is skipped when resuming an attempt already in progress.
- `src/styles.css` — added `.session-switch`, `.guest-banner` (+ `.used` variant), `.access-tag`.
- `CLAUDE_HANDOFF.md` — this checkpoint.

## Files changed in checkpoint 7 (carried forward, 5 files)

- `src/services/importParser.js` — extracted row validation into a standalone, re-callable `validateRow(row)` (used on first parse and again after a manual correction); added `revalidateDuplicate(row, allRows, existingQuestions)` to re-run exact/potential duplicate detection for a single corrected row against the bank and the rest of the file; added `buildDraftPayload(row)` to turn an accepted row into the exact question payload shape `createQuestion` expects (answers reordered so the correct one is index 0, `source: { type: 'import', rowNumber }` attached).
- `src/services/mockRepository.js` — added `createQuestion(data)`: generates a unique `question_code` (`PREFIX-TAG-000000`, prefix from category, retried on collision), sets `versionId` to `${code}-v1`, `status: 'draft'`, empty `history: []`, and inserts into the question bank with `created_at`/`updated_at`.
- `src/services/appService.js` — exposes `createQuestion`.
- `src/pages/importPage.js` — rewritten to fully re-render the review table on every state change (edit, exclude/include, import) instead of only patching individual cells; adds an inline "Edit" action per row (question/explanation/category/tag/answers) that re-validates and re-checks duplicates on save; "Import selected valid rows as drafts" now calls `appService.createQuestion` per accepted row instead of only showing a count, marks imported rows `Drafted` and locks their actions, and renders a "created as draft" panel listing each generated `question_code` with a link to the question bank.
- `src/styles.css` — added `.status.drafted` (reuses the existing active/published green treatment).
- `CLAUDE_HANDOFF.md` — this checkpoint.

## Files changed in checkpoint 6 (carried forward, 4 files)

- `src/services/mockRepository.js` — `updateQuestion()` now detects content-field changes (question/category/tags/explanation/answers/correctIndex) vs. status-only changes; content changes push the prior version into `history[]` and bump `versionId`. Added `getQuestionHistory(id)` and `revertQuestion(id, versionId)` (restores prior content under a new version, preserves `question_code`, keeps the replaced version in history).
- `src/services/appService.js` — exposes `getQuestionHistory` and `revertQuestion`.
- `src/pages/adminQuestions.js` — adds a "History" button per question row that expands an inline version list (current + past versions, timestamps, revert action); edit form extended to cover explanation and answers (correct answer entered first, `correctIndex` resolved to 0 on save).
- `src/styles.css` — added `.history-row`, `.version-list`, `.version-entry`, `.version-preview`, `.edit-explanation` styles.

## Files changed in checkpoint 3 (carried forward)

- `src/services/importParser.js` — added `detectDuplicates()`: normalized exact-match + word-overlap potential-match detection against the existing question bank and within the uploaded file.
- `src/pages/importPage.js` — wires duplicate detection into the review table (summary counts, per-row badges, auto-exclude of exact duplicates).
- `src/styles.css` — added `.status.error/.duplicate`, `.duplicate-exact`, `.duplicate-potential` styles.

## Files changed in checkpoint 2 (carried forward)

- `src/services/mockRepository.js` — persistent mock state, active-attempt lookup, question updates.
- `src/services/appService.js` — exposes active attempt and question update operations.
- `src/pages/activeQuiz.js` — frozen randomization, resume reconstruction, persisted current question, expiry handling.
- `src/pages/history.js` — resume existing active attempt.
- `src/pages/adminQuestions.js` — question editing and lifecycle controls.

## Routes

- `/quizzes`
- `/quiz/:id`
- `/quiz/:id/active`
- `/result/:id`
- `/history`
- `/admin`
- `/admin/questions`
- `/admin/import`
- `/admin/quizzes`
- `/teacher`
- `/teacher/questions`
- `/teacher/quizzes`

## Architecture

UI → `appService` → `mockRepository` → mock data/localStorage.

Do not couple pages/components directly to Supabase. The eventual backend should replace the repository layer while preserving application-service contracts.

## Verification

- `node --check` passed for all modified JavaScript modules (`mockRepository.js`, `appService.js`, `adminQuestions.js`).
- `npm install` succeeded in this environment (14 packages, ~10s).
- `npm run build` (`vite build`) passed cleanly: 22 modules transformed, `dist/` produced with no errors or warnings.
- Versioning logic was sanity-checked directly with Node against the mock repository: confirmed status-only changes do not bump the version, content edits bump the version and append to history, `getQuestionHistory` returns the expected entries, and `revertQuestion` restores prior content, bumps to a new version, and leaves `question_code` unchanged.
- Duplicate-detection logic (checkpoint 3) was previously sanity-checked against sample TSV rows (exact match vs. existing bank, word-overlap "possible duplicate", and in-file duplicate rows all detected correctly).

## Next recommended task

Guest/auth + access gating (item 6) is now done. The two strongest remaining candidates are the **detailed question-by-question review screen** (item 5) or **Teacher Mode workflows** (item 7 — also the prerequisite for real "restricted" quiz enforcement, since that's currently mocked as "any signed-in account"). Gating `/admin`/`/teacher` by the new mock identity (item 13) is a smaller, low-risk follow-up that could go either before or alongside either of those. Do not begin Supabase work.

## Checkpoint 8 — Guest/auth state and access gating

- Added a mock identity switcher (Guest / Alex Learner / Ms. Taylor · Teacher / Admin) as a dropdown in the topbar, persisted via `mockRepository`'s `session` state.
- Added `src/utils/access.js`'s `evaluateAccess()`: `public` quizzes are always open; `registered` quizzes are open to any signed-in identity and to a guest exactly once (their "one free quiz"); `restricted` quizzes require a signed-in identity (mocked, since there's no group/assignment model yet).
- Wired real enforcement into `quizPreview.js` (Start button disabled + plain-language reason shown) and `activeQuiz.js` (safety-net re-check for direct links, and the single place the guest allocation is actually consumed).
- `quizBrowse.js` still shows all workflow-available quizzes regardless of access level (browsing never requires an account) — `registered`/`restricted` quizzes just carry a small badge via `quizCard.js` so the gate is discoverable before clicking in.
- Backfilled `mockRepository.loadState()` so a `localStorage` blob saved by an earlier checkpoint (missing the new `session` field) doesn't crash on load.

### Verification (checkpoint 8)

- `node --check` passed for every modified/added file (`access.js`, `mockRepository.js`, `appService.js`, `store.js`, `main.js`, `layout.js`, `quizCard.js`, `quizPreview.js`, `activeQuiz.js`).
- `npm install` and `npm run build` (`vite build`) both succeeded in this environment: 24 modules transformed, `dist/` produced with no errors or warnings.
- Ran an end-to-end Node script against the real `mockRepository`/`access.js` modules (localStorage/structuredClone stubbed): confirmed a guest can start a `public` quiz freely, can start exactly one `registered` quiz (first one allowed with `consumesFreeQuiz: true`, second one blocked with an explicit "already used" reason after consuming), is always blocked from `restricted` quizzes; confirmed a signed-in `u-learner` session is allowed on both `registered` and `restricted`; confirmed switching identity via `setSession()` persists and correctly changes what `getCurrentUser()` resolves to (including `null` for guest), and that an invalid identity string safely falls back to `guest` instead of corrupting state; confirmed an unpublished quiz stays gated by `deriveAvailability` regardless of its `access` level.
- Specifically caught and fixed a double-consumption bug during this checkpoint: an earlier draft had both `quizPreview.js` and `activeQuiz.js` calling `useGuestAllocation()`, which meant a guest's very first (and only legitimately allowed) registered quiz would immediately re-evaluate as "already used" and fail to start. Consumption is now centralized in `activeQuiz.js` only; `quizPreview.js` evaluates but never mutates guest state.
- The DOM-level wiring in `main.js`/`layout.js` (the `<select>` in the topbar, `wireShell()` re-render-on-switch) was reviewed by hand (no DOM harness available offline); it follows the same "call `appService`, refresh local state, re-render" pattern already proven out elsewhere in the app (e.g. `adminQuestions.js`'s status/edit/revert handlers).

## Checkpoint 7 — Import correction UI + real draft creation

- Import review rows are now correctable in place: an "Edit" action on any non-imported row turns it into an inline form (question, explanation, category, tag, answers with correct-first convention) with Save/Cancel, matching the question-bank edit form's UX.
- Saving a correction re-runs row validation and duplicate detection scoped to that row (`validateRow`, `revalidateDuplicate`), so a row can move from `Error` to `Valid` (or the reverse) and duplicate badges/auto-exclusion stay correct without re-uploading the file.
- "Import selected valid rows as drafts" now performs a real write: each accepted, non-excluded, non-duplicate row is sent through `appService.createQuestion` and lands in the same question bank `adminQuestions.js` reads from, as a `status: 'draft'` record with a freshly generated `question_code`/`versionId` and a `source: { type: 'import', rowNumber }` trace field.
- Drafted rows are locked (status shows `Drafted`, Edit/Exclude actions removed, can't be re-imported) and a summary panel lists every created record's generated code with a link to `#/admin/questions`, replacing the old "N valid rows accepted" text-only count.
- The `import-valid` button now only acts on rows not already drafted, so re-triggering it after adding more corrections doesn't recreate existing drafts.

### Verification (checkpoint 7)

- `node --check` passed for all modified files (`importParser.js`, `mockRepository.js`, `appService.js`, `importPage.js`).
- `npm install` and `npm run build` (`vite build`) both succeeded in this environment (network access to the npm registry was available this checkpoint, unlike checkpoint 6): 23 modules transformed, `dist/` produced with no errors or warnings.
- Ran an end-to-end Node script (localStorage/structuredClone stubbed, real `crypto`) exercising the full flow against the real `mockRepository`/`importParser` modules: parsed a 4-row TSV with one exact duplicate of an existing bank question, one row with a validation error (empty question), one unique valid row, and one row that's an in-file duplicate of the unique row; confirmed initial states and duplicate flags were all correct, confirmed correcting the error row moved it to `Valid` with no duplicate, confirmed only the two truly-valid non-duplicate rows were selected for import, confirmed `createQuestion` produced two new `status: 'draft'` records with unique generated `question_code`s and answers correctly reordered so the correct answer is index 0, and confirmed the question bank's total size and code-uniqueness held after the write.
- `importPage.js`'s new render/edit/import DOM logic was reviewed by hand (no DOM harness available offline); it reuses the same full-re-render-after-mutation pattern already proven out in `adminQuestions.js`.

## Checkpoint 5 — Quiz builder

- Added automatic and curated quiz configuration forms in `src/pages/adminQuizzes.js`.
- Added quiz creation/update operations to `mockRepository.js` and `appService.js`.
- Automatic selection filters active questions by category, CEFR level, and optional tag, with a configurable count.
- Curated selection allows exact question selection from the question bank.
- Added validation rules for title, code, question selection, assessment timing, maximum duration, active-question eligibility, and duplicate quiz codes.
- Added workflow controls for Save configuration, Validate, Preview/Test, and Publish. Publishing is enabled after validation.
- Added responsive builder styles.
- Supabase remains intentionally deferred.

## Checkpoint 6 — Availability, review depth, and navigation mode

- Added `navigation` (`free` / `sequential`) and `availableFrom` / `availableTo` fields to the quiz builder form, `createQuiz`, and `updateQuiz`'s config-change detection (changing either resets the quiz to `draft`, consistent with other config fields).
- Added `src/utils/availability.js` — a pure `deriveAvailability(quiz, now)` helper that computes learner-facing visibility from the stored workflow `status` plus the optional availability window, without mutating the stored record. States: `unpublished`, `scheduled`, `closed`, `available`.
- `quizBrowse.js` now only lists quizzes where `deriveAvailability(quiz).visible` is true — previously it listed every quiz regardless of draft/validated/published status, so unfinished quizzes built in the admin quiz builder were immediately visible to learners. This was the most significant correctness gap found this checkpoint.
- `quizPreview.js` shows a "not currently open" notice and disables Start when a quiz is unpublished/scheduled/closed (e.g. someone opens a direct link to a quiz that isn't live).
- `adminQuizzes.js` table now shows a derived "Availability" column (Live / Scheduled for.../Closed since.../Not published) next to the workflow `status` column, so admins can see learner-facing visibility at a glance even though the stored status itself only reflects draft/validated/published.
- `activeQuiz.js` now respects `navigation: 'sequential'` by disabling the Previous button and disabling all question-navigator dots (forward-only progress); `navigation: 'free'` (default) keeps the existing jump-anywhere behavior.
- `result.js` was rewritten to respect the quiz's `review` setting, which previously existed as a config field but was never read anywhere:
  - `full` — shows the score ring plus a full per-question breakdown (learner's answer, correct answer when wrong, and explanation), rebuilt from `attempt.randomization.questionOrder` and `attempt.responses` against the question bank.
  - `limited` — shows the score ring only; explains that detailed per-question review isn't available for this quiz.
  - `none` — hides the score entirely and shows only a completion confirmation.
- Added `.review-list` / `.review-row` styles to `styles.css`.

### Verification (checkpoint 6)

- `node --check` passed for every modified/added file (`mockRepository.js`, `adminQuizzes.js`, `quizBrowse.js`, `quizPreview.js`, `activeQuiz.js`, `result.js`, `availability.js`).
- No live network access in this environment, so `npm install`/`npm run build` could not be run this checkpoint (registry access was blocked). Recommend running both before shipping, though nothing in this checkpoint touches dependencies.
- Sanity-tested `deriveAvailability` and the repository's new fields directly with a small Node script (localStorage/structuredClone stubbed, real `crypto`): confirmed a draft quiz with a future `availableFrom` is invisible, a published quiz with a future `availableFrom` reports `scheduled`, a published quiz inside its window reports `available`, a published quiz past `availableTo` reports `closed`, and changing `navigation` on an existing quiz resets its status to `draft` like other config fields.
- `result.js`'s review-mode branching was reviewed by hand (no DOM harness available offline); logic mirrors the same response/versionId lookup pattern already proven out in `activeQuiz.js`.


## Files changed in checkpoint 11 (7 files)

- `src/pages/teacher.js` — confirmations on "Delete class" (names the class, warns it cascades to assignments/results), "Remove assignment", and "Remove member"; the create-class form now rejects an empty/whitespace-only name with an inline message instead of relying solely on `required`; "Create class" and "Assign" buttons disable and show progress text during their mutation; the class-name input and both `<div>` message slots gained `aria-label`/`role="alert"`.
- `src/pages/adminQuestions.js` — changing a question's status to `deleted` via the status `<select>` now confirms first (and reverts the `<select>` back to its previous value on cancel, tracked via a `data-prev` attribute); reverting a question to a prior version confirms first; saving an edit now rejects empty question text or fewer than two answers with an `alert()` instead of silently writing bad data, and the Save button shows "Saving…" while the write is in flight; the status `<select>` gained a descriptive `aria-label`.
- `src/pages/history.js` — the class join-code form now rejects an empty code with an inline message, disables its button and shows "Joining…" while `joinGroupByCode` runs, and re-enables the button on failure; the input and message `<div>` gained `aria-label`/`role="alert"`.
- `src/pages/adminQuizzes.js` — publishing a quiz now confirms first (names the quiz, notes it becomes learner-visible); Save/Validate/Publish buttons disable and show progress text ("Saving…"/"Validating…"/"Publishing…") while their mutation runs; the validation box gained `role="status" aria-live="polite"` so screen readers hear validation results update as the form changes.
- `src/pages/activeQuiz.js` — clicking "Finish" with unanswered questions remaining now confirms first (wording differs for Practice vs. Assessment, since Assessment marks unanswered items incorrect); the question-navigator dots gained descriptive `aria-label`s (question number, current/answered/flagged state) and `aria-current`; the practice-mode feedback panel gained `role="status" aria-live="polite"` so correct/incorrect feedback is announced without moving focus.
- `src/pages/quizBrowse.js` — the search input and both filter `<select>`s gained `aria-label`s (they previously relied on placeholder text / visual context alone); the decorative search-icon glyph is now `aria-hidden`; added a visually-hidden `aria-live="polite"` result-count region so a screen-reader user hears how many quizzes matched after searching/filtering, since the grid itself isn't practical to read aloud in full on every change.
- `src/pages/importPage.js` — the decorative upload-icon glyph is now `aria-hidden`; the file-status text gained `role="status" aria-live="polite"` so "Parsing…"/row-count updates are announced.
- `src/components/layout.js` — the brand-mark "Q" glyph is now `aria-hidden` (redundant with the adjacent "QuizLab" text).
- `src/styles.css` — added a global `:focus-visible` outline rule covering every interactive element (links, inputs, selects, textareas, buttons — previously only `.button`/`.answer`/`.dot`/`.session-switch` had a visible focus ring, so tab-only navigation lost its position on plain links and form fields); added a standard `.sr-only` utility class for visually-hidden-but-announced text (used by the new quiz-browse result-count region).

### Verification (checkpoint 11)

- `node --check` passed for every modified file (`teacher.js`, `adminQuestions.js`, `history.js`, `adminQuizzes.js`, `activeQuiz.js`, `quizBrowse.js`, `importPage.js`, `layout.js`) and, as a regression check, every other `.js` file in `src/` that this checkpoint didn't touch.
- `npm install` failed in this environment with a registry 403 (no network access available this session), so `npm run build` could not be re-verified end-to-end this checkpoint. Recommend running `npm install && npm run build` before shipping — nothing in this checkpoint added, removed, or upgraded a dependency, so the checkpoint-10 build result (25 modules, no errors) is the best available signal that the build itself is sound; the risk surface this checkpoint is purely markup/CSS/event-handler changes to already-working pages.
- Every change was reviewed by hand against the DOM structure it modifies (no jsdom/browser harness available offline, consistent with prior checkpoints' verification approach): confirmed each new `confirm()`/`alert()` guard sits before its corresponding mutation call and that cancelling leaves state untouched (e.g. the question-status `<select>` reset via `data-prev` on a cancelled delete); confirmed each new disabled-button state only fires after its own validation passes (so a still-invalid quiz form doesn't get stuck disabled); confirmed no changed `id`/class selector collides with an existing one.

### Next recommended task

The polish item (item 8) that had been open since checkpoint 6 is now done. The strongest remaining candidates are: a lightweight roster import and multi-class quiz assignment once real class sizes justify it (item 14), giving teachers their own scoped content-authoring area so "My Questions"/"Shared Content" stop being static dashboard numbers (item 15), or building out the standalone detailed-review route's remaining edge cases noted in item 5 if review usage grows. Re-running `npm install && npm run build` in an environment with registry access, to confirm this checkpoint's markup/CSS changes didn't regress the production build, would also be a good first move next session. Do not begin Supabase work.


## Checkpoint 9 — frontend completion pass

- Added a dedicated question-by-question review route at `#/result/:attemptId/review` for quizzes with `review: full`, with previous/next navigation, question navigator, selected/correct answer states, and explanations.
- Result pages now link directly to the detailed review when the quiz permits full review.
- Added role-aware route guards: Admin routes require the mock Admin identity; Teacher requires Teacher or Admin. Unauthorized direct/bookmarked routes now fail closed with a clear recovery action.
- Navigation now only exposes Admin/Teacher workspaces to identities that can use them.
- Added keyboard focus-visible states and responsive review controls.
- Verified every frontend JavaScript file with `node --check` successfully.
- Production build could not be executed in this environment because Vite dependencies are not installed and npm registry/cache access is unavailable; `npm install --offline` failed on an uncached package. The source remains syntactically valid.

## Checkpoint 10 — Teacher Mode workflows (classes, join codes, assignments, results)

- Added `groups` (a teacher's class, with a generated join code and a `memberIds` list) and `assignments` (a quiz assigned to a group, with an optional due date) to the mock data model and persisted state, with `localStorage` backfill (`saved.groups ||= []`, `saved.assignments ||= []`) so an existing saved session doesn't crash on upgrade. A demo group (`DEMO01`, pre-joined by `u-learner`) and a demo assignment ship as seed data for a fresh session.
- `mockRepository.js`: `createGroup`, `deleteGroup` (cascades to that group's assignments), `joinGroupByCode` (case/whitespace-tolerant, throws on an unknown code or missing user id), `removeGroupMember`, `listGroupsForMember`, `listGroups`, `listAssignments` (filterable by `groupId` or `teacherId`), `createAssignment`, `deleteAssignment`, `isUserAssignedQuiz` (the real restricted-access check), `listAttemptsForUser`. All exposed through `appService.js` with the same names.
- `src/pages/teacher.js` rewritten: create/delete classes; a "Manage" view per class (via `?group=id` in the hash, mirroring `adminQuizzes.js`'s `?edit=id` pattern) showing members with a remove action, an "Assign a quiz" form scoped to published quizzes with an optional due date, and per-assignment results — one row per member showing Not started / In progress / `score/total`, computed from that member's most-recently-dated attempt for the assigned quiz.
- `src/pages/history.js` gained a "My classes" panel: a join-code redemption form for any signed-in identity, and (for classes already joined) a read-only summary of assigned quizzes with due dates. Guests see a prompt to sign in instead of a broken form, since a code has to redeem into a persistent identity.
- `activeQuiz.js` now stamps `userId` on every attempt (the signed-in identity, or `null` for a guest) at both fresh-attempt creation and legacy-attempt migration, since Teacher Mode's results view needs to know whose attempt is whose. Seed attempts were backfilled with `userId: 'u-learner'`.
- `src/utils/access.js`'s `evaluateAccess()` gained an optional `hasGroupAccess` parameter (default `false`, so existing callers/tests aren't silently broken). For a `restricted` quiz: staff (`u-teacher`/`u-admin`) are always allowed (so they can preview before assigning); a signed-in learner is allowed only if `hasGroupAccess` is true; a guest is always blocked, unchanged from before. `quizPreview.js` and `activeQuiz.js` each compute `hasGroupAccess` via `appService.isUserAssignedQuiz(identity, quiz.id)` before calling `evaluateAccess`.
- Fixed two pre-existing bugs surfaced while wiring the `?group=id` navigation pattern: `main.js`'s route dispatch compared the full hash (including any `?query`) against each route string, so a query-bearing hash never matched and 404'd — `render()` now matches on the hash with the query stripped. Separately, `renderAdminQuizzes` was being called from `main.js` without the `router` argument its own click/submit handlers rely on (`router.renderCurrent()` would have thrown `undefined.renderCurrent` the first time a person used "New quiz", "Configure", "Save configuration", "Validate", or "Publish" against a hash that included `?edit=id`, i.e. every time after the first) — the dispatch now passes `router` through.

### Files changed in checkpoint 10 (7 files)

- `src/data/mockData.js` — added `groups`/`assignments` seed arrays; added `userId` to seed attempts.
- `src/services/mockRepository.js` — new persisted `groups`/`assignments` state plus the group/assignment/results functions listed above; `generateJoinCode()` helper.
- `src/services/appService.js` — exposes the new repository functions.
- `src/utils/access.js` — `evaluateAccess()` gained `hasGroupAccess` and real restricted-quiz logic (staff always allowed, learner allowed only if assigned, guest always blocked).
- `src/pages/quizPreview.js`, `src/pages/activeQuiz.js` — compute `hasGroupAccess` via `appService.isUserAssignedQuiz()` and pass it to `evaluateAccess()`; `activeQuiz.js` also stamps `userId` on attempts.
- `src/pages/teacher.js` — rewritten from a static dashboard into the full class/assignment/results workflow described above.
- `src/pages/history.js` — added the "My classes" join-code and assigned-quizzes panel.
- `src/main.js` — route dispatch strips `?query` before matching; `renderAdminQuizzes` call now passes `router`.
- `CLAUDE_HANDOFF.md` — this checkpoint.

### Verification (checkpoint 10)

- `node --check` passed for every modified/added file (`mockData.js`, `mockRepository.js`, `appService.js`, `access.js`, `quizPreview.js`, `activeQuiz.js`, `teacher.js`, `history.js`, `main.js`).
- `npm install` and `npm run build` (`vite build`) both succeeded in this environment: 25 modules transformed, `dist/` produced with no errors or warnings.
- Ran an end-to-end Node script against the real `mockRepository`/`access.js` modules (`localStorage`/`structuredClone` stubbed, real `crypto`): confirmed the seed group/assignment load correctly; confirmed a newly created group gets a unique, correctly-shaped join code; confirmed joining by code is case/whitespace-tolerant and idempotent (joining twice doesn't duplicate membership) and throws on an unknown code; confirmed a learner has no access to a restricted quiz until assigned via their group, has access once assigned, and loses access again once the assignment is removed; confirmed `evaluateAccess()` allows an assigned learner, blocks an unassigned learner, always allows staff, and always blocks a guest, on the same restricted quiz; confirmed removing a member and deleting a group both work, and deleting a group cascade-deletes its assignments; confirmed `listAttemptsForUser` only returns that user's own attempts and that the seed attempt is correctly attributed to `u-learner`.
- The DOM-level wiring in `teacher.js`/`history.js` (forms, manage/close/delete buttons, the `?group=id` hash pattern) was reviewed by hand against the same "call `appService`, then `router.renderCurrent()`" pattern already proven out in `adminQuizzes.js` (no DOM harness available offline) — this checkpoint is also what surfaced and fixed the `main.js` query-stripping and missing-`router`-argument bugs described above, both of which the hash-query pattern depends on.

### Next recommended task

The core Teacher Mode loop (item 7) and the production-build/route-verification item (item 9) are now done. The strongest remaining candidates are: loading/confirmation/form-validation/accessibility polish (item 8, still open since checkpoint 6), a lightweight roster import and multi-class quiz assignment once real class sizes justify it (item 14), or giving teachers their own scoped content-authoring area so "My Questions"/"Shared Content" stop being static dashboard numbers (item 15). Do not begin Supabase work.
