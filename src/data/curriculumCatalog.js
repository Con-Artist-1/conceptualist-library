// Static curriculum catalog tables, spec codes, unit labels, and textbook coverage.

export const SITE_URL = 'https://www.conceptualist.uk';

export const SUBJECTS_WITH_BOOKS_MAP = {
  'Edexcel IAL': new Set([
    'Accounting', 'Biology', 'Business', 'Chemistry', 'Economics',
    'Information Technology', 'Math', 'Physics', 'Psychology'
  ]),
  'Edexcel IGCSE': new Set([
    'Accounting', 'Biology', 'Business', 'Chemistry', 'Commerce',
    'Economics', 'Further Pure Mathematics', 'Human Biology',
    'Information Technology', 'Mathematics A', 'Physics'
  ]),
  'Cambridge AS & A Level': new Set([
    'Accounting (9706)', 'Biology (9700)', 'Business (9609)', 'Chemistry (9701)',
    'Computer Science (9618)', 'Economics (9708)', 'Further Mathematics (9231)',
    'Geography (9696)', 'Mathematics (9709)', 'Physics (9702)'
  ]),
  'Cambridge IGCSE': new Set([
    'Biology (0610)', 'Business Studies (0450)', 'Chemistry (0620)',
    'Computer Science (0478)', 'Economics (0455)',
    'English as a Second Language (0510)',
    'English as a Second Language (Count-in Speaking) (0511)',
    'First Language English (0500)', 'French (0520)', 'Geography (0460)',
    'German (0525)', 'History (0470)', 'ICT (0417)',
    'International Mathematics (0607)', 'Mathematics (0580)',
    'Physics (0625)', 'Spanish (0530)'
  ]),
  'Cambridge O Level': new Set([
    'Additional Mathematics (4037)', 'Biology (5090)',
    'First Language Urdu (3247)', 'Islamiyat (2058)', 'Pakistan Studies (2059)'
  ])
};

export const LEGACY_IAL_UNIT_CODES = new Set([
  'WBI01', 'WBI02', 'WBI03', 'WBI04', 'WBI05', 'WBI06',
  'WCH01', 'WCH02', 'WCH03', 'WCH04', 'WCH05', 'WCH06', 'WCH07',
  'WPH01', 'WPH02', 'WPH03', 'WPH04', 'WPH05', 'WPH06', 'WPH07',
  'WBS01', 'WBS02', 'WBS03', 'WBS04',
  'WEC01', 'WEC02', 'WEC03', 'WEC04',
  '6ECA1', '6ECA2', '6ECA3',
  'WMA01', 'WMA02', '6663', '6664', '6665', '6666'
]);

export const IGCSE_MODULAR_CODES = {
  'Accounting': '4WAC1',
  'Biology': '4WBI1',
  'Chemistry': '4WCH1',
  'Commerce': '4WCM1',
  'Economics': '4WEC1',
  'English as a Second Language': '4WES1',
  'English Language A': '4WEA1',
  'English Literature': '4WET1',
  'Geography': '4WGE1',
  'History': '4WHI1',
  'Mathematics A': '4WM1H',
  'Physics': '4WPH1',
  'Religious Studies': '4WRS1',
  'Sciences (Double Award)': '4WSD1'
};

export const LEGACY_UNIT_EQUIVALENTS = {
  WMA11: 'WMA01 (C12), 6663 (C1)',
  WMA12: 'WMA01 (C12), 6664 (C2)',
  WMA13: 'WMA02 (C34), 6665 (C3)',
  WMA14: 'WMA02 (C34), 6666 (C4)',
  WFM01: '6667 (FP1)',
  WFM02: '6668 (FP2)',
  WFM03: '6669 (FP3)',
  WME01: '6677 (M1)',
  WME02: '6678 (M2)',
  WME03: '6679 (M3)',
  WST01: '6683 (S1)',
  WST02: '6684 (S2)',
  WST03: '6685 (S3)',
  WDM11: 'WDM01, 6689 (D1)',
  WBI11: 'WBI01, 6BI01',
  WBI12: 'WBI02, 6BI02',
  WBI13: 'WBI03, 6BI03',
  WBI14: 'WBI04, 6BI04',
  WBI15: 'WBI05, 6BI05',
  WBI16: 'WBI06, 6BI06',
  WCH11: 'WCH01, 6CH01',
  WCH12: 'WCH02, 6CH02',
  WCH13: 'WCH03, 6CH03',
  WCH14: 'WCH04, 6CH04',
  WCH15: 'WCH05, 6CH05',
  WCH16: 'WCH06, 6CH06',
  WPH11: 'WPH01, 6PH01',
  WPH12: 'WPH02, 6PH02',
  WPH13: 'WPH03, WPH07, 6PH03',
  WPH14: 'WPH04, 6PH04',
  WPH15: 'WPH05, 6PH05',
  WPH16: 'WPH06, 6PH06',
  WAC11: 'WAC01',
  WAC12: 'WAC02',
  WBS11: 'WBS01',
  WBS12: 'WBS02',
  WBS13: 'WBS03',
  WBS14: 'WBS04',
  WEC11: 'WEC01',
  WEC12: 'WEC02',
  WEC13: 'WEC03',
  WEC14: 'WEC04'
};

