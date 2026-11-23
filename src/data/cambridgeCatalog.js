// Authoritative Cambridge International (CAIE) syllabus catalog (strictly international qualifications):
// Cambridge International AS & A Level (CIE-AL), Cambridge IGCSE (CIE-IGCSE), and Cambridge O Level (CIE-OL).

export const CAMBRIDGE_SYLLABUSES = {
  // ─── Cambridge International AS & A Level (9xxx / 8xxx) ────────────────────────
  '9709': {
    code: '9709',
    name: 'Mathematics',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Pure Mathematics 1 (P1)',
      2: 'Pure Mathematics 2 (P2)',
      3: 'Pure Mathematics 3 (P3)',
      4: 'Mechanics (P4)',
      5: 'Probability & Statistics 1 (P5)',
      6: 'Probability & Statistics 2 (P6)'
    },
    legacyPre2020Papers: {
      5: 'Legacy Mechanics 2 (Old P5)',
      6: 'Probability & Statistics 1 (P5)',
      7: 'Probability & Statistics 2 (P6)'
    }
  },
  '9231': {
    code: '9231',
    name: 'Further Mathematics',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Further Pure Mathematics 1 (P1)',
      2: 'Further Pure Mathematics 2 (P2)',
      3: 'Further Mechanics (P3)',
      4: 'Further Probability & Statistics (P4)'
    },
    legacyPre2020Papers: {
      1: 'Legacy Further Mathematics Paper 1 (Pre-2020)',
      2: 'Legacy Further Mathematics Paper 2 (Pre-2020)'
    }
  },
  '9702': {
    code: '9702',
    name: 'Physics',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Multiple Choice (AS)',
      2: 'Paper 2: AS Level Structured Questions',
      3: 'Paper 3: Advanced Practical Skills (AS)',
      4: 'Paper 4: A Level Structured Questions',
      5: 'Paper 5: Planning, Analysis & Evaluation (A2)'
    }
  },
  '9701': {
    code: '9701',
    name: 'Chemistry',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Multiple Choice (AS)',
      2: 'Paper 2: AS Level Structured Questions',
      3: 'Paper 3: Advanced Practical Skills (AS)',
      4: 'Paper 4: A Level Structured Questions',
      5: 'Paper 5: Planning, Analysis & Evaluation (A2)'
    }
  },
  '9700': {
    code: '9700',
    name: 'Biology',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Multiple Choice (AS)',
      2: 'Paper 2: AS Level Structured Questions',
      3: 'Paper 3: Advanced Practical Skills (AS)',
      4: 'Paper 4: A Level Structured Questions',
      5: 'Paper 5: Planning, Analysis & Evaluation (A2)'
    }
  },
  '9618': {
    code: '9618',
    name: 'Computer Science',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    legacyCodes: ['9608', '9691'],
    hasDataFiles: true,
    papers: {
      1: 'Paper 1: Theory Fundamentals (AS)',
      2: 'Paper 2: Problem-Solving & Programming (AS)',
      3: 'Paper 3: Advanced Theory (A2)',
      4: 'Paper 4: Practical (A2)'
    }
  },
  '9626': {
    code: '9626',
    name: 'Information Technology',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    legacyCodes: ['9713'],
    hasDataFiles: true,
    papers: {
      1: 'Paper 1: Theory (AS)',
      2: 'Paper 2: Practical (AS)',
      3: 'Paper 3: Advanced Theory (A2)',
      4: 'Paper 4: Advanced Practical (A2)'
    }
  },
  '9708': {
    code: '9708',
    name: 'Economics',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: AS Multiple Choice',
      2: 'Paper 2: AS Data Response & Essay',
      3: 'Paper 3: A Level Multiple Choice',
      4: 'Paper 4: A Level Data Response & Essays'
    }
  },
  '9609': {
    code: '9609',
    name: 'Business',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    legacyCodes: ['9707'],
    papers: {
      1: 'Paper 1: Business Concepts 1 (AS)',
      2: 'Paper 2: Business Concepts 2 (AS)',
      3: 'Paper 3: Business Decision-Making (A2)',
      4: 'Paper 4: Business Strategy (A2)'
    }
  },
  '9706': {
    code: '9706',
    name: 'Accounting',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: AS Multiple Choice',
      2: 'Paper 2: Fundamentals of Accounting (AS)',
      3: 'Paper 3: Financial Accounting (A2)',
      4: 'Paper 4: Cost & Management Accounting (A2)'
    }
  },
  '9990': {
    code: '9990',
    name: 'Psychology',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    legacyCodes: ['9698'],
    papers: {
      1: 'Paper 1: Approaches, Issues & Debates (AS)',
      2: 'Paper 2: Research Methods (AS)',
      3: 'Paper 3: Specialist Options Theory (A2)',
      4: 'Paper 4: Specialist Options Application (A2)'
    }
  },
  '9093': {
    code: '9093',
    name: 'English Language',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Reading (AS)',
      2: 'Paper 2: Writing (AS)',
      3: 'Paper 3: Language Analysis (A2)',
      4: 'Paper 4: Language Topics (A2)'
    }
  },
  '9695': {
    code: '9695',
    name: 'Literature in English',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Drama & Poetry (AS)',
      2: 'Paper 2: Prose & Unseen (AS)',
      3: 'Paper 3: Shakespeare & Drama (A2)',
      4: 'Paper 4: Pre- & Post-1900 Poetry & Prose (A2)'
    }
  },
  '9696': {
    code: '9696',
    name: 'Geography',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Core Physical Geography (AS)',
      2: 'Paper 2: Core Human Geography (AS)',
      3: 'Paper 3: Advanced Physical Geography (A2)',
      4: 'Paper 4: Advanced Human Geography (A2)'
    }
  },
  '9489': {
    code: '9489',
    name: 'History',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    legacyCodes: ['9389'],
    papers: {
      1: 'Paper 1: Document Question (AS)',
      2: 'Paper 2: Outline Study (AS)',
      3: 'Paper 3: Interpretations Question (A2)',
      4: 'Paper 4: Depth Study (A2)'
    }
  },
  '9084': {
    code: '9084',
    name: 'Law',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: English Legal System (AS)',
      2: 'Paper 2: Criminal Law (AS)',
      3: 'Paper 3: Law of Contract (A2)',
      4: 'Paper 4: Law of Tort (A2)'
    }
  },
  '9699': {
    code: '9699',
    name: 'Sociology',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Socialisation, Identity & Research (AS)',
      2: 'Paper 2: The Family (AS)',
      3: 'Paper 3: Education (A2)',
      4: 'Paper 4: Globalisation, Media & Religion (A2)'
    }
  },
  '8021': {
    code: '8021',
    name: 'English General Paper',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Essay',
      2: 'Paper 2: Comprehension'
    }
  },
  '9693': {
    code: '9693',
    name: 'Marine Science',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: AS Level Theory',
      2: 'Paper 2: AS Data-Handling & Investigative Skills',
      3: 'Paper 3: A Level Theory',
      4: 'Paper 4: A Level Data-Handling & Investigative Skills'
    }
  },
  '8291': {
    code: '8291',
    name: 'Environmental Management',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Principles of Environmental Management',
      2: 'Paper 2: Management in Context'
    }
  },
  '9607': {
    code: '9607',
    name: 'Media Studies',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      2: 'Paper 2: Media Texts & Contexts (AS)',
      4: 'Paper 4: Critical Perspectives (A2)'
    }
  },
  '9239': {
    code: '9239',
    name: 'Global Perspectives & Research',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Written Examination'
    }
  },
  '9705': {
    code: '9705',
    name: 'Design & Technology',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Product Design (AS)',
      2: 'Paper 2: Design Project (AS)',
      3: 'Paper 3: Design & Manufacture (A2)'
    }
  },
  '9395': {
    code: '9395',
    name: 'Travel & Tourism',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: The Industry (AS)',
      3: 'Paper 3: Destination Marketing (A2)',
      4: 'Paper 4: Destination Development & Management (A2)'
    }
  },
  '9488': {
    code: '9488',
    name: 'Islamic Studies',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      1: 'Paper 1: Islamic Texts & Early History (AS)',
      2: 'Paper 2: Islamic Thought & Civilization (AS)',
      3: 'Paper 3: Beliefs, Practices & Contemporary Islam (A2)',
      4: 'Paper 4: Islamic Texts & Scholarship (A2)'
    }
  },
  '9716': {
    code: '9716',
    name: 'French',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading & Writing',
      3: 'Paper 3: Essay',
      4: 'Paper 4: Texts'
    }
  },
  '9717': {
    code: '9717',
    name: 'German',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading & Writing',
      3: 'Paper 3: Essay',
      4: 'Paper 4: Texts'
    }
  },
  '9719': {
    code: '9719',
    name: 'Spanish',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading & Writing',
      3: 'Paper 3: Essay',
      4: 'Paper 4: Texts'
    }
  },
  '9680': {
    code: '9680',
    name: 'Arabic',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      2: 'Paper 2: Reading & Writing',
      3: 'Paper 3: Essay',
      4: 'Paper 4: Texts',
      5: 'Paper 5: Prose'
    }
  },
  '9715': {
    code: '9715',
    name: 'Chinese',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      2: 'Paper 2: Reading & Writing',
      3: 'Paper 3: Essay',
      4: 'Paper 4: Texts'
    }
  },
  '9686': {
    code: '9686',
    name: 'Urdu',
    spec: 'CIE-AL',
    curriculum: 'Cambridge AS & A Level',
    papers: {
      2: 'Paper 2: Reading & Writing',
      3: 'Paper 3: Essay',
      4: 'Paper 4: Texts'
    }
  },

  // ─── Cambridge IGCSE (0xxx A*-G, linked to 09xx / 71xx 9-1 equivalents) ────────
  '0580': {
    code: '0580',
    name: 'Mathematics',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0980',
    papers: {
      1: 'Paper 1: Core',
      2: 'Paper 2: Extended',
      3: 'Paper 3: Core',
      4: 'Paper 4: Extended'
    }
  },
  '0606': {
    code: '0606',
    name: 'Additional Mathematics',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    sharedOlCode: '4037',
    papers: {
      1: 'Paper 1',
      2: 'Paper 2'
    }
  },
  '0607': {
    code: '0607',
    name: 'International Mathematics',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Core',
      2: 'Paper 2: Extended',
      3: 'Paper 3: Core',
      4: 'Paper 4: Extended',
      5: 'Paper 5: Investigation (Core)',
      6: 'Paper 6: Investigation & Modelling (Extended)'
    }
  },
  '0625': {
    code: '0625',
    name: 'Physics',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0972',
    papers: {
      1: 'Paper 1: Multiple Choice (Core)',
      2: 'Paper 2: Multiple Choice (Extended)',
      3: 'Paper 3: Theory (Core)',
      4: 'Paper 4: Theory (Extended)',
      5: 'Paper 5: Practical Test',
      6: 'Paper 6: Alternative to Practical'
    },
    legacyPre2016Papers: {
      1: 'Legacy Paper 1: Multiple Choice (Pre-2016)',
      2: 'Legacy Paper 2: Extended Theory (Pre-2016)',
      3: 'Legacy Paper 3: Core Theory (Pre-2016)'
    }
  },
  '0620': {
    code: '0620',
    name: 'Chemistry',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0971',
    papers: {
      1: 'Paper 1: Multiple Choice (Core)',
      2: 'Paper 2: Multiple Choice (Extended)',
      3: 'Paper 3: Theory (Core)',
      4: 'Paper 4: Theory (Extended)',
      5: 'Paper 5: Practical Test',
      6: 'Paper 6: Alternative to Practical'
    },
    legacyPre2016Papers: {
      1: 'Legacy Paper 1: Multiple Choice (Pre-2016)',
      2: 'Legacy Paper 2: Extended Theory (Pre-2016)',
      3: 'Legacy Paper 3: Core Theory (Pre-2016)'
    }
  },
  '0610': {
    code: '0610',
    name: 'Biology',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0970',
    papers: {
      1: 'Paper 1: Multiple Choice (Core)',
      2: 'Paper 2: Multiple Choice (Extended)',
      3: 'Paper 3: Theory (Core)',
      4: 'Paper 4: Theory (Extended)',
      5: 'Paper 5: Practical Test',
      6: 'Paper 6: Alternative to Practical'
    },
    legacyPre2016Papers: {
      1: 'Legacy Paper 1: Multiple Choice (Pre-2016)',
      2: 'Legacy Paper 2: Extended Theory (Pre-2016)',
      3: 'Legacy Paper 3: Core Theory (Pre-2016)'
    }
  },
  '0654': {
    code: '0654',
    name: 'Co-ordinated Sciences (Double Award)',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0973',
    papers: {
      1: 'Paper 1: Multiple Choice (Core)',
      2: 'Paper 2: Multiple Choice (Extended)',
      3: 'Paper 3: Theory (Core)',
      4: 'Paper 4: Theory (Extended)',
      5: 'Paper 5: Practical Test',
      6: 'Paper 6: Alternative to Practical'
    }
  },
  '0653': {
    code: '0653',
    name: 'Combined Science',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Multiple Choice (Core)',
      2: 'Paper 2: Multiple Choice (Extended)',
      3: 'Paper 3: Theory (Core)',
      4: 'Paper 4: Theory (Extended)',
      5: 'Paper 5: Practical Test',
      6: 'Paper 6: Alternative to Practical'
    }
  },
  '0478': {
    code: '0478',
    name: 'Computer Science',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0984',
    sharedOlCode: '2210',
    papers: {
      1: 'Paper 1: Computer Systems',
      2: 'Paper 2: Algorithms, Programming & Logic'
    }
  },
  '0417': {
    code: '0417',
    name: 'ICT',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0983',
    hasDataFiles: true,
    papers: {
      1: 'Paper 1: Theory',
      2: 'Paper 2: Document Production, Databases & Presentations',
      3: 'Paper 3: Spreadsheets & Website Authoring'
    }
  },
  '0500': {
    code: '0500',
    name: 'First Language English',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0990',
    papers: {
      1: 'Paper 1: Reading',
      2: 'Paper 2: Directed Writing & Composition'
    }
  },
  '0510': {
    code: '0510',
    name: 'English as a Second Language',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0993',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Reading & Writing',
      2: 'Paper 2: Listening (MCQ)'
    },
    legacyPre2024Papers: {
      1: 'Legacy Paper 1: Reading & Writing (Core)',
      2: 'Legacy Paper 2: Reading & Writing (Extended)',
      3: 'Legacy Paper 3: Listening (Core)',
      4: 'Legacy Paper 4: Listening (Extended)'
    }
  },
  '0511': {
    code: '0511',
    name: 'English as a Second Language (Count-in Speaking)',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0991',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Reading & Writing',
      2: 'Paper 2: Listening (MCQ)'
    },
    legacyPre2024Papers: {
      1: 'Legacy Paper 1: Reading & Writing (Core)',
      2: 'Legacy Paper 2: Reading & Writing (Extended)',
      3: 'Legacy Paper 3: Listening (Core)',
      4: 'Legacy Paper 4: Listening (Extended)'
    }
  },
  '0475': {
    code: '0475',
    name: 'Literature in English',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0992',
    legacyCodes: ['0486'],
    papers: {
      1: 'Paper 1: Poetry & Prose',
      2: 'Paper 2: Drama',
      3: 'Paper 3: Drama (Open Text)',
      4: 'Paper 4: Unseen'
    }
  },
  '0455': {
    code: '0455',
    name: 'Economics',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0987',
    sharedOlCode: '2281',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Structured Questions'
    }
  },
  '0450': {
    code: '0450',
    name: 'Business Studies',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0986',
    sharedOlCode: '7115',
    papers: {
      1: 'Paper 1: Short Answer & Data Response',
      2: 'Paper 2: Case Study'
    }
  },
  '0452': {
    code: '0452',
    name: 'Accounting',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0985',
    sharedOlCode: '7707',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Structured Written Paper'
    }
  },
  '0460': {
    code: '0460',
    name: 'Geography',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0976',
    papers: {
      1: 'Paper 1: Geographical Themes',
      2: 'Paper 2: Geographical Skills',
      4: 'Paper 4: Alternative to Coursework'
    }
  },
  '0470': {
    code: '0470',
    name: 'History',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0977',
    papers: {
      1: 'Paper 1: Structured Questions',
      2: 'Paper 2: Document Questions',
      4: 'Paper 4: Alternative to Coursework'
    }
  },
  '0680': {
    code: '0680',
    name: 'Environmental Management',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Theory',
      2: 'Paper 2: Management in Context'
    }
  },
  '0457': {
    code: '0457',
    name: 'Global Perspectives',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Written Examination'
    }
  },
  '0495': {
    code: '0495',
    name: 'Sociology',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Research Methods, Identity & Inequality',
      2: 'Paper 2: Family, Education & Crime'
    }
  },
  '0520': {
    code: '0520',
    name: 'French',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '7156',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading',
      3: 'Paper 3: Speaking',
      4: 'Paper 4: Writing'
    }
  },
  '0525': {
    code: '0525',
    name: 'German',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '7159',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading',
      3: 'Paper 3: Speaking',
      4: 'Paper 4: Writing'
    }
  },
  '0530': {
    code: '0530',
    name: 'Spanish',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '7160',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading',
      3: 'Paper 3: Speaking',
      4: 'Paper 4: Writing'
    }
  },
  '0508': {
    code: '0508',
    name: 'First Language Arabic',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '7180',
    legacyCodes: ['7184'],
    papers: {
      1: 'Paper 1: Reading',
      2: 'Paper 2: Writing'
    }
  },
  '0544': {
    code: '0544',
    name: 'Foreign Language Arabic',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading',
      3: 'Paper 3: Speaking',
      4: 'Paper 4: Writing'
    }
  },
  '0547': {
    code: '0547',
    name: 'Mandarin Chinese',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening',
      2: 'Paper 2: Reading',
      3: 'Paper 3: Speaking',
      4: 'Paper 4: Writing'
    }
  },
  '0509': {
    code: '0509',
    name: 'First Language Chinese',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Reading, Directed Writing & Classical Chinese',
      2: 'Paper 2: Writing'
    }
  },
  '0501': {
    code: '0501',
    name: 'First Language French',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Reading & Directed Writing',
      2: 'Paper 2: Writing'
    }
  },
  '0502': {
    code: '0502',
    name: 'First Language Spanish',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Reading',
      2: 'Paper 2: Directed Writing & Composition'
    }
  },
  '0696': {
    code: '0696',
    name: 'First Language Malay',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Reading & Directed Writing',
      2: 'Paper 2: Composition'
    }
  },
  '0493': {
    code: '0493',
    name: 'Islamiyat',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: "Paper 1: Major Themes of the Qur'an & History",
      2: 'Paper 2: Hadith, Caliphate & Articles of Faith'
    }
  },
  '0448': {
    code: '0448',
    name: 'Pakistan Studies',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: History & Culture of Pakistan',
      2: 'Paper 2: Environment of Pakistan'
    }
  },
  '0449': {
    code: '0449',
    name: 'Bangladesh Studies',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: History & Culture of Bangladesh',
      2: 'Paper 2: Environment & Development of Bangladesh'
    }
  },
  '0445': {
    code: '0445',
    name: 'Design & Technology',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Product Design',
      3: 'Paper 3: Resistant Materials',
      4: 'Paper 4: Systems & Control',
      5: 'Paper 5: Graphic Products'
    }
  },
  '0471': {
    code: '0471',
    name: 'Travel & Tourism',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Key Terms & Concepts',
      2: 'Paper 2: Managing & Marketing Destinations'
    }
  },
  '0454': {
    code: '0454',
    name: 'Enterprise',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Case Study'
    }
  },
  '0648': {
    code: '0648',
    name: 'Food & Nutrition',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Theory',
      2: 'Paper 2: Practical Test'
    }
  },
  '0413': {
    code: '0413',
    name: 'Physical Education',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0995',
    papers: {
      1: 'Paper 1: Theory'
    }
  },
  '0400': {
    code: '0400',
    name: 'Art & Design',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0989',
    papers: {
      1: 'Paper 1: Coursework',
      2: 'Paper 2: Externally Set Assignment'
    }
  },
  '0410': {
    code: '0410',
    name: 'Music',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0978',
    hasAudio: true,
    papers: {
      1: 'Paper 1: Listening'
    }
  },
  '0411': {
    code: '0411',
    name: 'Drama',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    alt91: '0994',
    papers: {
      1: 'Paper 1: Written Examination'
    }
  },
  '0490': {
    code: '0490',
    name: 'Religious Studies',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Beliefs & Practices',
      2: 'Paper 2: Religious Themes'
    }
  },
  '0600': {
    code: '0600',
    name: 'Agriculture',
    spec: 'CIE-IGCSE',
    curriculum: 'Cambridge IGCSE',
    papers: {
      1: 'Paper 1: Theory'
    }
  },

  // ─── Cambridge O Level (1xxx–7xxx, strictly international) ───────────────────────
  '4024': {
    code: '4024',
    name: 'Mathematics D',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Non-Calculator',
      2: 'Paper 2: Calculator'
    }
  },
  '4037': {
    code: '4037',
    name: 'Additional Mathematics',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    sharedIgcseCode: '0606',
    papers: {
      1: 'Paper 1',
      2: 'Paper 2'
    }
  },
  '5054': {
    code: '5054',
    name: 'Physics',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Theory',
      3: 'Paper 3: Practical Test',
      4: 'Paper 4: Alternative to Practical'
    }
  },
  '5070': {
    code: '5070',
    name: 'Chemistry',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Theory',
      3: 'Paper 3: Practical Test',
      4: 'Paper 4: Alternative to Practical'
    }
  },
  '5090': {
    code: '5090',
    name: 'Biology',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Theory',
      3: 'Paper 3: Practical Test',
      4: 'Paper 4: Alternative to Practical'
    }
  },
  '5129': {
    code: '5129',
    name: 'Combined Science',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Theory'
    }
  },
  '1123': {
    code: '1123',
    name: 'English Language',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Reading',
      2: 'Paper 2: Writing'
    }
  },
  '2010': {
    code: '2010',
    name: 'Literature in English',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Poetry & Prose',
      2: 'Paper 2: Drama'
    }
  },
  '2210': {
    code: '2210',
    name: 'Computer Science',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    legacyCodes: ['7010'],
    sharedIgcseCode: '0478',
    papers: {
      1: 'Paper 1: Computer Systems',
      2: 'Paper 2: Algorithms, Programming & Logic'
    }
  },
  '2281': {
    code: '2281',
    name: 'Economics',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    sharedIgcseCode: '0455',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Structured Questions'
    }
  },
  '7115': {
    code: '7115',
    name: 'Business Studies',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    sharedIgcseCode: '0450',
    papers: {
      1: 'Paper 1: Short Answer & Data Response',
      2: 'Paper 2: Case Study'
    }
  },
  '7707': {
    code: '7707',
    name: 'Accounting',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    legacyCodes: ['7110'],
    sharedIgcseCode: '0452',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Structured Written Paper'
    }
  },
  '7100': {
    code: '7100',
    name: 'Commerce',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Multiple Choice',
      2: 'Paper 2: Written'
    }
  },
  '2058': {
    code: '2058',
    name: 'Islamiyat',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: "Paper 1: Major Themes of the Qur'an & History",
      2: 'Paper 2: Hadith, Caliphate & Articles of Faith'
    }
  },
  '2059': {
    code: '2059',
    name: 'Pakistan Studies',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: History & Culture of Pakistan',
      2: 'Paper 2: Environment of Pakistan'
    }
  },
  '7094': {
    code: '7094',
    name: 'Bangladesh Studies',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: History & Culture of Bangladesh',
      2: 'Paper 2: Environment & Development of Bangladesh'
    }
  },
  '3204': {
    code: '3204',
    name: 'Bengali',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Composition',
      2: 'Paper 2: Language Usage & Comprehension'
    }
  },
  '3247': {
    code: '3247',
    name: 'First Language Urdu',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Reading & Writing',
      2: 'Paper 2: Texts'
    }
  },
  '3248': {
    code: '3248',
    name: 'Second Language Urdu',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Composition & Translation',
      2: 'Paper 2: Language Usage, Summary & Comprehension'
    }
  },
  '2217': {
    code: '2217',
    name: 'Geography',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Geographical Themes',
      2: 'Paper 2: Geographical Skills',
      3: 'Paper 3: Geographical Investigations'
    }
  },
  '2147': {
    code: '2147',
    name: 'History',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Structured Questions',
      2: 'Paper 2: Document Questions'
    }
  },
  '2251': {
    code: '2251',
    name: 'Sociology',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Research Methods, Identity & Inequality',
      2: 'Paper 2: Family, Education & Crime'
    }
  },
  '5014': {
    code: '5014',
    name: 'Environmental Management',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Theory',
      2: 'Paper 2: Management in Context'
    }
  },
  '2068': {
    code: '2068',
    name: 'Islamic Studies',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: History & Scriptures',
      2: 'Paper 2: Development, Sources, Beliefs & Observances'
    }
  },
  '2069': {
    code: '2069',
    name: 'Global Perspectives',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Written Examination'
    }
  },
  '7096': {
    code: '7096',
    name: 'Travel & Tourism',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Key Terms & Concepts',
      2: 'Paper 2: Managing & Marketing Destinations'
    }
  },
  '3180': {
    code: '3180',
    name: 'Arabic',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Composition',
      2: 'Paper 2: Translation & Reading Comprehension'
    }
  },
  '3015': {
    code: '3015',
    name: 'French',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Translation & Composition',
      2: 'Paper 2: Reading Comprehension'
    }
  },
  '3226': {
    code: '3226',
    name: 'Tamil',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Composition',
      2: 'Paper 2: Translation & Reading Comprehension'
    }
  },
  '3205': {
    code: '3205',
    name: 'Sinhala',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Composition',
      2: 'Paper 2: Translation & Reading Comprehension'
    }
  },
  '4040': {
    code: '4040',
    name: 'Statistics',
    spec: 'CIE-OL',
    curriculum: 'Cambridge O Level',
    papers: {
      1: 'Paper 1: Written Paper 1',
      2: 'Paper 2: Written Paper 2'
    }
  }
};

