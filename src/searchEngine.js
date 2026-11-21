// High-precision, sub-millisecond fuzzy search & ranking engine for Conceptualist Systems

const STATIC_SEARCH_VOCAB = [
  // Curated subjects (including 3-char academic abbreviations for short-token typo tolerance)
  'accounting', 'acc', 'arabic', 'ara', 'art', 'design', 'bangla', 'ban', 'bengali', 'bangladesh',
  'biology', 'bio', 'business', 'bus', 'chemistry', 'chem', 'che', 'chinese', 'mandarin', 'cantonese',
  'commerce', 'comm', 'computer', 'science', 'sciences', 'double', 'single', 'award', 'compsci', 'economics', 'econ', 'eco',
  'english', 'eng', 'esl', 'second', 'language', 'literature', 'lit', 'french', 'fre',
  'further', 'pure', 'mathematics', 'math', 'maths', 'geography', 'geog', 'geo',
  'german', 'ger', 'global', 'citizenship', 'greek', 'modern', 'gujarati', 'hindi', 'history', 'human',
  'information', 'technology', 'ict', 'islamic', 'islamiyat', 'studies', 'law', 'pakistan',
  'physics', 'phys', 'phy', 'psychology', 'psych', 'religious', 'sinhala', 'spanish', 'spa', 'swahili',
  'tamil', 'turkish', 'urdu',
  // Units, paper tiers & formats
  'mechanics', 'mech', 'statistics', 'stat', 'stats', 'decision', 'core', 'solomon',
  'unit', 'paper', 'papers', 'regional', 'foundation', 'higher', 'modular',
  'question', 'questions', 'mark', 'scheme', 'schemes', 'markscheme', 'markschemes',
  'examiner', 'examiners', 'report', 'reports', 'pef',
  'textbook', 'textbooks', 'book', 'books', 'solutions', 'solution', 'solutionbank', 'worked',
  'specimen', 'specimens', 'syllabus', 'syllabuses', 'sample', 'samples',
  'listening', 'audio', 'mp3', 'recording', 'recordings', 'track', 'tracks', 'subtitles', 'captions', 'transcript', 'transcripts',
  'file', 'files', 'datafile', 'datafiles', 'practical', 'source', 'sources', 'student', 'workbook', 'revision', 'guide', 'lab', 'answers', 'answer',
  'c1', 'c2', 'c3', 'c4', 'c12', 'c34', 'fp1', 'fp2', 'fp3', 'p1', 'p2', 'p3', 'p4', 'm1', 'm2', 'm3', 's1', 's2', 's3', 'd1', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6',
  // Sessions & curricula
  'january', 'jan', 'february', 'feb', 'june', 'jun', 'may', 'summer',
  'october', 'oct', 'november', 'nov', 'autumn', 'winter', 'edexcel', 'igcse', 'ial',
  // IAL + IGCSE course codes
  'wph01', 'wph02', 'wph03', 'wph04', 'wph05', 'wph06', 'wph07',
  '6ph01', '6ph02', '6ph03', '6ph04', '6ph05', '6ph06',
  '6bi01', '6bi02', '6bi03', '6bi04', '6bi05', '6bi06',
  '6ch01', '6ch02', '6ch03', '6ch04', '6ch05', '6ch06',
  '4ma0', '4ph0', '4ch0', '4bi0', '4hb0', '4es0', '4ar0', '4fr0', '4gn0', '4sp0', '4hi0', '4rs0',
  '4308', '4357', '4400', '7042',
  'wma11', 'wma12', 'wma13', 'wma14', 'wma01', 'wma02', 'wfm01', 'wfm02', 'wfm03',
  'wme01', 'wme02', 'wme03', 'wst01', 'wst02', 'wst03', 'wdm11', 'wdm01',
  'wbi11', 'wbi12', 'wbi13', 'wbi14', 'wbi15', 'wbi16',
  'wch11', 'wch12', 'wch13', 'wch14', 'wch15', 'wch16',
  'wph11', 'wph12', 'wph13', 'wph14', 'wph15', 'wph16',
  'wac11', 'wac12', 'wec11', 'wec12', 'wec13', 'wec14',
  'wbs11', 'wbs12', 'wbs13', 'wbs14',
  'wps01', 'wps02', 'wps03', 'wps04', 'whi01', 'whi02', 'whi03', 'whi04',
  'wge01', 'wge02', 'wge03', 'wge04', 'wit11', 'wit12', 'wit13', 'wit14',
  'wen01', 'wen02', 'wen03', 'wen04', 'wet01', 'wet02', 'wet03', 'wet04',
  'waa01', 'waa02', 'wfr01', 'wfr02', 'wfr03', 'wfr04',
  'wgn01', 'wgn02', 'wgn03', 'wgn04', 'wgk01', 'wgk02',
  'wsp01', 'wsp02', 'wsp03', 'wsp04', 'yla1', 'yla2',
  '4ma1', '4mb1', '4pm1', '4ph1', '4ch1', '4bi1', '4hb1', '4ec1', '4bs1',
  '4ac1', '4cm1', '4cp0', '4it1', '4ea1', '4eb1', '4es1', '4et1', '4ge1', '4ba0',
  '4aa1', '4fr1', '4gn1', '4sp1', '4hi1', '4rs1', '4gl1', '4is1',
  '4be0', '4bn0', '4bn1', '4cn0', '4cn1', '4fa0', '4fa1', '4gk1', '4mg0', '4gu0', '4hn0',
  '4is0', '4pa1', '4sc0', '4sd0', '4wsd1', '4ss0', '4si0', '4sw0', '4sw1', '4ta0', '4tu0', '4ur0',
  '4wbi1', '4wch1', '4wph1', '4wac1', '4wcm1', '4wec1', '4wes1', '4wea1', '4wet1', '4wge1', '4whi1', '4wma1', '4wrs1'
];

const SHORT_VOCAB_3CHAR = new Set([
  'acc', 'ara', 'aud', 'ban', 'bio', 'bus', 'che', 'eco', 'eng', 'esl', 'feb',
  'fre', 'geo', 'ger', 'ict', 'jan', 'jun', 'law', 'lit', 'may', 'nov',
  'oct', 'pef', 'phy', 'sam', 'sol', 'spa'
]);

const STATIC_SEARCH_VOCAB_SET = new Set(STATIC_SEARCH_VOCAB);

const VOCAB_STOPWORDS = new Set([
  'pdf', 'zip', 'rar', 'mp3', 'wav', 'm4a', 'ogg', 'txt', 'doc', 'docx',
  'and', 'the', 'for', 'with', 'from', 'past', 'papers', 'file', 'files',
  'jan', 'june', 'may', 'oct', 'nov', 'new', 'old', 'ial', 'igcse', 'gce'
]);

