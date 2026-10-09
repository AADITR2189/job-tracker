/* ════════════════════════════════════════════════════════════════════
   Data compatibility layer
   ────────────────────────────────────────────────────────────────────
   Guarantees for live data:
   • The storage key ('jt_v2') and the JSON schema are NOT changed.
   • jtNormalize() only ADDS missing top-level containers (e.g. a backup
     from an early version without "upcomingJobs"). It never renames,
     removes or rewrites existing fields or records, so unknown/future
     fields are preserved.
   • Imports are validated and summarised before anything is replaced,
     and a safety copy of the current data is kept so an import can be
     undone (Settings → Undo last import).
   • Export output is byte-for-byte the same shape as v1, so older
     versions of the app can still read new backups.
   ════════════════════════════════════════════════════════════════════ */

const JT_STORAGE_KEY = 'jt_v2';                       // unchanged since v1
const JT_PRE_IMPORT_KEY = 'jt_v2_pre_import';         // safety copy before an import
const JT_PRE_IMPORT_META_KEY = 'jt_v2_pre_import_meta';
const JT_LAST_EXPORT_KEY = 'jt_last_export';          // ISO date of last JSON backup
const JT_KNOWN_STATUSES = ['not planned','planned','ongoing','hold','complete','cancelled','rework planned','rework ongoing','rework completed'];
const JT_KNOWN_PRIORITIES = ['top urgent','urgent','medium','low'];

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Make a parsed data object safe for the app to use, without altering any
 * existing values. Mutates and returns the same object so every unknown
 * key/field is kept exactly as it was.
 */