// Map Cambridge IGCSE (9-1) codes -> Primary A*-G canonical syllabus code (identical exam papers)
export const CAMBRIDGE_9_1_TO_PRIMARY = {};
export const CAMBRIDGE_PRIMARY_TO_9_1 = {};
// Map replaced legacy codes -> current canonical syllabus code
export const CAMBRIDGE_LEGACY_TO_PRIMARY = {};
// Set of every known 4-digit Cambridge syllabus code (primary + 9-1 + legacy)
export const CAMBRIDGE_ALL_CODES = new Set();

for (const entry of Object.values(CAMBRIDGE_SYLLABUSES)) {
  CAMBRIDGE_ALL_CODES.add(entry.code);
  if (entry.alt91) {
    CAMBRIDGE_9_1_TO_PRIMARY[entry.alt91] = entry.code;
    CAMBRIDGE_PRIMARY_TO_9_1[entry.code] = entry.alt91;
    CAMBRIDGE_ALL_CODES.add(entry.alt91);
  }
  if (Array.isArray(entry.legacyCodes)) {
    for (const lc of entry.legacyCodes) {
      CAMBRIDGE_LEGACY_TO_PRIMARY[lc] = entry.code;
      CAMBRIDGE_ALL_CODES.add(lc);
    }
  }
}