// Atomic synonyms: multi-word items stay phrases instead of leaking loose words like "1" or "science"
const RAW_ATOMIC_SYNONYMS = {
  // Subjects
  math: ['math', 'mathematics', 'maths'],
  maths: ['math', 'mathematics', 'maths'],
  mathematics: ['math', 'mathematics', 'maths'],
  fmath: ['further mathematics', 'further pure mathematics', 'wfm01', 'wfm02', 'wfm03', '4pm1'],
  furthermath: ['further mathematics', 'further pure mathematics', 'wfm01', 'wfm02', 'wfm03', '4pm1'],
  furthermaths: ['further mathematics', 'further pure mathematics', 'wfm01', 'wfm02', 'wfm03', '4pm1'],
  it: ['it', 'ict', 'information technology', 'wit11', 'wit12', 'wit13', 'wit14', '4it1'],
  ict: ['it', 'ict', 'information technology', 'wit11', 'wit12', 'wit13', 'wit14', '4it1'],
  cs: ['cs', 'computer science', '4cp0'],
  compsci: ['cs', 'computer science', '4cp0'],
  bio: ['bio', 'biology'],
  humanbio: ['human biology', '4hb1'],
  hb: ['human biology', '4hb1'],
  hbio: ['human biology', '4hb1'],
  chem: ['chem', 'chemistry'],
  che: ['chem', 'chemistry'],
  phys: ['phy', 'phys', 'physics'],
  phy: ['phy', 'phys', 'physics'],
  econ: ['eco', 'econ', 'economics'],
  eco: ['eco', 'econ', 'economics'],
  bus: ['bus', 'business'],
  bs: ['bus', 'business', 'business studies'],
  acc: ['acc', 'accounting'],
  acct: ['acc', 'accounting'],
  accounts: ['acc', 'accounting'],
  psych: ['psych', 'psychology'],
  psy: ['psych', 'psychology'],
  geog: ['geo', 'geog', 'geography'],
  geo: ['geo', 'geog', 'geography'],
  eng: ['eng', 'english'],
  esl: ['esl', 'english as a second language', '4es1', '4es0', '4wes1', '4357'],
  lit: ['lit', 'literature'],
  englit: ['english literature', 'wet01', 'wet02', 'wet03', 'wet04', '4et1', '4wet1'],
  englang: ['english language', 'wen01', 'wen02', 'wen03', 'wen04', '4ea1', '4eb1', '4wea1'],
  comm: ['comm', 'commerce'],
  fre: ['fre', 'french'],
  ger: ['ger', 'german'],
  spa: ['spa', 'spanish'],
  ara: ['ara', 'arabic'],
  hist: ['hist', 'history'],
  rs: ['rs', 'religious studies', '4rs1', '4rs0', '4wrs1'],
  islamic: ['islamic', 'islamic studies', '4is1'],
  islamiyat: ['islamiyat', '4is0', 'islamic studies'],
  gc: ['global citizenship', '4gl1'],
  solomon: ['solomon', 'solomon papers', 'sol'],
  ban: ['ban', 'bangla', 'bengali', '4ba0', '4be0'],
  bengali: ['bangla', 'bengali', '4ba0', '4be0'],
  mandarin: ['chinese', '4cn1', '4cn0', 'mandarin'],
  cantonese: ['chinese', '4cn1', '4cn0', 'cantonese'],
  artdesign: ['art and design', '4fa1', '4fa0'],
  banstudies: ['bangladesh studies', '4bn1', '4bn0'],
  pakstudies: ['pakistan studies', '4pa1'],
  modgreek: ['modern greek', '4mg0'],
  doubleaward: ['sciences (double award)', '4sd0', '4sc0', '4wsd1'],
  doublescience: ['sciences (double award)', '4sd0', '4sc0', '4wsd1'],
  singleaward: ['sciences (single award)', '4ss0'],
  singlescience: ['sciences (single award)', '4ss0'],
  mech: ['mech', 'mechanics'],
  stat: ['stat', 'stats', 'statistics'],
  stats: ['stat', 'stats', 'statistics'],
  dec: ['dec', 'decision'],

  // Document types
  qp: ['qp', 'question paper', 'past paper'],
  questionpaper: ['qp', 'question paper', 'past paper'],
  questionpapers: ['qp', 'question paper', 'past paper'],
  pastpaper: ['qp', 'question paper', 'past paper'],
  pastpapers: ['qp', 'question paper', 'past paper'],
  ms: ['ms', 'mark scheme', 'markscheme', 'answers'],
  markscheme: ['ms', 'mark scheme', 'markscheme'],
  markschemes: ['ms', 'mark scheme', 'markscheme'],
  marking: ['ms', 'mark scheme', 'markscheme'],
  er: ['er', 'examiner report', 'pef'],
  examinerreport: ['er', 'examiner report', 'pef'],
  examinerreports: ['er', 'examiner report', 'pef'],
  pef: ['er', 'examiner report', 'pef'],
  book: ['book', 'books', 'textbook', 'textbooks', 'student book'],
  books: ['book', 'books', 'textbook', 'textbooks', 'student book'],
  textbook: ['book', 'books', 'textbook', 'textbooks', 'student book'],
  textbooks: ['book', 'books', 'textbook', 'textbooks', 'student book'],
  studentbook: ['book', 'books', 'textbook', 'textbooks', 'student book'],
  sol: ['sol', 'solution', 'solutions', 'solutionbank', 'worked solutions'],
  solution: ['sol', 'solution', 'solutions', 'solutionbank', 'worked solutions'],
  solutions: ['sol', 'solution', 'solutions', 'solutionbank', 'worked solutions'],
  solutionbank: ['sol', 'solution', 'solutions', 'solutionbank', 'worked solutions'],
  df: ['df', 'data file', 'data files', 'datafile', 'datafiles', 'practical'],
  datafile: ['df', 'data file', 'data files', 'datafile', 'datafiles', 'practical'],
  datafiles: ['df', 'data file', 'data files', 'datafile', 'datafiles', 'practical'],
  practical: ['df', 'data file', 'data files', 'practical'],
  aud: ['aud', 'audio', 'listening', 'mp3', 'subtitles', 'transcript'],
  audio: ['aud', 'audio', 'listening', 'mp3', 'subtitles', 'transcript'],
  listening: ['aud', 'audio', 'listening', 'mp3', 'subtitles', 'transcript'],
  mp3: ['aud', 'audio', 'listening', 'mp3'],
  sc: ['sc', 'source', 'source file', 'transcript', 'insert'],
  source: ['sc', 'source', 'source file', 'transcript'],
  sam: ['sam', 'specimen', 'syllabus', 'sample'],
  specimen: ['sam', 'specimen', 'syllabus'],

  // Unit & Math paper codes (atomic phrases only — never standalone digits)
  u1: [
    'u1', 'unit 1', 'wma11', 'wbi11', 'wch11', 'wph11', 'wac11', 'wec11', 'wbs11',
    'wen01', 'wet01', 'wge01', 'whi01', 'wps01', 'wit11', 'wfr01', 'wgn01', 'wsp01',
    'waa01', 'wgk01', '6bi01', '6ph01', '6ch01', 'wph01', 'wbi01', 'wch01', 'wbs01', 'wec01', '6eca1', 'yla1'
  ],
  u2: [
    'u2', 'unit 2', 'wma12', 'wbi12', 'wch12', 'wph12', 'wac12', 'wec12', 'wbs12',
    'wen02', 'wet02', 'wge02', 'whi02', 'wps02', 'wit12', 'wfr02', 'wgn02', 'wsp02',
    'waa02', 'wgk02', '6bi02', '6ph02', '6ch02', 'wph02', 'wbi02', 'wch02', 'wbs02', 'wec02', '6eca2', 'yla2'
  ],
  u3: [
    'u3', 'unit 3', 'wma13', 'wbi13', 'wch13', 'wph13', 'wec13', 'wbs13',
    'wen03', 'wet03', 'wge03', 'whi03', 'wps03', 'wit13', 'wfr03', 'wgn03', 'wsp03',
    '6bi03', '6ph03', '6ch03', 'wph03', 'wbi03', 'wch03', 'wbs03', 'wec03', '6eca3'
  ],
  u4: [
    'u4', 'unit 4', 'wma14', 'wbi14', 'wch14', 'wph14', 'wec14', 'wbs14',
    'wen04', 'wet04', 'wge04', 'whi04', 'wps04', 'wit14', 'wfr04', 'wgn04', 'wsp04',
    '6bi04', '6ph04', '6ch04', 'wph04', 'wbi04', 'wch04', 'wbs04', 'wec04'
  ],
  u5: ['u5', 'unit 5', 'wbi15', 'wch15', 'wph15', '6bi05', '6ph05', '6ch05', 'wph05', 'wbi05', 'wch05'],
  u6: ['u6', 'unit 6', 'wbi16', 'wch16', 'wph16', '6bi06', '6ph06', '6ch06', 'wph06', 'wbi06', 'wch06', 'wch07'],

  p1: ['p1', 'p1a', 'p1r', 'paper 1', 'pure mathematics 1', 'wma11', '1p', '1h', '1f', '1hr', '1fr'],
  p2: ['p2', 'p2a', 'p2r', 'paper 2', 'pure mathematics 2', 'wma12', '2p', '2h', '2f', '2hr', '2fr'],
  p3: ['p3', 'p3a', 'p3r', 'paper 3', 'pure mathematics 3', 'wma13', '3p'],
  p4: ['p4', 'p4a', 'p4r', 'paper 4', 'pure mathematics 4', 'wma14', '4p'],
  wma11: ['wma11', 'pure mathematics 1', 'wma11r', 'wma11a'],
  wma12: ['wma12', 'pure mathematics 2', 'wma12r', 'wma12a'],
  wma13: ['wma13', 'pure mathematics 3', 'wma13r', 'wma13a'],
  wma14: ['wma14', 'pure mathematics 4', 'wma14r', 'wma14a'],

  '1r': ['1r', 'p1r', 'paper 1r', '1hr', '1fr'],
  '2r': ['2r', 'p2r', 'paper 2r', '2hr', '2fr'],
  p1r: ['1r', 'p1r', 'paper 1r', '1hr', '1fr', 'wma11r'],
  p2r: ['2r', 'p2r', 'paper 2r', '2hr', '2fr', 'wma12r'],
  p3r: ['p3r', 'paper 3r', 'wma13r'],
  p4r: ['p4r', 'paper 4r', 'wma14r'],
  '1h': ['1h', 'paper 1h', '1ph'],
  '2h': ['2h', 'paper 2h', '2ph'],
  '1hr': ['1hr', 'paper 1hr'],
  '2hr': ['2hr', 'paper 2hr'],
  '1f': ['1f', 'paper 1f', '1pf'],
  '2f': ['2f', 'paper 2f', '2pf'],
  '1fr': ['1fr', 'paper 1fr'],
  '2fr': ['2fr', 'paper 2fr'],

  m1: ['m1', 'm1a', 'm1r', 'wme01', 'mechanics 1'],
  m2: ['m2', 'm2a', 'm2r', 'wme02', 'mechanics 2'],
  m3: ['m3', 'm3a', 'm3r', 'wme03', 'mechanics 3'],
  wme01: ['wme01', 'm1', 'mechanics 1'],
  wme02: ['wme02', 'm2', 'mechanics 2'],
  wme03: ['wme03', 'm3', 'mechanics 3'],

  s1: ['s1', 's1a', 's1r', 'wst01', 'statistics 1'],
  s2: ['s2', 's2a', 's2r', 'wst02', 'statistics 2'],
  s3: ['s3', 's3a', 's3r', 'wst03', 'statistics 3'],
  wst01: ['wst01', 's1', 'statistics 1'],
  wst02: ['wst02', 's2', 'statistics 2'],
  wst03: ['wst03', 's3', 'statistics 3'],

  f1: ['f1', 'fp1', 'fp1a', 'fp1r', 'wfm01', 'further pure 1', 'further pure mathematics 1'],
  f2: ['f2', 'fp2', 'fp2a', 'fp2r', 'wfm02', 'further pure 2', 'further pure mathematics 2'],
  f3: ['f3', 'fp3', 'fp3a', 'fp3r', 'wfm03', 'further pure 3', 'further pure mathematics 3'],
  fp1: ['fp1', 'f1', 'fp1a', 'fp1r', 'wfm01', 'further pure 1', 'further pure mathematics 1'],
  fp2: ['fp2', 'f2', 'fp2a', 'fp2r', 'wfm02', 'further pure 2', 'further pure mathematics 2'],
  fp3: ['fp3', 'f3', 'fp3a', 'fp3r', 'wfm03', 'further pure 3', 'further pure mathematics 3'],
  wfm01: ['wfm01', 'fp1', 'further pure mathematics 1'],
  wfm02: ['wfm02', 'fp2', 'further pure mathematics 2'],
  wfm03: ['wfm03', 'fp3', 'further pure mathematics 3'],

  d1: ['d1', 'd1a', 'd1r', 'wdm11', 'wdm01', 'decision 1', 'decision mathematics 1'],
  wdm11: ['wdm11', 'wdm01', 'd1', 'decision mathematics 1'],
  wdm01: ['wdm01', 'wdm11', 'd1', 'decision mathematics 1'],
  c1: ['c1', 'c1a', 'c1r', '6663', 'core mathematics 1', 'core 1'],
  c2: ['c2', 'c2a', 'c2r', '6664', 'core mathematics 2', 'core 2'],
  c3: ['c3', 'c3a', 'c3r', '6665', 'core mathematics 3', 'core 3'],
  c4: ['c4', 'c4a', 'c4r', '6666', 'core mathematics 4', 'core 4'],
  c12: ['c12', 'c12a', 'c12r', 'wma01', 'core mathematics 12', 'core 12'],
  c34: ['c34', 'c34a', 'c34r', 'wma02', 'core mathematics 34', 'core 34'],
  wma01: ['wma01', 'c12', 'core mathematics 12'],
  wma02: ['wma02', 'c34', 'core mathematics 34'],

  // IGCSE syllabus codes -> exact subject + specification bindings
  '4ma1': ['4ma1', 'mathematics a', '4ma0', '4wma1', '4400'],
  '4ma0': ['4ma0', 'mathematics a', '4ma1'],
  '4wma1': ['4wma1', '4ma1', 'mathematics a'],
  '4400': ['4400', 'mathematics a', '4ma0', '4ma1'],
  '4mb1': ['4mb1', 'mathematics b', '4mb0'],
  '4pm1': ['4pm1', 'further pure mathematics', '4pm0'],
  '4ph1': ['4ph1', '4ph0', '4wph1', 'igcse physics'],
  '4ph0': ['4ph0', '4ph1', 'igcse physics'],
  '4wph1': ['4wph1', '4ph1', 'igcse physics'],
  '4ch1': ['4ch1', '4ch0', '4wch1', 'igcse chemistry'],
  '4ch0': ['4ch0', '4ch1', 'igcse chemistry'],
  '4wch1': ['4wch1', '4ch1', 'igcse chemistry'],
  '4bi1': ['4bi1', '4bi0', '4wbi1', 'igcse biology'],
  '4bi0': ['4bi0', '4bi1', 'igcse biology'],
  '4wbi1': ['4wbi1', '4bi1', 'igcse biology'],
  '4hb1': ['4hb1', '4hb0', '7042', 'human biology'],
  '4hb0': ['4hb0', '4hb1', 'human biology'],
  '7042': ['7042', '4hb0', '4hb1', 'human biology'],
  '4ec1': ['4ec1', '4ec0', '4wec1', 'igcse economics'],
  '4wec1': ['4wec1', '4ec1', 'igcse economics'],
  '4bs1': ['4bs1', '4bs0', 'igcse business'],
  '4ac1': ['4ac1', '4ac0', '4wac1', 'igcse accounting'],
  '4wac1': ['4wac1', '4ac1', 'igcse accounting'],
  '4cm1': ['4cm1', '4cm0', '4wcm1', 'commerce'],
  '4wcm1': ['4wcm1', '4cm1', 'commerce'],
  '4cp0': ['4cp0', 'computer science'],
  '4it1': ['4it1', '4it0', 'igcse ict', 'information technology'],
  '4ea1': ['4ea1', '4ea0', '4wea1', 'english language a'],
  '4wea1': ['4wea1', '4ea1', 'english language a'],
  '4eb1': ['4eb1', '4eb0', 'english language b'],
  '4es1': ['4es1', '4es0', '4wes1', '4357', 'esl', 'english as a second language'],
  '4es0': ['4es0', '4es1', '4357', 'esl', 'english as a second language'],
  '4wes1': ['4wes1', '4es1', 'esl', 'english as a second language'],
  '4357': ['4357', '4es0', '4es1', 'esl', 'english as a second language'],
  '4et1': ['4et1', '4et0', '4wet1', 'igcse english literature'],
  '4wet1': ['4wet1', '4et1', 'igcse english literature'],
  '4ge1': ['4ge1', '4ge0', '4wge1', 'igcse geography'],
  '4wge1': ['4wge1', '4ge1', 'igcse geography'],
  '4aa1': ['4aa1', '4ar0', '4308', 'igcse arabic'],
  '4ar0': ['4ar0', '4aa1', 'igcse arabic'],
  '4308': ['4308', '4ar0', '4aa1', 'igcse arabic'],
  '4fr1': ['4fr1', '4fr0', 'igcse french'],
  '4gn1': ['4gn1', '4gn0', 'igcse german'],
  '4sp1': ['4sp1', '4sp0', 'igcse spanish'],
  '4hi1': ['4hi1', '4hi0', '4whi1', 'igcse history'],
  '4whi1': ['4whi1', '4hi1', 'igcse history'],
  '4rs1': ['4rs1', '4rs0', '4wrs1', 'religious studies'],
  '4wrs1': ['4wrs1', '4rs1', 'religious studies'],
  '4gl1': ['4gl1', 'global citizenship'],
  '4is1': ['4is1', 'islamic studies'],
  '4is0': ['4is0', 'islamiyat', 'islamic studies'],
  '4ba0': ['4ba0', '4be0', 'bangla', 'bengali'],
  '4be0': ['4be0', '4ba0', 'bangla', 'bengali'],
  '4bn1': ['4bn1', '4bn0', 'bangladesh studies'],
  '4bn0': ['4bn0', '4bn1', 'bangladesh studies'],
  '4cn1': ['4cn1', '4cn0', 'igcse chinese'],
  '4cn0': ['4cn0', '4cn1', 'igcse chinese'],
  '4fa1': ['4fa1', '4fa0', 'art and design'],
  '4fa0': ['4fa0', '4fa1', 'art and design'],
  '4gk1': ['4gk1', 'greek (first language)'],
  '4mg0': ['4mg0', 'modern greek'],
  '4gu0': ['4gu0', 'gujarati'],
  '4hn0': ['4hn0', 'hindi'],
  '4pa1': ['4pa1', 'pakistan studies'],
  '4sd0': ['4sd0', '4sc0', '4wsd1', 'sciences (double award)'],
  '4sc0': ['4sc0', '4sd0', 'sciences (double award)'],
  '4wsd1': ['4wsd1', '4sd0', 'sciences (double award)'],
  '4ss0': ['4ss0', 'sciences (single award)'],
  '4si0': ['4si0', 'sinhala'],
  '4sw1': ['4sw1', '4sw0', 'swahili'],
  '4sw0': ['4sw0', '4sw1', 'swahili'],
  '4ta0': ['4ta0', 'tamil'],
  '4tu0': ['4tu0', 'turkish'],
  '4ur0': ['4ur0', 'urdu'],

  // Interchangeable exam session equivalents (May <-> June <-> Summer, Oct <-> Nov, Jan <-> Feb)
  may: ['may', 'jun', 'june', 'summer'],
  jun: ['june', 'may', 'jun', 'summer'],
  june: ['june', 'may', 'jun', 'summer'],
  mayjune: ['may', 'jun', 'june', 'summer'],
  summer: ['june', 'may', 'jun', 'summer'],
  oct: ['oct', 'october', 'nov', 'november', 'autumn'],
  october: ['october', 'oct', 'nov', 'november', 'autumn'],
  nov: ['nov', 'november', 'oct', 'october', 'autumn'],
  november: ['november', 'oct', 'october', 'nov', 'autumn'],
  octnov: ['oct', 'october', 'nov', 'november', 'autumn'],
  autumn: ['autumn', 'oct', 'october', 'nov', 'november'],
  jan: ['jan', 'january', 'feb', 'february', 'winter'],
  january: ['january', 'jan', 'feb', 'february', 'winter'],
  feb: ['feb', 'february', 'jan', 'january', 'winter'],
  february: ['february', 'jan', 'january', 'feb', 'winter'],
  winter: ['winter', 'jan', 'january', 'feb', 'february'],

  // Variants
  r: ['r', 'regional', 'reg'],
  reg: ['regional', 'reg'],
  regional: ['regional', 'reg', 'alt', 'alta'],
  alt: ['alt', 'alta', 'regional'],
  alta: ['alta', 'alt', 'regional'],
  higher: ['higher', '1h', '2h', '1hr', '2hr'],
  foundation: ['foundation', '1f', '2f', '1fr', '2fr'],
  modular: ['modular', 'mod']
};