export const SUBJECT_LEGACY_SPEC_CODES = {
  'Edexcel IAL': {
    'Accounting': 'XAC11 / YAC11 (Legacy XAC01)',
    'Biology': 'XBI11 / YBI11 (Legacy WBI01–WBI06)',
    'Business': 'XBS11 / YBS11 (Legacy WBS01–WBS04)',
    'Chemistry': 'XCH11 / YCH11 (Legacy WCH01–WCH06)',
    'Economics': 'XEC11 / YEC11 (Legacy WEC01–WEC04)',
    'Information Technology': 'XIT11 / YIT11',
    'Math': 'XMA01 / XFM01 / YMA01 (Legacy C1–C4, C12, C34)',
    'Physics': 'XPH11 / YPH11 (Legacy WPH01–WPH07, 6PH01–6PH06)',
    'Psychology': 'XPS01 / YPS01'
  },
  'Edexcel IGCSE': {
    'Accounting': '4AC1 / Modular 4WAC1 (Legacy 4AC0)',
    'Arabic': '4AA1 (Legacy 4AR0, 4308)',
    'Art and Design': '4FA1 (Legacy 4FA0)',
    'Bangla': '4BA0 (Legacy 4BE0)',
    'Bangladesh Studies': '4BN1 (Legacy 4BN0)',
    'Biology': '4BI1 / Modular 4WBI1 (Legacy 4BI0)',
    'Business': '4BS1 (Legacy 4BS0)',
    'Chemistry': '4CH1 / Modular 4WCH1 (Legacy 4CH0)',
    'Chinese': '4CN1 (Legacy 4CN0)',
    'Commerce': '4CM1 / Modular 4WCM1 (Legacy 4CM0)',
    'Economics': '4EC1 / Modular 4WEC1 (Legacy 4EC0)',
    'English as a Second Language': '4ES1 / Modular 4WES1 (Legacy 4ES0, 4357)',
    'English Language A': '4EA1 / Modular 4WEA1 (Legacy 4EA0)',
    'English Language B': '4EB1 (Legacy 4EB0)',
    'English Literature': '4ET1 / Modular 4WET1 (Legacy 4ET0)',
    'French': '4FR1 (Legacy 4FR0)',
    'Further Pure Mathematics': '4PM1 (Legacy 4PM0)',
    'Geography': '4GE1 / Modular 4WGE1 (Legacy 4GE0)',
    'German': '4GN1 (Legacy 4GN0)',
    'Global Citizenship': '4GL1',
    'Greek (First Language)': '4GK1',
    'Gujarati': '4GU0',
    'Hindi': '4HN0',
    'History': '4HI1 / Modular 4WHI1 (Legacy 4HI0)',
    'Human Biology': '4HB1 (Legacy 4HB0, 7042)',
    'Islamic Studies': '4IS1',
    'Islamiyat': '4IS0',
    'Mathematics A': '4MA1 / Modular 4WM1H (Legacy 4MA0, 4400)',
    'Mathematics B': '4MB1 (Legacy 4MB0)',
    'Modern Greek': '4MG0',
    'Pakistan Studies': '4PA1',
    'Physics': '4PH1 / Modular 4WPH1 (Legacy 4PH0)',
    'Religious Studies': '4RS1 / Modular 4WRS1 (Legacy 4RS0)',
    'Sciences (Double Award)': '4SD0 / Modular 4WSD1 (Legacy 4SC0)',
    'Sciences (Single Award)': '4SS0',
    'Sinhala': '4SI0',
    'Spanish': '4SP1 (Legacy 4SP0)',
    'Swahili': '4SW1 (Legacy 4SW0)',
    'Tamil': '4TA0',
    'Turkish': '4TU0',
    'Urdu': '4UR0'
  }
};