function jtNormalize(d) {
  if(!isPlainObject(d)) d = {};
  ['jobs','persons','upcomingJobs','holidays','workingDays'].forEach(k => {
    if(!Array.isArray(d[k])) d[k] = [];
  });
  ['personHolidays','compensationWorkingDays'].forEach(k => {
    if(!isPlainObject(d[k])) d[k] = {};
  });
  // Drop only entries that are not objects at all (they would crash rendering).
  ['jobs','persons','upcomingJobs'].forEach(k => {
    if(d[k].some(x => !isPlainObject(x))) d[k] = d[k].filter(isPlainObject);
  });
  return d;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Inspect a parsed backup. Returns { ok, errors[], warnings[], summary }.
 * Only a missing/invalid "jobs" array is fatal — exactly the rule v1 used —
 * so every backup that restored before still restores now.
 */
function jtValidateBackup(d) {
  const errors = [], warnings = [];
  if(!isPlainObject(d)) {
    errors.push('The file does not contain a Job Tracker backup object.');
    return { ok:false, errors, warnings, summary:null };
  }
  if(!d.jobs || !Array.isArray(d.jobs)) errors.push('Invalid format - missing jobs array');

  const jobs = Array.isArray(d.jobs) ? d.jobs : [];
  const persons = Array.isArray(d.persons) ? d.persons : [];
  const upcoming = Array.isArray(d.upcomingJobs) ? d.upcomingJobs : [];

  if(d.persons !== undefined && !Array.isArray(d.persons)) warnings.push('"persons" is not a list and will be treated as empty.');
  if(d.upcomingJobs !== undefined && !Array.isArray(d.upcomingJobs)) warnings.push('"upcomingJobs" is not a list and will be treated as empty.');

  const nonObj = jobs.filter(j => !isPlainObject(j)).length;
  if(nonObj) warnings.push(`${nonObj} job entr${nonObj>1?'ies are':'y is'} not valid records.`);
  const objJobs = jobs.filter(isPlainObject);
  const noId = objJobs.filter(j => j.id === undefined || j.id === null).length;
  if(noId) warnings.push(`${noId} job${noId>1?'s have':' has'} no id.`);
  const ids = objJobs.map(j => j.id).filter(v => v !== undefined && v !== null);
  const dup = ids.length - new Set(ids).size;
  if(dup) warnings.push(`${dup} duplicate job id${dup>1?'s':''} found.`);
  const unknownStatus = objJobs.filter(j => j.status && !JT_KNOWN_STATUSES.includes(j.status)).length;
  if(unknownStatus) warnings.push(`${unknownStatus} job${unknownStatus>1?'s have':' has'} an unrecognised status (kept as-is).`);
  const badDates = objJobs.filter(j => ['receiptDate','targetDate','plannedStartDate','startDate','completionDate']
    .some(f => j[f] && (typeof j[f] !== 'string' || !DATE_RE.test(j[f])))).length;
  if(badDates) warnings.push(`${badDates} job${badDates>1?'s have':' has'} dates in an unexpected format (kept as-is).`);
  const noVessel = objJobs.filter(j => typeof j.vesselName !== 'string').length;
  if(noVessel) warnings.push(`${noVessel} job${noVessel>1?'s have':' has'} no vessel name.`);

  const summary = {
    jobs: jobs.length,
    persons: persons.length,
    upcoming: upcoming.length,
    holidays: Array.isArray(d.holidays) ? d.holidays.length : 0,
    workingDays: Array.isArray(d.workingDays) ? d.workingDays.length : 0,
    personLeaveDays: isPlainObject(d.personHolidays) ? Object.values(d.personHolidays).reduce((s,a)=>s+(Array.isArray(a)?a.length:0),0) : 0,
    exportDate: typeof d.exportDate === 'string' ? d.exportDate : null,
    // Rough version hint, for the summary only (never written anywhere)
    era: objJobs.some(j => 'invoiceType' in j || 'estimatedManhours' in j) ? 'with reports data'
       : objJobs.some(j => 'sharedJobDetails' in j) ? 'with sharing data' : 'early format'
  };
  return { ok: errors.length === 0, errors, warnings, summary };
}

/** Strip a UTF-8 byte-order mark that some editors add (it breaks JSON.parse). */
function jtStripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/** Keep a copy of the current data before an import replaces it. */
function jtSnapshotBeforeImport(currentData, sourceName) {
  try {
    localStorage.setItem(JT_PRE_IMPORT_KEY, JSON.stringify(currentData));
    localStorage.setItem(JT_PRE_IMPORT_META_KEY, JSON.stringify({
      at: new Date().toISOString(),
      file: sourceName || '',
      jobs: (currentData.jobs||[]).length,
      persons: (currentData.persons||[]).length
    }));
    return true;
  } catch(e) {
    console.warn('Could not keep a safety copy before import', e);
    try { localStorage.removeItem(JT_PRE_IMPORT_KEY); localStorage.removeItem(JT_PRE_IMPORT_META_KEY); } catch(_) {}
    return false;
  }
}

function jtGetPreImportMeta() {
  try {
    const m = localStorage.getItem(JT_PRE_IMPORT_META_KEY);
    return m && localStorage.getItem(JT_PRE_IMPORT_KEY) ? JSON.parse(m) : null;
  } catch(e) { return null; }
}

function jtReadPreImport() {
  try {
    const raw = localStorage.getItem(JT_PRE_IMPORT_KEY);
    return raw ? jtNormalize(JSON.parse(raw)) : null;
  } catch(e) { return null; }
}

function jtClearPreImport() {
  try { localStorage.removeItem(JT_PRE_IMPORT_KEY); localStorage.removeItem(JT_PRE_IMPORT_META_KEY); } catch(e) {}
}

/** If stored data is unreadable, keep the raw text so nothing is lost. */
function jtPreserveCorrupt(raw) {
  try {
    const key = 'jt_v2_unreadable_' + new Date().toISOString().replace(/[:.]/g,'-');
    localStorage.setItem(key, raw);
    return key;
  } catch(e) { return null; }
}

function jtMarkExported() {
  try { localStorage.setItem(JT_LAST_EXPORT_KEY, new Date().toISOString()); } catch(e) {}
}
function jtLastExport() {
  try { return localStorage.getItem(JT_LAST_EXPORT_KEY); } catch(e) { return null; }
}