// Map IGCSE Subject + Spec -> specification code tokens indexed on each IGCSE paper
const IGCSE_CODE_BY_SUBJECT = {
  'Accounting': ['4ac1', '4ac0', '4wac1'],
  'Arabic': ['4aa1', '4ar0', '4308'],
  'Art and Design': ['4fa1', '4fa0'],
  'Bangla': ['4ba0', '4be0'],
  'Bangladesh Studies': ['4bn1', '4bn0'],
  'Biology': ['4bi1', '4bi0', '4wbi1'],
  'Business': ['4bs1', '4bs0'],
  'Chemistry': ['4ch1', '4ch0', '4wch1'],
  'Chinese': ['4cn1', '4cn0'],
  'Commerce': ['4cm1', '4cm0', '4wcm1'],
  'Computer Science': ['4cp0'],
  'Economics': ['4ec1', '4ec0', '4wec1'],
  'English as a Second Language': ['4es1', '4es0', '4wes1', '4357'],
  'English Language A': ['4ea1', '4ea0', '4wea1'],
  'English Language B': ['4eb1', '4eb0'],
  'English Literature': ['4et1', '4et0', '4wet1'],
  'French': ['4fr1', '4fr0'],
  'Further Pure Mathematics': ['4pm1', '4pm0'],
  'Geography': ['4ge1', '4ge0', '4wge1'],
  'German': ['4gn1', '4gn0'],
  'Global Citizenship': ['4gl1'],
  'Greek (First Language)': ['4gk1'],
  'Gujarati': ['4gu0'],
  'Hindi': ['4hn0'],
  'History': ['4hi1', '4hi0', '4whi1'],
  'Human Biology': ['4hb1', '4hb0', '7042'],
  'Information Technology': ['4it1', '4it0'],
  'Islamic Studies': ['4is1'],
  'Islamiyat': ['4is0'],
  'Mathematics A': ['4ma1', '4ma0', '4wma1', '4400'],
  'Mathematics B': ['4mb1', '4mb0'],
  'Modern Greek': ['4mg0'],
  'Pakistan Studies': ['4pa1'],
  'Physics': ['4ph1', '4ph0', '4wph1'],
  'Religious Studies': ['4rs1', '4rs0', '4wrs1'],
  'Sciences (Double Award)': ['4sd0', '4sc0', '4wsd1'],
  'Sciences (Single Award)': ['4ss0'],
  'Sinhala': ['4si0'],
  'Spanish': ['4sp1', '4sp0'],
  'Swahili': ['4sw1', '4sw0'],
  'Tamil': ['4ta0'],
  'Turkish': ['4tu0'],
  'Urdu': ['4ur0']
};