export function resolveCambridgeSyllabus(rawCode) {
  const clean = String(rawCode || '').trim();
  if (!/^\d{4}$/.test(clean)) return null;
  if (CAMBRIDGE_SYLLABUSES[clean]) return CAMBRIDGE_SYLLABUSES[clean];
  const primary91 = CAMBRIDGE_9_1_TO_PRIMARY[clean];
  if (primary91 && CAMBRIDGE_SYLLABUSES[primary91]) return CAMBRIDGE_SYLLABUSES[primary91];
  const primaryLegacy = CAMBRIDGE_LEGACY_TO_PRIMARY[clean];
  if (primaryLegacy && CAMBRIDGE_SYLLABUSES[primaryLegacy]) return CAMBRIDGE_SYLLABUSES[primaryLegacy];
  return null;
}

export function formatCambridgeSubjectName(entry) {
  if (!entry) return '';
  return `${entry.name} (${entry.code})`;
}

export function extractSyllabusCodeFromSubject(subject = '') {
  const m = String(subject || '').match(/\((\d{4})\)\s*$/);
  return m ? m[1] : '';
}

export function getCambridgeSubjectAliases(code) {
  const entry = resolveCambridgeSyllabus(code);
  if (!entry) return [];
  const codes = [entry.code];
  if (entry.alt91) codes.push(entry.alt91);
  if (Array.isArray(entry.legacyCodes)) codes.push(...entry.legacyCodes);
  return codes;
}

export function getCambridgeLegacyNote(code) {
  const entry = resolveCambridgeSyllabus(code);
  if (!entry) return '';
  const parts = [];
  if (entry.alt91) parts.push(`9–1 equivalent code: ${entry.alt91}`);
  if (entry.legacyCodes?.length) parts.push(`Legacy code: ${entry.legacyCodes.join(', ')}`);
  if (entry.sharedOlCode) parts.push(`Shared O Level syllabus: ${entry.sharedOlCode}`);
  if (entry.sharedIgcseCode) parts.push(`Shared IGCSE syllabus: ${entry.sharedIgcseCode}`);
  return parts.join(' · ');
}
