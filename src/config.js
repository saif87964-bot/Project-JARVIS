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

export const CASH_CATS = [
  { id: 'food',      label: 'FOOD'      },
  { id: 'transport', label: 'TRANSPORT' },
  { id: 'fuel',      label: 'FUEL'      },
  { id: 'business',  label: 'BUSINESS'  },
  { id: 'shopping',  label: 'SHOPPING'  },
  { id: 'utilities', label: 'UTILITIES' },
  { id: 'misc',      label: 'MISC'      },
];
