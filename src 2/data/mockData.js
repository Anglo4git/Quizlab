export const users = [
  { id: 'u-admin', name: 'Admin', email: 'admin@quizlab.test', role: 'admin' },
  { id: 'u-teacher', name: 'Ms. Taylor', email: 'teacher@quizlab.test', role: 'teacher' },
  { id: 'u-learner', name: 'Alex Learner', email: 'learner@quizlab.test', role: 'learner' }
];

const q = (id, text, category, tag, explanation, answers, correctIndex) => ({
  id, question_code: id, versionId: `${id}-v1`, question: text, category, tags: [tag], explanation, answers, correctIndex, status: 'active', ownerId: null
});

export const questions = [
  q('GRM-A1-000123','She ___ to school every day.','Grammar','A1','Use the present simple for routines.','goes,go,going,went'.split(','),0),
  q('GRM-A1-000124','They ___ football on Sundays.','Grammar','A1','Use the base form after “they”.','play,plays,played,playing'.split(','),0),
  q('VOC-A2-000201','Which word means “very happy”?','Vocabulary','A2','“Delighted” means very happy or pleased.','delighted,careful,tired,angry'.split(','),0),
  q('PRE-A2-000305','The keys are ___ the table.','Prepositions','A2','Use “on” for a position on a surface.','on,in,at,by'.split(','),0),
  q('TNS-B1-000411','I ___ here since 2022.','Tenses','B1','Present perfect with “since” describes an action/state continuing to now.','have lived,lived,am living,live'.split(','),0),
  q('MOD-B1-000412','You ___ wear a seat belt.','Modal Verbs','B1','“Must” expresses a strong obligation.','must,might,would,could'.split(','),0),
  q('COND-B2-000501','If I had more time, I ___ another language.','Conditionals','B2','Second conditional: if + past, would + base verb.','would learn,learned,will learn,learn'.split(','),0),
  q('VOC-C1-000601','The report was clear and ___.','Vocabulary','C1','“Concise” means brief and clear.','concise,fragile,remote,casual'.split(','),0)
];

export const quizzes = [
  { id:'quiz-present-a1', quiz_code:'GRM-A1-PRESENT', title:'Present Simple Essentials', category:'Grammar', tags:['A1','Present Simple'], description:'Practice the present simple in everyday English.', mode:'practice', status:'published', questionIds:['GRM-A1-000123','GRM-A1-000124'], questionCount:2, timeLimit:null, access:'public', review:'full', randomizeQuestions:true, randomizeAnswers:true, flagging:true, ownerId:null },
  { id:'quiz-everyday-a2', quiz_code:'VOC-A2-EVERYDAY', title:'Everyday English Vocabulary', category:'Vocabulary', tags:['A2','Vocabulary'], description:'Build useful vocabulary for everyday communication.', mode:'practice', status:'published', questionIds:['VOC-A2-000201','PRE-A2-000305'], questionCount:2, timeLimit:null, access:'registered', review:'full', randomizeQuestions:true, randomizeAnswers:true, flagging:true, ownerId:null },
  { id:'quiz-grammar-b1', quiz_code:'GRM-B1-MIXED', title:'Mixed Grammar Check', category:'Grammar', tags:['B1','Grammar'], description:'Check your control of common intermediate grammar.', mode:'assessment', status:'published', questionIds:['TNS-B1-000411','MOD-B1-000412'], questionCount:2, timeLimit:5, access:'registered', review:'full', randomizeQuestions:false, randomizeAnswers:true, flagging:true, ownerId:null },
  { id:'quiz-conditional-b2', quiz_code:'COND-B2-SECOND', title:'Second Conditional Challenge', category:'Conditionals', tags:['B2','Conditionals'], description:'Practice hypothetical situations in present and future contexts.', mode:'practice', status:'published', questionIds:['COND-B2-000501'], questionCount:1, timeLimit:null, access:'public', review:'full', randomizeQuestions:false, randomizeAnswers:false, flagging:true, ownerId:null },
  { id:'quiz-c1-writing', quiz_code:'VOC-C1-PRECISION', title:'Precision Vocabulary', category:'Vocabulary', tags:['C1','Vocabulary'], description:'Choose precise words for advanced English contexts.', mode:'assessment', status:'scheduled', questionIds:['VOC-C1-000601'], questionCount:1, timeLimit:3, access:'registered', review:'limited', randomizeQuestions:false, randomizeAnswers:false, flagging:false, ownerId:null }
];

export const attempts = [
  { id:'att-001', quizId:'quiz-present-a1', quizTitle:'Present Simple Essentials', mode:'practice', status:'completed', date:'2026-08-30T09:20:00Z', correctCount:2, totalCount:2, userId:'u-learner' },
  { id:'att-002', quizId:'quiz-grammar-b1', quizTitle:'Mixed Grammar Check', mode:'assessment', status:'in_progress', date:'2026-09-01T11:10:00Z', correctCount:0, totalCount:2, expiresAt:null, userId:'u-learner' }
];

// Teacher Mode: a class/cohort a teacher manages, joined by learners via a
// short human-shareable code. memberIds reference user ids from `users`.
export const groups = [
  { id:'grp-demo', code:'DEMO01', name:'Period 3 English', teacherId:'u-teacher', memberIds:['u-learner'], created_at:'2026-08-20T00:00:00Z' }
];

// A quiz assigned to a group by its teacher, optionally with a due date.
// This is also what makes a `restricted` quiz's real access check pass for
// a learner: membership in a group with an assignment for that quiz id.
export const assignments = [
  { id:'asg-demo', groupId:'grp-demo', quizId:'quiz-grammar-b1', dueAt:null, assignedBy:'u-teacher', created_at:'2026-08-21T00:00:00Z' }
];
