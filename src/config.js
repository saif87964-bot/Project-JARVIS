// ── JARVIS — src/config.js ─────────────────────────────────────
// All shared constants. Import from here — never duplicate values.

export const STORAGE_KEYS = {
  TASKS:  'jv_tasks',
  EVENTS: 'jv_events',
  CASH:   'jv_petty_cash',
};

export const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

export const RSS_SOURCES = {
  tz:   { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', label: 'BBC Africa'   },
  tech: { url: 'https://techcrunch.com/feed/',                        label: 'TechCrunch'   },
  biz:  { url: 'https://www.theguardian.com/business/rss',            label: 'The Guardian' },
};

export const TAG_CLASS = { tz: 'tag-tz', biz: 'tag-biz', tech: 'tag-tech' };
export const TAG_LABEL = { tz: 'TZ',     biz: 'BIZ',     tech: 'TECH'     };

export const FALLBACK_NEWS = [
  { tag: 'tz',   h: 'TRA announces updated EFD compliance requirements for Q3 2026',    t: 'The Citizen'      },
  { tag: 'biz',  h: 'Tanzania shilling stabilises at 2,640 against USD',                t: 'Bloomberg Africa' },
  { tag: 'tech', h: 'Anthropic releases Claude 4.6 with expanded agentic capabilities', t: 'TechCrunch'       },
  { tag: 'tz',   h: 'Dar es Salaam port throughput hits record high in April 2026',     t: 'Daily News'       },
  { tag: 'biz',  h: 'East Africa manufacturing sector reports 8.2% growth in Q1 2026', t: 'Reuters Africa'   },
];

// ── Tanzania tax constants (TRA 2024/25) ──────────────────────
export const TZ_TAX = {
  VAT_RATE:      0.18,   // 18% standard rate
  NSSF_EMPLOYEE: 0.10,   // 10% employee contribution
  NSSF_EMPLOYER: 0.10,   // 10% employer contribution
  SDL_RATE:      0.045,  // 4.5% Skills Development Levy (employer)
  WCF_RATE:      0.005,  // 0.5% Workers Compensation Fund (employer)
  // Monthly PAYE brackets — marginal rates
  PAYE_BRACKETS: [
    { min: 0,        max: 270000,   rate: 0,    base: 0      },
    { min: 270000,   max: 520000,   rate: 0.09, base: 0      },
    { min: 520000,   max: 760000,   rate: 0.20, base: 22500  },
    { min: 760000,   max: 1000000,  rate: 0.25, base: 70500  },
    { min: 1000000,  max: Infinity, rate: 0.30, base: 130500 },
  ],
};

// Currencies shown in live rates + converter
export const CURRENCIES = ['USD', 'TZS', 'EUR', 'GBP', 'KES', 'AED', 'ZAR'];

// Live rate display pairs (all → TZS)
export const RATE_PAIRS = [
  { from: 'USD', label: 'USD / TZS' },
  { from: 'EUR', label: 'EUR / TZS' },
  { from: 'GBP', label: 'GBP / TZS' },
  { from: 'KES', label: 'KES / TZS' },
  { from: 'AED', label: 'AED / TZS' },
  { from: 'ZAR', label: 'ZAR / TZS' },
];

export const CASH_CATS = [
  { id: 'food',      label: 'FOOD'      },
  { id: 'transport', label: 'TRANSPORT' },
  { id: 'fuel',      label: 'FUEL'      },
  { id: 'business',  label: 'BUSINESS'  },
  { id: 'shopping',  label: 'SHOPPING'  },
  { id: 'utilities', label: 'UTILITIES' },
  { id: 'misc',      label: 'MISC'      },
];