const IGCSE_SUBJECT_BY_CODE = Object.entries(IGCSE_CODE_BY_SUBJECT).reduce((acc, [subj, codes]) => {
  codes.forEach((c) => {
    acc[c] = subj;
  });
  return acc;
}, {});

const DOC_TYPE_TOKENS = {
  QP: ['qp', 'question', 'questions', 'paper', 'papers', 'past'],
  MS: ['ms', 'mark', 'scheme', 'schemes', 'markscheme', 'markschemes', 'answer', 'answers'],
  ER: ['er', 'examiner', 'examiners', 'report', 'reports', 'pef'],
  SOL: ['sol', 'solution', 'solutions', 'solutionbank', 'bank', 'worked', 'answers'],
  DF: ['df', 'data', 'file', 'files', 'datafile', 'datafiles', 'practical', 'zip'],
  AUD: ['aud', 'audio', 'listening', 'mp3', 'recording', 'recordings', 'track', 'tracks', 'subtitles', 'captions', 'cc', 'transcript', 'transcripts'],
  SC: ['sc', 'source', 'sources', 'transcript', 'transcripts', 'insert', 'inserts', 'booklet'],
  SAM: ['sam', 'specimen', 'specimens', 'syllabus', 'syllabuses', 'specification', 'specifications', 'sample', 'samples'],
  Book: ['book', 'books', 'textbook', 'textbooks', 'studentbook', 'coursebook', 'guide']
};

const DOC_TYPE_PHRASES = {
  QP: 'question paper past paper',
  MS: 'mark scheme',
  ER: 'examiner report',
  SOL: 'worked solutions solution bank',
  DF: 'data file data files',
  AUD: 'listening audio',
  SC: 'source file',
  SAM: 'specimen paper'
};

const SESSION_SYNONYMS_BY_MONTH = {
  mayJune: ['may', 'jun', 'june', 'summer'],
  octNov: ['oct', 'october', 'nov', 'november', 'autumn'],
  janFeb: ['jan', 'january', 'feb', 'february', 'winter']
};

const GENERIC_QUERY_WORDS = new Set([
  'qp', 'ms', 'er', 'aud', 'df', 'sc', 'sol', 'sam', 'book', 'books',
  'question', 'questions', 'paper', 'papers', 'mark', 'scheme', 'schemes',
  'examiner', 'examiners', 'report', 'reports', 'file', 'files',
  'textbook', 'textbooks', 'solutions', 'ial', 'igcse', 'edexcel',
  'r', 'regional', 'reg', 'alt', 'alta', 'higher', 'foundation'
]);

const _dlPrevPrev = new Int32Array(64);
const _dlPrev = new Int32Array(64);
const _dlCurr = new Int32Array(64);

// Precompile synonym lookup objects once
const COMPILED_SYNONYMS = Object.fromEntries(
  Object.entries(RAW_ATOMIC_SYNONYMS).map(([key, entries]) => [
    key,
    entries.map((entry) =>
      entry.includes(' ')
        ? { type: 'phrase', val: entry, words: entry.split(' ') }
        : { type: 'tok', val: entry }
    )
  ])
);