export const IGCSE_SPEC_CODES = {
  'Accounting': '4AC1 / 4WAC1',
  'Arabic': '4AA1',
  'Art and Design': '4FA1',
  'Bangla': '4BA0 / 4BE0',
  'Bangladesh Studies': '4BN1',
  'Biology': '4BI1 / 4WBI1',
  'Business': '4BS1',
  'Chemistry': '4CH1 / 4WCH1',
  'Chinese': '4CN1',
  'Commerce': '4CM1 / 4WCM1',
  'Computer Science': '4CP0',
  'Economics': '4EC1 / 4WEC1',
  'English as a Second Language': '4ES1 / 4WES1',
  'English Language A': '4EA1 / 4WEA1',
  'English Language B': '4EB1',
  'English Literature': '4ET1 / 4WET1',
  'French': '4FR1',
  'Further Pure Mathematics': '4PM1',
  'Geography': '4GE1 / 4WGE1',
  'German': '4GN1',
  'Global Citizenship': '4GL1',
  'Greek (First Language)': '4GK1',
  'Gujarati': '4GU0',
  'Hindi': '4HN0',
  'History': '4HI1 / 4WHI1',
  'Human Biology': '4HB1',
  'Information Technology': '4IT1',
  'Islamic Studies': '4IS1',
  'Islamiyat': '4IS0',
  'Mathematics A': '4MA1 / 4WM1H',
  'Mathematics B': '4MB1',
  'Modern Greek': '4MG0',
  'Pakistan Studies': '4PA1',
  'Physics': '4PH1 / 4WPH1',
  'Religious Studies': '4RS1 / 4WRS1',
  'Sciences (Double Award)': '4SD0 / 4WSD1',
  'Sciences (Single Award)': '4SS0',
  'Sinhala': '4SI0',
  'Spanish': '4SP1',
  'Swahili': '4SW1',
  'Tamil': '4TA0',
  'Turkish': '4TU0',
  'Urdu': '4UR0'
};

export const IAL_MATH_UNIT_CODES = {
  'Pure Mathematics 1 (P1)': 'WMA11',
  'Pure Mathematics 2 (P2)': 'WMA12',
  'Pure Mathematics 3 (P3)': 'WMA13',
  'Pure Mathematics 4 (P4)': 'WMA14',
  'Core Mathematics 12 (C12)': 'WMA01',
  'Core Mathematics 34 (C34)': 'WMA02',
  'Core Mathematics 1 (C1)': '6663',
  'Core Mathematics 2 (C2)': '6664',
  'Core Mathematics 3 (C3)': '6665',
  'Core Mathematics 4 (C4)': '6666',
  'Further Pure 1 (FP1)': 'WFM01',
  'Further Pure 2 (FP2)': 'WFM02',
  'Further Pure 3 (FP3)': 'WFM03',
  'Mechanics 1 (M1)': 'WME01',
  'Mechanics 2 (M2)': 'WME02',
  'Mechanics 3 (M3)': 'WME03',
  'Statistics 1 (S1)': 'WST01',
  'Statistics 2 (S2)': 'WST02',
  'Statistics 3 (S3)': 'WST03',
  'Decision Mathematics 1 (D1)': 'WDM11'
};

export const IAL_SUBJECTS_DEFAULT = [
  'Accounting', 'Arabic', 'Biology', 'Business', 'Chemistry', 'Economics',
  'English Language', 'English Literature', 'French', 'Geography', 'German', 'Greek',
  'History', 'Information Technology', 'Law', 'Math', 'Physics', 'Psychology', 'Spanish'
];

export const IGCSE_SUBJECTS_DEFAULT = [
  'Accounting', 'Arabic', 'Art and Design', 'Bangla', 'Bangladesh Studies', 'Biology', 'Business', 'Chemistry',
  'Chinese', 'Commerce', 'Computer Science', 'Economics', 'English Language A', 'English Language B',
  'English Literature', 'English as a Second Language', 'French', 'Further Pure Mathematics', 'Geography',
  'German', 'Global Citizenship', 'Greek (First Language)', 'Gujarati', 'Hindi', 'History', 'Human Biology',
  'Information Technology', 'Islamic Studies', 'Islamiyat', 'Mathematics A', 'Mathematics B', 'Modern Greek',
  'Pakistan Studies', 'Physics', 'Religious Studies', 'Sciences (Double Award)', 'Sciences (Single Award)',
  'Sinhala', 'Spanish', 'Swahili', 'Tamil', 'Turkish', 'Urdu'
];

