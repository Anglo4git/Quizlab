const REQUIRED = ['question','category','tag','explanation','correct_index','answer_1','answer_2'];
const OPTIONAL_ANSWERS = ['answer_3','answer_4','answer_5','answer_6','answer_7','answer_8'];

// Re-checks a row's issues/state in place. Called on initial parse and again
// after a reviewer corrects a row in the review UI, so corrections can turn
// an Error row into a Valid one (or vice versa) without re-parsing the file.
export function validateRow(row) {
  const answers = (row.answers || []).filter(Boolean);
  const correct = Number(row.correctIndex);
  const issues = [];
  if (!row.question) issues.push('Question is empty');
  if (!row.category) issues.push('Category is empty');
  if (!Number.isInteger(correct) || correct < 0 || correct >= answers.length) issues.push('Invalid correct_index');
  if (answers.length < 2) issues.push('At least 2 answers required');
  row.answers = answers;
  row.correctIndex = correct;
  row.issues = issues;
  row.state = issues.length ? 'Error' : 'Valid';
  return row;
}

export function parseTSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return { headers: [], rows: [], errors: ['The file is empty.'] };
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  const missing = REQUIRED.filter(h => !headers.includes(h));
  if (missing.length) return { headers, rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] };
  const rows = lines.slice(1).map((line, i) => {
    const cells = line.split('\t'); const row = {};
    headers.forEach((h,j) => row[h] = (cells[j] ?? '').trim());
    const answers = [row.answer_1, row.answer_2, ...OPTIONAL_ANSWERS.map(k => row[k])].filter(Boolean);
    const rowObj = { rowNumber: i + 2, ...row, answers, correctIndex: Number(row.correct_index), issues: [], state: 'Valid' };
    return validateRow(rowObj);
  });
  return { headers, rows, errors: [] };
}

function normalizeQuestionText(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function wordOverlapSimilarity(a, b) {
  const wa = new Set(a.split(' ').filter(Boolean));
  const wb = new Set(b.split(' ').filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  wa.forEach(w => { if (wb.has(w)) overlap += 1; });
  const union = new Set([...wa, ...wb]).size;
  return union ? overlap / union : 0;
}

const POTENTIAL_DUPLICATE_THRESHOLD = 0.6;

// Marks each row with a `duplicate` field: null, or
// { type: 'exact'|'potential', against: <question_code or row label>, score }
// Mutates and returns `rows`. `existingQuestions` should be the current question bank
// (as returned by appService.listQuestions()).
export function detectDuplicates(rows, existingQuestions = []) {
  const existingNormalized = existingQuestions.map(q => ({
    code: q.question_code || q.id,
    norm: normalizeQuestionText(q.question)
  })).filter(e => e.norm);

  const seenInFile = new Map(); // normalized text -> row label already processed

  rows.forEach(row => {
    row.duplicate = null;
    const norm = normalizeQuestionText(row.question);
    if (!norm) return;

    const exactExisting = existingNormalized.find(e => e.norm === norm);
    if (exactExisting) {
      row.duplicate = { type: 'exact', against: exactExisting.code, score: 1 };
      return;
    }
    const exactInFile = seenInFile.get(norm);
    if (exactInFile) {
      row.duplicate = { type: 'exact', against: `row ${exactInFile}`, score: 1 };
      seenInFile.set(norm, row.rowNumber);
      return;
    }

    let bestScore = 0, bestCode = null;
    existingNormalized.forEach(e => {
      const score = wordOverlapSimilarity(norm, e.norm);
      if (score > bestScore) { bestScore = score; bestCode = e.code; }
    });
    if (bestScore >= POTENTIAL_DUPLICATE_THRESHOLD) {
      row.duplicate = { type: 'potential', against: bestCode, score: bestScore };
    }
    seenInFile.set(norm, row.rowNumber);
  });

  return rows;
}

// Re-checks a single row's `duplicate` field after a correction, against the
// existing bank plus the other rows already parsed from this file.
export function revalidateDuplicate(row, allRows, existingQuestions = []) {
  const existingNormalized = existingQuestions.map(q => ({
    code: q.question_code || q.id,
    norm: normalizeQuestionText(q.question)
  })).filter(e => e.norm);

  row.duplicate = null;
  const norm = normalizeQuestionText(row.question);
  if (!norm) return row;

  const exactExisting = existingNormalized.find(e => e.norm === norm);
  if (exactExisting) { row.duplicate = { type: 'exact', against: exactExisting.code, score: 1 }; return row; }

  const exactInFile = allRows.find(r => r !== row && normalizeQuestionText(r.question) === norm);
  if (exactInFile) { row.duplicate = { type: 'exact', against: `row ${exactInFile.rowNumber}`, score: 1 }; return row; }

  let bestScore = 0, bestCode = null;
  existingNormalized.forEach(e => {
    const score = wordOverlapSimilarity(norm, e.norm);
    if (score > bestScore) { bestScore = score; bestCode = e.code; }
  });
  if (bestScore >= POTENTIAL_DUPLICATE_THRESHOLD) row.duplicate = { type: 'potential', against: bestCode, score: bestScore };
  return row;
}

// Builds the structured draft-question payload for an accepted import row,
// in the same shape `mockRepository.createQuestion` expects. Kept separate
// from the repository call so the review UI can preview the exact object
// that will be created before it commits anything.
export function buildDraftPayload(row) {
  const correct = row.answers[row.correctIndex];
  const orderedAnswers = [correct, ...row.answers.filter((_, i) => i !== row.correctIndex)];
  return {
    question: row.question,
    category: row.category,
    tags: [row.tag].filter(Boolean),
    explanation: row.explanation || '',
    answers: orderedAnswers,
    correctIndex: 0,
    source: { type: 'import', rowNumber: row.rowNumber }
  };
}

export async function parseFile(file) {
  if (file.name.toLowerCase().endsWith('.tsv')) return parseTSV(await file.text());
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    return { headers: [], rows: [], errors: ['XLSX adapter boundary reached. Add a browser XLSX parser dependency in the frontend build; no database work is required.'] };
  }
  return { headers: [], rows: [], errors: ['Unsupported file type. Please choose TSV or XLSX.'] };
}