function tokenizeRaw(str) {
  if (!str) return [];
  return String(str)
    .toLowerCase()
    .replace(/['’]/g, '')
    .match(/[a-z0-9]+/g) || [];
}

const ITEM_CODE_EQUIV = {
  m1: ['wme01'], m2: ['wme02'], m3: ['wme03'],
  wme01: ['m1'], wme02: ['m2'], wme03: ['m3'],
  s1: ['wst01'], s2: ['wst02'], s3: ['wst03'],
  wst01: ['s1'], wst02: ['s2'], wst03: ['s3'],
  fp1: ['f1', 'wfm01'], f1: ['fp1', 'wfm01'], wfm01: ['fp1', 'f1'],
  fp2: ['f2', 'wfm02'], f2: ['fp2', 'wfm02'], wfm02: ['fp2', 'f2'],
  fp3: ['f3', 'wfm03'], f3: ['fp3', 'wfm03'], wfm03: ['fp3', 'f3'],
  d1: ['wdm11', 'wdm01'], wdm11: ['d1', 'wdm01'], wdm01: ['d1', 'wdm11'],
  c1: ['6663'], '6663': ['c1'],
  c2: ['6664'], '6664': ['c2'],
  c3: ['6665'], '6665': ['c3'],
  c4: ['6666'], '6666': ['c4'],
  c12: ['wma01'], wma01: ['c12'],
  c34: ['wma02'], wma02: ['c34'],
  wma11: ['p1'], wma12: ['p2'], wma13: ['p3'], wma14: ['p4'],
  '6bi01': ['wbi11'], '6bi02': ['wbi12'], '6bi03': ['wbi13'],
  '6bi04': ['wbi14'], '6bi05': ['wbi15'], '6bi06': ['wbi16']
};

function expandBaseCodeAliases(codeLower, targetSet) {
  if (!codeLower) return;
  targetSet.add(codeLower);
  // Variant strips: m1a -> m1, m1r -> m1, p1r -> p1, fp2a -> fp2, wma11r -> wma11
  const strippedVar = codeLower.replace(/(?:r|a)$/, '');
  if (strippedVar && strippedVar !== codeLower && /\d$/.test(strippedVar)) {
    targetSet.add(strippedVar);
  }
  const equiv = ITEM_CODE_EQUIV[strippedVar] || ITEM_CODE_EQUIV[codeLower];
  if (equiv) {
    for (let i = 0; i < equiv.length; i++) targetSet.add(equiv[i]);
  }
  // Paper1 / Paper2 concatenated filenames
  const paperMatch = codeLower.match(/^paper([1-4][a-z]?)$/);
  if (paperMatch) {
    targetSet.add('paper');
    targetSet.add(`p${paperMatch[1]}`);
    targetSet.add(`p${paperMatch[1].replace(/[ar]$/, '')}`);
  }
  // Tiered IGCSE paper codes like 1h, 2hr, 1f, 2fr
  const tierMatch = codeLower.match(/^([1-4])([hf])(r)?$/);
  if (tierMatch) {
    targetSet.add(`p${tierMatch[1]}`);
    targetSet.add(tierMatch[2] === 'h' ? 'higher' : 'foundation');
    if (tierMatch[3]) {
      targetSet.add('regional');
      targetSet.add('reg');
      targetSet.add('r');
      targetSet.add(`p${tierMatch[1]}r`);
    }
  }
}

/**
 * Attach structured search tokens and phrase indexes once per file object.
 */
export function buildFileSearchData(fileObj) {
  if (!fileObj) return null;

  const highSet = new Set();
  const metaSet = new Set();
  const tokenSet = new Set();

  const addTokensTo = (str, destSet, alsoExpandCodes = false) => {
    const toks = tokenizeRaw(str);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      destSet.add(t);
      tokenSet.add(t);
      if (alsoExpandCodes && t.length <= 7 && /\d/.test(t)) {
        expandBaseCodeAliases(t, destSet);
        expandBaseCodeAliases(t, tokenSet);
      }
    }
  };

  // High-priority fields: unit label, unit name, unit code, subject, aliases
  addTokensTo(fileObj.cleanUnitLabel, highSet, true);
  addTokensTo(fileObj.unitName, highSet, true);
  addTokensTo(fileObj.unitCode, highSet, true);
  addTokensTo(fileObj.subject, highSet, false);

  const subj = fileObj.subject || '';
  if (subj === 'Math') {
    highSet.add('mathematics');
    highSet.add('maths');
    tokenSet.add('mathematics');
    tokenSet.add('maths');
  } else if (subj === 'Information Technology') {
    highSet.add('it');
    highSet.add('ict');
    tokenSet.add('it');
    tokenSet.add('ict');
  } else if (subj === 'Computer Science') {
    highSet.add('cs');
    highSet.add('compsci');
    tokenSet.add('cs');
    tokenSet.add('compsci');
  } else if (subj === 'Further Pure Mathematics') {
    highSet.add('fmath');
    tokenSet.add('fmath');
  }

  // Index IGCSE syllabus codes on IGCSE papers/textbooks so searching "4ma1" or "4ph1" works
  if (fileObj.spec === 'IGCSE' || fileObj.curriculum === 'Edexcel IGCSE') {
    const igCodes = IGCSE_CODE_BY_SUBJECT[subj];
    if (igCodes) {
      igCodes.forEach((c) => {
        highSet.add(c);
        tokenSet.add(c);
      });
    }
  }

  // Extract normalized unit tag (e.g. "Unit 2" -> "u2", "Paper 1" -> "p1")
  const unitLabelStr = `${fileObj.cleanUnitLabel || ''} ${fileObj.unitName || ''}`.toLowerCase();
  const unitNumMatch = unitLabelStr.match(/\bunit\s*([1-6])\b/);
  if (unitNumMatch) {
    highSet.add(`u${unitNumMatch[1]}`);
    tokenSet.add(`u${unitNumMatch[1]}`);
  }
  const paperNumMatch = unitLabelStr.match(/\bpaper\s*([1-4]r?)\b/);
  if (paperNumMatch) {
    highSet.add(`p${paperNumMatch[1]}`);
    tokenSet.add(`p${paperNumMatch[1]}`);
  }

  // Metadata fields: curriculum, category, session + bidirectional seasonal aliases, variant, docType
  addTokensTo(fileObj.curriculum, metaSet, false);
  addTokensTo(fileObj.spec, metaSet, false);
  addTokensTo(fileObj.category, metaSet, false);
  if (fileObj.year) {
    const yr = String(fileObj.year);
    metaSet.add(yr);
    tokenSet.add(yr);
  }

  const sRaw = `${fileObj.session || ''} ${fileObj.path || ''}`;
  addTokensTo(fileObj.session, metaSet, false);
  if (/\b(?:may|jun|june)\b|may[-_\s]*june/i.test(sRaw)) {
    SESSION_SYNONYMS_BY_MONTH.mayJune.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (/\b(?:oct|october|nov|november)\b|oct[-_\s]*nov/i.test(sRaw)) {
    SESSION_SYNONYMS_BY_MONTH.octNov.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (/\b(?:jan|january|feb|february)\b|jan[-_\s]*feb/i.test(sRaw)) {
    SESSION_SYNONYMS_BY_MONTH.janFeb.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }

  const v = fileObj.variant || '';
  const isReg = v === 'R' || v === 'A' || v.includes('R');
  if (isReg) {
    ['regional', 'reg', 'r'].forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (v === 'A') {
    ['alt', 'alta'].forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (v.includes('H')) {
    metaSet.add('higher');
    tokenSet.add('higher');
    if (paperNumMatch) {
      const pDigit = paperNumMatch[1].replace(/r$/i, '');
      highSet.add(`${pDigit}h`);
      tokenSet.add(`${pDigit}h`);
      if (isReg) {
        highSet.add(`${pDigit}hr`);
        tokenSet.add(`${pDigit}hr`);
      }
    }
  }
  if (v.includes('F')) {
    metaSet.add('foundation');
    tokenSet.add('foundation');
    if (paperNumMatch) {
      const pDigit = paperNumMatch[1].replace(/r$/i, '');
      highSet.add(`${pDigit}f`);
      tokenSet.add(`${pDigit}f`);
      if (isReg) {
        highSet.add(`${pDigit}fr`);
        tokenSet.add(`${pDigit}fr`);
      }
    }
  }

  const dt = fileObj.docType || '';
  const dtToks = DOC_TYPE_TOKENS[dt];
  if (dtToks) {
    dtToks.forEach((t) => {
      metaSet.add(t);
      tokenSet.add(t);
    });
  }
  if (
    (fileObj.category === 'Books' || fileObj.category === 'IAL Books' || fileObj.category === 'IGCSE Books') &&
    dt !== 'SOL'
  ) {
    DOC_TYPE_TOKENS.Book.forEach((t) => {
      highSet.add(t);
      metaSet.add(t);
      tokenSet.add(t);
    });
  }

  // Path & Filename tokens (strip browser duplicate-copy suffixes like " (1).pdf" so Book 2 doesn't index token "1")
  const sanitizedPathForTokens = String(fileObj.path || '').replace(/\s*\(\d+\)(\.[a-z0-9]+)$/i, '$1');
  addTokensTo(fileObj.name, tokenSet, true);
  addTokensTo(sanitizedPathForTokens, tokenSet, true);

  if (subj === 'Math') {
    const mathPMap = { p1: 'wma11', p2: 'wma12', p3: 'wma13', p4: 'wma14' };
    Object.entries(mathPMap).forEach(([pKey, wma]) => {
      if (tokenSet.has(pKey) || tokenSet.has(`${pKey}r`) || tokenSet.has(`${pKey}a`)) {
        highSet.add(pKey);
        highSet.add(wma);
        tokenSet.add(pKey);
        tokenSet.add(wma);
      }
    });
    const mathBookCodeMatch = String(fileObj.name || '').match(/\((p[1-4]|m[1-3]|s[1-3]|fp[1-3]|d1|c12|c34)\)/i);
    if (mathBookCodeMatch) {
      expandBaseCodeAliases(mathBookCodeMatch[1].toLowerCase(), highSet);
      expandBaseCodeAliases(mathBookCodeMatch[1].toLowerCase(), tokenSet);
    }
  }

  if (isReg && fileObj.unitCode) {
    const ucLower = fileObj.unitCode.toLowerCase().replace(/[ar]$/, '');
    const regSuffix = v === 'A' ? 'a' : 'r';
    highSet.add(`${ucLower}${regSuffix}`);
    tokenSet.add(`${ucLower}${regSuffix}`);
    const eqs = ITEM_CODE_EQUIV[ucLower];
    if (eqs) {
      for (let i = 0; i < eqs.length; i++) {
        highSet.add(`${eqs[i]}${regSuffix}`);
        tokenSet.add(`${eqs[i]}${regSuffix}`);
      }
    }
  }

  const highPhraseBase = [
    fileObj.cleanUnitLabel,
    fileObj.unitName,
    fileObj.unitCode,
    fileObj.subject,
    subj === 'Math' ? 'mathematics maths' : '',
    subj === 'Information Technology' ? 'information technology it ict' : '',
    subj === 'Computer Science' ? 'computer science cs' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const allPhraseBase = [
    highPhraseBase,
    fileObj.name,
    sanitizedPathForTokens,
    fileObj.curriculum,
    fileObj.category,
    fileObj.session,
    DOC_TYPE_PHRASES[dt] || '',
    isReg ? 'regional reg r' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const normSpaces = (text) => ` ${tokenizeRaw(text).join(' ')} `;
  const wordStr = ` ${Array.from(tokenSet).join(' ')} `;

  return {
    highSet,
    metaSet,
    tokenSet,
    wordStr,
    highStr: normSpaces(highPhraseBase),
    phraseStr: normSpaces(allPhraseBase)
  };
}

/**
 * Merge search indexes across all sibling docs inside a grouped unified sitting.
 */
export function finalizeUnifiedSearchData(item, childFiles) {
  const highSet = new Set();
  const metaSet = new Set();
  const tokenSet = new Set();
  const highParts = [];
  const phraseParts = [];

  for (let i = 0; i < childFiles.length; i++) {
    const s = childFiles[i]?._search;
    if (!s) continue;
    s.highSet.forEach((t) => highSet.add(t));
    s.metaSet.forEach((t) => metaSet.add(t));
    s.tokenSet.forEach((t) => tokenSet.add(t));
    if (s.highStr) highParts.push(s.highStr.trim());
    if (s.phraseStr) phraseParts.push(s.phraseStr.trim());
  }

  item._search = {
    highSet,
    metaSet,
    tokenSet,
    wordStr: ` ${Array.from(tokenSet).join(' ')} `,
    highStr: ` ${highParts.join(' ')} `,
    phraseStr: ` ${phraseParts.join(' ')} `
  };
  return item._search;
}

/**
 * Dynamically build a deduplicated catalog vocabulary combining curated terms
 * with real syllabus unit names, textbook titles, and course codes from the loaded library.
 */
export function buildCatalogVocab(flatFiles = []) {
  const vocabSet = new Set(STATIC_SEARCH_VOCAB);
  for (let i = 0; i < flatFiles.length; i++) {
    const f = flatFiles[i];
    if (!f) continue;
    const sources = [f.subject, f.unitCode, f.unitName, f.cleanUnitLabel, f.name];
    for (let s = 0; s < sources.length; s++) {
      const toks = tokenizeRaw(sources[s]);
      for (let t = 0; t < toks.length; t++) {
        const w = toks[t];
        if (w.length < 4 || VOCAB_STOPWORDS.has(w)) continue;
        if (/^\d+$/.test(w)) continue;
        vocabSet.add(w);
      }
    }
  }
  return Array.from(vocabSet);
}

/**
 * Fast bounded Damerau-Levenshtein distance using reusable typed arrays.
 */
export function damerauLevenshtein(a, b, maxDist = 2) {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (lenA === 0) return lenB <= maxDist ? lenB : maxDist + 1;
  if (lenB === 0) return lenA <= maxDist ? lenA : maxDist + 1;

  const need = lenB + 1;
  const prevPrev = need <= _dlPrevPrev.length ? _dlPrevPrev : new Int32Array(need);
  const prev = need <= _dlPrev.length ? _dlPrev : new Int32Array(need);
  const curr = need <= _dlCurr.length ? _dlCurr : new Int32Array(need);

  let rowPrevPrev = prevPrev;
  let rowPrev = prev;
  let rowCurr = curr;

  for (let j = 0; j <= lenB; j++) rowPrev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    rowCurr[0] = i;
    let rowMin = maxDist + 1;
    const chA = a.charCodeAt(i - 1);
    const chAPrev = i > 1 ? a.charCodeAt(i - 2) : -1;
    for (let j = 1; j <= lenB; j++) {
      const chB = b.charCodeAt(j - 1);
      const cost = chA === chB ? 0 : 1;
      let val = rowPrev[j] + 1;
      const ins = rowCurr[j - 1] + 1;
      if (ins < val) val = ins;
      const sub = rowPrev[j - 1] + cost;
      if (sub < val) val = sub;
      if (i > 1 && j > 1 && chA === b.charCodeAt(j - 2) && chAPrev === chB) {
        const trans = rowPrevPrev[j - 2] + 1;
        if (trans < val) val = trans;
      }
      rowCurr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = rowPrevPrev;
    rowPrevPrev = rowPrev;
    rowPrev = rowCurr;
    rowCurr = tmp;
  }
  return rowPrev[lenB];
}

function addAlt(altsMap, entry, editDist, isPrefix = false) {
  const key = `${entry.type}:${entry.val}`;
  const existing = altsMap.get(key);
  if (!existing || editDist < existing.editDist || (!isPrefix && existing.isPrefix && editDist === existing.editDist)) {
    altsMap.set(key, {
      type: entry.type,
      val: entry.val,
      words: entry.words || null,
      editDist,
      isPrefix
    });
  }
}

function addSynonymsForKey(key, altsMap, baseEditDist, isPrefix) {
  const syns = COMPILED_SYNONYMS[key];
  if (!syns) return;
  for (let i = 0; i < syns.length; i++) {
    addAlt(altsMap, syns[i], baseEditDist, isPrefix);
  }
}

function normalizeQueryString(rawQuery) {
  let q = String(rawQuery || '').toLowerCase().replace(/['’]/g, '');

  // Strip Edexcel cover-sheet component numbers ("WMA11/01" -> "wma11", "4MA1/02HR" -> "4ma1 2hr")
  q = q.replace(/\b([a-z]{2,3}\d{2}|6[a-z]{2}\d{2})[/_\s-]+0[1-9]\b/g, '$1');
  q = q.replace(/\b([a-z]{2,3}\d{2}|4[a-z]{1,3}\d|6[a-z]{2}\d{2})[/_\s-]+0?([1-4][hrfa]{1,2})\b/g, '$1 $2');
  q = q.replace(/\b(4[a-z]{1,3}\d)[/_\s-]+0([1-4])\b/g, '$1 p$2');

  // Rejoin accidentally spaced course codes ("wma 11" -> "wma11", "4ma 1" -> "4ma1", "6bi 01" -> "6bi01")
  q = q.replace(/\b(w[a-z]{2}|6[a-z]{2})\s+(\d{2}[ar]?)\b/g, '$1$2');
  q = q.replace(/\b(4[a-z]{1,3})\s+(\d[hf]?r?)\b/g, '$1$2');

  // Split joined session+year or code+year ("jan26" -> "jan 26", "wma11jan25" -> "wma11 jan 25")
  q = q.replace(/([a-z0-9]{2,})(jan(?:uary)?|feb(?:ruary)?|may|jun(?:e)?|summer|oct(?:ober)?|nov(?:ember)?|autumn|winter)(\d{2}|\d{4})\b/gi, '$1 $2 $3');
  q = q.replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar|may|jun(?:e)?|summer|oct(?:ober)?|nov(?:ember)?|autumn|winter)[-_\s/]*(\d{2}|\d{4})\b/g, '$1 $2');

  // Normalize common multi-word unit shorthands ("unit 1" -> "u1", "paper 1r" -> "p1r", "mech 1" -> "m1", "pure mathematics 3" -> "wma13")
  q = q.replace(/\bunit\s*([1-6])\b/g, 'u$1');
  q = q.replace(/\bpaper\s*([1-4][ar]?)\b/g, 'p$1');
  q = q.replace(/\bfurther\s+(?:pure(?:\s+math(?:ematics|s)?)?|math(?:ematics|s)?)\s*(?:f?p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `fp${d} ${v}` : `fp${d}`));
  q = q.replace(/\bpure(?:\s+math(?:ematics|s)?)?\s*(?:p|u)?([1-4])([ar])?\b/g, (_, d, v) => (v ? `wma1${d} ${v}` : `wma1${d}`));
  q = q.replace(/\b(?:mechanics|mech)\s*(?:m|p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `m${d} ${v}` : `m${d}`));
  q = q.replace(/\b(?:statistics|stats?)\s*(?:s|p|u)?([1-3])([ar])?\b/g, (_, d, v) => (v ? `s${d} ${v}` : `s${d}`));
  q = q.replace(/\bdecision(?:\s+math(?:ematics|s)?)?\s*(?:d|p|u)?1([ar])?\b/g, (_, v) => (v ? `d1 ${v}` : 'd1'));
  q = q.replace(/\bcore\s+(?:math(?:ematics|s)?\s*)?(?:c|p|u)?([1-4]|12|34)([ar])?\b/g, (_, d, v) => (v ? `c${d} ${v}` : `c${d}`));
  q = q.replace(/\bmay[-_\s/]+june?\b/g, 'mayjune');
  q = q.replace(/\boct[-_\s/]+nov(?:ember)?\b/g, 'octnov');

  return q.trim();
}

const _vocabSetCache = new WeakMap();
function getVocabSet(catalogVocab) {
  if (!Array.isArray(catalogVocab)) return STATIC_SEARCH_VOCAB_SET;
  let s = _vocabSetCache.get(catalogVocab);
  if (!s) {
    s = new Set(catalogVocab);
    _vocabSetCache.set(catalogVocab, s);
  }
  return s;
}

/**
 * Parse a user search query into structured positive groups, exact phrases,
 * negative `-exclusions`, typo corrections, and a "Did you mean" candidate.
 */
export function parseSearchQuery(rawQuery, catalogVocab = STATIC_SEARCH_VOCAB) {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) {
    return { hasQuery: false, groups: [], exclusions: [], corrections: [], didYouMean: '' };
  }

  // Extract quoted exact phrases first
  const phrases = [];
  let remaining = trimmed.replace(/"([^"]{2,})"/g, (_, inner) => {
    const words = tokenizeRaw(inner);
    if (words.length >= 1) phrases.push(words);
    return ' ';
  });

  // Extract standalone negative exclusions (e.g. "-regional", "-er", "-r", "-igcse")
  const exclusions = [];
  remaining = remaining.replace(/(?:^|\s)-([a-z0-9]+)\b/gi, (_, negTok) => {
    const cleanNeg = negTok.toLowerCase();
    if (cleanNeg.length >= 1) exclusions.push(cleanNeg);
    return ' ';
  });

  const normalized = normalizeQueryString(remaining).replace(/[,/;•—–_()-]+/g, ' ').trim();
  const rawTokens = normalized ? normalized.split(/\s+/).filter(Boolean) : [];

  const groups = [];
  const corrections = [];

  for (let i = 0; i < phrases.length; i++) {
    const pWords = phrases[i];
    const pStr = pWords.join(' ');
    groups.push({
      primary: pStr,
      display: `"${pStr}"`,
      isSpecific: true,
      alts: [{ type: 'phrase', val: pStr, words: pWords, editDist: 0, isPrefix: false }]
    });
  }

  const vocabSet = getVocabSet(catalogVocab);

  for (let i = 0; i < rawTokens.length; i++) {
    let tok = rawTokens[i];
    const rawOriginal = tok;

    // Expand 2-digit years ("26" -> "2026", "04" -> "2004")
    if (/^\d{2}$/.test(tok)) {
      const yrNum = parseInt(tok, 10);
      if (yrNum >= 3 && yrNum <= 29) {
        tok = String(2000 + yrNum);
      }
    }

    const altsMap = new Map();
    addAlt(altsMap, { type: 'tok', val: tok }, 0, false);
    addSynonymsForKey(tok, altsMap, 0, false);

    const isNumeric = /^\d+$/.test(tok);
    const hasDigit = /\d/.test(tok);
    const isKnownWordOrCode = Boolean(COMPILED_SYNONYMS[tok] || STATIC_SEARCH_VOCAB_SET.has(tok) || vocabSet.has(tok));
    let bestCorrection = null;

    if (!isNumeric && tok.length === 3 && !isKnownWordOrCode) {
      // Short 3-char academic/session typo tolerance (e.g. "boi" -> "bio", "jna" -> "jan")
      SHORT_VOCAB_3CHAR.forEach((word) => {
        if (word === tok) return;
        const dist = damerauLevenshtein(tok, word, 1);
        if (dist === 1) {
          addAlt(altsMap, { type: 'tok', val: word }, 1, false);
          addSynonymsForKey(word, altsMap, 1, false);
          if (!bestCorrection || dist < bestCorrection.dist) {
            bestCorrection = { word, dist };
          }
        }
      });
    } else if (!isNumeric && tok.length >= 4) {
      const maxEdits = hasDigit ? 1 : (tok.length >= 7 ? 2 : 1);
      const tokDigits = hasDigit ? tok.replace(/\D/g, '') : '';
      let prefixMatches = 0;

      for (let v = 0; v < catalogVocab.length; v++) {
        const word = catalogVocab[v];
        if (word === tok) continue;

        if (!isKnownWordOrCode && word.startsWith(tok)) {
          addAlt(altsMap, { type: 'tok', val: word }, 0, true);
          addSynonymsForKey(word, altsMap, 0, true);
          prefixMatches++;
        } else if (!isKnownWordOrCode && Math.abs(word.length - tok.length) <= maxEdits) {
          // Preserve exact digits inside paper/unit codes so "4ph1" never mutates to "4ch1" or "wph11" to "wph12"
          if (hasDigit) {
            if (!/\d/.test(word) || word.replace(/\D/g, '') !== tokDigits) continue;
          }
          // For 1-edit word typos allow mistyped/dropped first char ("hysics", "conomics");
          // for 2-edit typos require anchored prefix or swap for high precision.
          const firstAnchored =
            word[0] === tok[0] ||
            (word[0] === tok[1] && word[1] === tok[0]) ||
            (!hasDigit && maxEdits === 1 && tok.length >= 5) ||
            (maxEdits === 2 && tok.slice(1, 3) === word.slice(0, 2));
          if (!firstAnchored) continue;

          const dist = damerauLevenshtein(tok, word, maxEdits);
          if (dist <= maxEdits) {
            addAlt(altsMap, { type: 'tok', val: word }, dist, false);
            addSynonymsForKey(word, altsMap, dist, false);
            if (
              !bestCorrection ||
              dist < bestCorrection.dist ||
              (dist === bestCorrection.dist && word.length > bestCorrection.word.length)
            ) {
              bestCorrection = { word, dist };
            }
          }
        }
      }

      if (prefixMatches > 0 && bestCorrection && bestCorrection.dist > 1) {
        bestCorrection = null;
      }
    }

    if (bestCorrection && !STATIC_SEARCH_VOCAB_SET.has(tok) && !COMPILED_SYNONYMS[tok]) {
      corrections.push({ from: rawOriginal, to: bestCorrection.word, dist: bestCorrection.dist });
    }

    const isYear = /^\d{4}$/.test(tok);
    const isCode = /\d/.test(tok) && !isYear;
    const isGeneric = GENERIC_QUERY_WORDS.has(tok);
    const isSession = Boolean(
      SESSION_SYNONYMS_BY_MONTH.mayJune.includes(tok) ||
      SESSION_SYNONYMS_BY_MONTH.octNov.includes(tok) ||
      SESSION_SYNONYMS_BY_MONTH.janFeb.includes(tok) ||
      tok === 'mayjune' ||
      tok === 'octnov'
    );
    const isSubjectOrTopic = !isYear && !isGeneric && !isSession && (
      Boolean(COMPILED_SYNONYMS[tok] || IGCSE_SUBJECT_BY_CODE[tok]) ||
      tok.length >= 3
    );

    groups.push({
      primary: tok,
      display: rawOriginal,
      isYear,
      isCode,
      isSpecific: isCode || isSubjectOrTopic,
      alts: Array.from(altsMap.values())
    });
  }

  let didYouMean = '';
  if (corrections.length > 0 && rawTokens.length > 0) {
    const correctionMap = new Map(corrections.map((c) => [c.from, c.to]));
    const candidateTokens = rawTokens.map((t) => correctionMap.get(t) || t);
    const rebuilt = candidateTokens.join(' ');
    if (rebuilt !== rawTokens.join(' ')) {
      didYouMean = exclusions.length > 0 ? `${rebuilt} ${exclusions.map((e) => `-${e}`).join(' ')}` : rebuilt;
    }
  }

  return {
    hasQuery: groups.length > 0 || exclusions.length > 0,
    groups,
    exclusions,
    corrections,
    didYouMean
  };
}

function phraseContainsWithoutFurtherPrefix(haystack, phraseVal) {
  const needle = ` ${phraseVal} `;
  if (!phraseVal.startsWith('pure mathematics ')) {
    return haystack.includes(needle);
  }
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    // Reject "... further pure mathematics 1 ..." when searching strictly for "pure mathematics 1" (P1/WMA11)
    const before = haystack.slice(Math.max(0, idx - 8), idx);
    if (!before.endsWith(' further')) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

function itemMatchesAlt(searchData, alt, allowPrefix = false) {
  if (alt.type === 'phrase') {
    if (phraseContainsWithoutFurtherPrefix(searchData.highStr, alt.val)) return 'high_exact';
    if (phraseContainsWithoutFurtherPrefix(searchData.phraseStr, alt.val)) return 'body_exact';
    return null;
  }

  const val = alt.val;
  if (searchData.highSet.has(val)) return 'high_exact';
  if (searchData.metaSet.has(val)) return 'meta_exact';
  if (searchData.tokenSet.has(val)) return 'body_exact';
  if (allowPrefix && val.length >= 3 && searchData.wordStr.includes(` ${val}`)) {
    return 'word_prefix';
  }
  return null;
}

function scoreGroupMatch(item, searchData, group) {
  let bestScore = -1;
  let usedTypo = false;

  for (let j = 0; j < group.alts.length; j++) {
    const alt = group.alts[j];
    const allowPrefix = alt.val === group.primary && !alt.isPrefix && alt.editDist === 0;
    const hitTier = itemMatchesAlt(searchData, alt, allowPrefix);
    if (!hitTier) continue;

    let s = 0;
    if (hitTier === 'high_exact') s = 18;
    else if (hitTier === 'meta_exact') s = 12;
    else if (hitTier === 'body_exact') s = 8;
    else if (hitTier === 'word_prefix') s = 6;

    // Exact field boosts (including canonical unitCode equivalences like WMA13 <-> P3, WME01 <-> M1)
    if (alt.type === 'tok') {
      const uc = item.unitCode ? item.unitCode.toLowerCase() : '';
      const ucBase = uc.replace(/[ar]$/, '');
      const isExactUnitCode = uc !== '' && (
        uc === alt.val ||
        ucBase === alt.val ||
        (ITEM_CODE_EQUIV[uc] && ITEM_CODE_EQUIV[uc].includes(alt.val)) ||
        (ITEM_CODE_EQUIV[ucBase] && ITEM_CODE_EQUIV[ucBase].includes(alt.val))
      );
      if (isExactUnitCode) s += 16;
      if (item.subject && item.subject.toLowerCase() === alt.val) s += 10;
      if (item.year && String(item.year) === alt.val) s += 8;
      const isPrimaryOrEquiv =
        alt.val === group.primary ||
        (isExactUnitCode && (
          uc === group.primary ||
          ucBase === group.primary ||
          (ITEM_CODE_EQUIV[uc] && ITEM_CODE_EQUIV[uc].includes(group.primary)) ||
          (ITEM_CODE_EQUIV[ucBase] && ITEM_CODE_EQUIV[ucBase].includes(group.primary))
        ));
      if (isPrimaryOrEquiv && !alt.isPrefix && alt.editDist === 0) s += 4;
    }

    if (alt.isPrefix) s -= 1;
    if (alt.editDist > 0) s -= alt.editDist * 4;

    if (s > bestScore) {
      bestScore = s;
      usedTypo = alt.editDist > 0;
    }
  }

  return bestScore >= 0 ? { score: bestScore, usedTypo } : null;
}

function itemViolatesExclusions(searchData, exclusions) {
  for (let i = 0; i < exclusions.length; i++) {
    const ex = exclusions[i];
    if (searchData.tokenSet.has(ex)) return true;
    const exSyns = COMPILED_SYNONYMS[ex];
    if (exSyns) {
      for (let j = 0; j < exSyns.length; j++) {
        if (itemMatchesAlt(searchData, exSyns[j])) return true;
      }
    }
  }
  return false;
}

/**
 * Filter & score items with strict AND + optional partial-match recovery when 0 strict results occur.
 */
export function executeSmartSearch(files, parsedQuery, { isUnified = true } = {}) {
  if (!parsedQuery || !parsedQuery.hasQuery) {
    return {
      files,
      relevanceMap: null,
      isPartialFallback: false,
      missingTerms: [],
      appliedCorrections: [],
      didYouMean: ''
    };
  }

  const { groups, exclusions, corrections, didYouMean } = parsedQuery;
  const FURTHER_QUERY_KEYS = new Set([
    'further', 'fmath', 'furthermath', 'furthermaths',
    'fp1', 'fp2', 'fp3', 'f1', 'f2', 'f3',
    'wfm01', 'wfm02', 'wfm03', '4pm1', '4pm0'
  ]);
  const hasPureQueryToken = groups.some((g) => g.primary === 'pure' || /^wma1[1-4]$/.test(g.primary));
  const hasFurtherQueryToken = groups.some((g) => FURTHER_QUERY_KEYS.has(g.primary));
  const strictMatched = [];
  const strictRelevance = new WeakMap();
  const groupHitCounts = new Array(groups.length).fill(0);
  let strictTypoUsed = false;

  // Candidate partial fallback buckets
  const partialCandidates = [];

  for (let k = 0; k < files.length; k++) {
    const item = files[k];
    const searchData = item._search;
    if (!searchData) continue;
    if (exclusions.length > 0 && itemViolatesExclusions(searchData, exclusions)) continue;

    let matchedCount = 0;
    let totalScore = 0;
    let specificMatches = 0;
    let itemUsedTypo = false;

    for (let i = 0; i < groups.length; i++) {
      const res = scoreGroupMatch(item, searchData, groups[i]);
      if (res) {
        matchedCount++;
        totalScore += res.score;
        groupHitCounts[i]++;
        if (groups[i].isSpecific) specificMatches++;
        if (res.usedTypo) itemUsedTypo = true;
      }
    }

    if (hasPureQueryToken && !hasFurtherQueryToken && searchData.highSet.has('further')) {
      totalScore -= 12;
    }

    if (matchedCount === groups.length) {
      if (isUnified && item.isUnifiedSitting) {
        if (item.docs?.QP && item.docs?.MS) totalScore += 3;
        else if (item.docs?.QP) totalScore += 1;
      }
      strictRelevance.set(item, totalScore);
      strictMatched.push(item);
      if (itemUsedTypo) strictTypoUsed = true;
    } else if (groups.length >= 2 && matchedCount > 0) {
      partialCandidates.push({ item, matchedCount, specificMatches, totalScore });
    }
  }

  if (strictMatched.length > 0 || groups.length === 0) {
    return {
      files: strictMatched,
      relevanceMap: strictRelevance,
      isPartialFallback: false,
      missingTerms: [],
      appliedCorrections: strictTypoUsed ? corrections : [],
      didYouMean: strictTypoUsed ? didYouMean : ''
    };
  }

  // Strict AND had 0 hits: compute relaxed partial matches prioritizing specific anchors
  const hasSpecificGroups = groups.some((g) => g.isSpecific);
  const missingTerms = [];
  for (let i = 0; i < groups.length; i++) {
    if (groupHitCounts[i] === 0) {
      missingTerms.push(groups[i].display);
    }
  }

  const partialMatched = [];
  const partialRelevance = new WeakMap();
  const minMatched = groups.length >= 3 ? Math.max(2, groups.length - 1) : 1;

  for (let p = 0; p < partialCandidates.length; p++) {
    const cand = partialCandidates[p];
    if (cand.matchedCount < minMatched) continue;
    if (hasSpecificGroups && cand.specificMatches === 0 && groups.length <= 2) continue;

    const score = cand.matchedCount * 100 + cand.specificMatches * 40 + cand.totalScore;
    partialRelevance.set(cand.item, score);
    partialMatched.push(cand.item);
  }

  // If minMatched >= 2 was still too strict on 3+ word queries, relax to any multi-specific anchor
  if (partialMatched.length === 0 && partialCandidates.length > 0) {
    for (let p = 0; p < partialCandidates.length; p++) {
      const cand = partialCandidates[p];
      if (hasSpecificGroups && cand.specificMatches === 0) continue;
      const score = cand.matchedCount * 100 + cand.specificMatches * 40 + cand.totalScore;
      partialRelevance.set(cand.item, score);
      partialMatched.push(cand.item);
    }
  }

  return {
    files: partialMatched,
    relevanceMap: partialRelevance,
    isPartialFallback: partialMatched.length > 0,
    missingTerms,
    appliedCorrections: corrections,
    didYouMean
  };
}