export const DEFAULT_UNIT_LABELS = {
  'Edexcel IAL': {
    'Accounting': [
      'Unit 1: The Accounting System & Costing (WAC11)',
      'Unit 2: Corporate & Management Accounting (WAC12)'
    ],
    'Biology': [
      'Unit 1: Lifestyle, Transport & Health (WBI11)',
      'Unit 2: Cells, Development & Biodiversity (WBI12)',
      'Unit 3: Practical Biology I (WBI13)',
      'Unit 4: Energy, Environment & Immunity (WBI14)',
      'Unit 5: Respiration & Muscles (WBI15)',
      'Unit 6: Practical Biology II (WBI16)',
      'Unit 1: Lifestyle, Transport, Genes & Health (WBI01)',
      'Unit 2: Development, Plants & the Environment (WBI02)',
      'Unit 3: Practical Biology & Research Skills (WBI03)',
      'Unit 4: The Natural Environment & Species Survival (WBI04)',
      'Unit 5: Energy, Exercise & Coordination (WBI05)',
      'Unit 6: Practical Biology & Investigative Skills (WBI06)'
    ],
    'Business': [
      'Unit 1: Marketing & People (WBS11)',
      'Unit 2: Managing Business Activities (WBS12)',
      'Unit 3: Business Decisions & Strategy (WBS13)',
      'Unit 4: Global Business (WBS14)',
      'Unit 1: Business Enterprise (WBS01)',
      'Unit 2: Business Structures & Processes (WBS02)',
      'Unit 3: Strategic Business Decisions (WBS03)',
      'Unit 4: Business in a Global Context (WBS04)'
    ],
    'Chemistry': [
      'Unit 1: Structure & Bonding (WCH11)',
      'Unit 2: Energetics & Organics (WCH12)',
      'Unit 3: Practical Chemistry I (WCH13)',
      'Unit 4: Rates & Organic Chemistry (WCH14)',
      'Unit 5: Transition Metals (WCH15)',
      'Unit 6: Practical Chemistry II (WCH16)',
      'Unit 1: The Core Principles of Chemistry (WCH01)',
      'Unit 2: Application of Core Principles of Chemistry (WCH02)',
      'Unit 3: Chemistry Laboratory Skills I (WCH03)',
      'Unit 4: General Principles of Chemistry I (WCH04)',
      'Unit 5: General Principles of Chemistry II (WCH05)',
      'Unit 6: Chemistry Laboratory Skills II (WCH06)',
      'Unit 7: Chemistry Practical Examination (WCH07)'
    ],
    'Economics': [
      'Unit 1: Markets in Action (WEC11)',
      'Unit 2: Macroeconomic Performance (WEC12)',
      'Unit 3: Business Behaviour (WEC13)',
      'Unit 4: A Global Perspective (WEC14)',
      'Unit 1: Markets in Action (WEC01)',
      'Unit 2: Macroeconomic Performance & Policy (WEC02)',
      'Unit 3: Business Behaviour (WEC03)',
      'Unit 4: Developments in the Global Economy (WEC04)',
      'Unit 1: Competitive Markets (6ECA1)',
      'Unit 2: Managing the Economy (6ECA2)',
      'Unit 3: Business Economics & Efficiency (6ECA3)'
    ],
    'Information Technology': [
      'IT Unit 1 (WIT11)',
      'IT Unit 2 (WIT12)',
      'IT Unit 3 (WIT13)',
      'IT Unit 4 (WIT14)'
    ],
    'Math': [
      'Pure Mathematics 1 (P1)',
      'Pure Mathematics 2 (P2)',
      'Pure Mathematics 3 (P3)',
      'Pure Mathematics 4 (P4)',
      'Mechanics 1 (M1)',
      'Mechanics 2 (M2)',
      'Mechanics 3 (M3)',
      'Statistics 1 (S1)',
      'Statistics 2 (S2)',
      'Statistics 3 (S3)',
      'Decision Mathematics 1 (D1)',
      'Further Pure 1 (FP1)',
      'Further Pure 2 (FP2)',
      'Further Pure 3 (FP3)',
      'Core Mathematics 12 (C12)',
      'Core Mathematics 34 (C34)',
      'Core Mathematics 1 (C1)',
      'Core Mathematics 2 (C2)',
      'Core Mathematics 3 (C3)',
      'Core Mathematics 4 (C4)'
    ],
    'Physics': [
      'Unit 1: Mechanics & Materials (WPH11)',
      'Unit 2: Waves & Electricity (WPH12)',
      'Unit 3: Practical Physics I (WPH13)',
      'Unit 4: Further Mechanics & Fields (WPH14)',
      'Unit 5: Thermodynamics & Oscillations (WPH15)',
      'Unit 6: Practical Physics II (WPH16)',
      'Unit 1: Physics on the Go (WPH01)',
      'Unit 2: Physics at Work (WPH02)',
      'Unit 3: Exploring Physics (WPH03)',
      'Unit 4: Physics on the Move (WPH04)',
      'Unit 5: Physics from Creation to Collapse (WPH05)',
      'Unit 6: Experimental Physics (WPH06)'
    ],
    'Psychology': [
      'Psychology Unit 1 (WPS01)',
      'Psychology Unit 2 (WPS02)',
      'Psychology Unit 3 (WPS03)',
      'Psychology Unit 4 (WPS04)'
    ],
    'Arabic': ['Arabic Unit 1 (WAA01)', 'Arabic Unit 2 (WAA02)'],
    'English Language': [
      'English Language Unit 1 (WEN01)',
      'English Language Unit 2 (WEN02)',
      'English Language Unit 3 (WEN03)',
      'English Language Unit 4 (WEN04)'
    ],
    'English Literature': [
      'English Literature Unit 1 (WET01)',
      'English Literature Unit 2 (WET02)',
      'English Literature Unit 3 (WET03)',
      'English Literature Unit 4 (WET04)'
    ],
    'French': [
      'French Unit 1 (WFR01)',
      'French Unit 2 (WFR02)',
      'French Unit 3 (WFR03)',
      'French Unit 4 (WFR04)'
    ],
    'Geography': [
      'Geography Unit 1 (WGE01)',
      'Geography Unit 2 (WGE02)',
      'Geography Unit 3 (WGE03)',
      'Geography Unit 4 (WGE04)'
    ],
    'German': [
      'German Unit 1 (WGN01)',
      'German Unit 2 (WGN02)',
      'German Unit 3 (WGN03)',
      'German Unit 4 (WGN04)'
    ],
    'Greek': ['Greek Unit 1 (WGK01)', 'Greek Unit 2 (WGK02)'],
    'History': [
      'History Unit 1 (WHI01)',
      'History Unit 2 (WHI02)',
      'History Unit 3 (WHI03)',
      'History Unit 4 (WHI04)'
    ],
    'Law': ['Law Paper 1 (YLA1)', 'Law Paper 2 (YLA2)'],
    'Spanish': [
      'Spanish Unit 1 (WSP01)',
      'Spanish Unit 2 (WSP02)',
      'Spanish Unit 3 (WSP03)',
      'Spanish Unit 4 (WSP04)'
    ]
  },
  'Edexcel IGCSE': {
    'Accounting': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Arabic': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Art and Design': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Bangla': ['Paper 1 (P1)'],
    'Bangladesh Studies': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Biology': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Business': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Chemistry': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Chinese': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)'],
    'Commerce': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Computer Science': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Economics': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'English as a Second Language': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)', 'Paper 4 (P4)'],
    'English Language A': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)'],
    'English Language B': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'English Literature': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)'],
    'French': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)'],
    'Further Pure Mathematics': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Geography': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'German': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)'],
    'Global Citizenship': ['Paper 1 (P1)'],
    'Greek (First Language)': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Gujarati': ['Paper 1 (P1)'],
    'Hindi': ['Paper 1 (P1)'],
    'History': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Human Biology': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Information Technology': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Islamic Studies': ['Paper 1 (P1)'],
    'Islamiyat': ['Paper 1 (P1)'],
    'Mathematics A': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Mathematics B': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Modern Greek': ['Paper 1 (P1)'],
    'Pakistan Studies': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Physics': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Religious Studies': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Sciences (Double Award)': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)', 'Paper 4 (P4)', 'Paper 5 (P5)', 'Paper 6 (P6)'],
    'Sciences (Single Award)': ['Paper 1 (P1)'],
    'Sinhala': ['Paper 1 (P1)'],
    'Spanish': ['Paper 1 (P1)', 'Paper 2 (P2)', 'Paper 3 (P3)'],
    'Swahili': ['Paper 1 (P1)', 'Paper 2 (P2)'],
    'Tamil': ['Paper 1 (P1)'],
    'Turkish': ['Paper 1 (P1)'],
    'Urdu': ['Paper 1 (P1)']
  }
};

export const MATH_CODE_PRIORITY = [
  'WMA11', 'WMA12', 'WMA13', 'WMA14',
  'WFM01', 'WFM02', 'WFM03',
  'WME01', 'WME02', 'WME03',
  'WST01', 'WST02', 'WST03',
  'WDM11', 'WMA01', 'WMA02',
  '6663', '6664', '6665', '6666'
];
