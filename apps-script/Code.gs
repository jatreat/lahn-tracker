/**
 * Lahn Election Day Tracker — Google Sheet backend.
 *
 * Setup (about 5 minutes):
 * 1. Create a new Google Sheet and put its id in SHEET_ID below. Create a script at
 *    script.google.com (or Extensions > Apps Script in the Sheet) and paste this file over Code.gs.
 * 2. Project Settings (gear) > Script Properties > Add property:
 *      TRACKER_KEY = <the team passcode you will give the field team>
 * 3. Deploy > New deployment > type "Web app".
 *      Execute as: Me.   Who has access: Anyone.
 *    Authorize when asked. Copy the Web app URL (ends in /exec).
 * 4. Put that URL in config.js on the GitHub site (sheetUrl).
 * After editing this script later, use Deploy > Manage deployments > Edit > New version,
 * so the /exec URL stays the same.
 *
 * Each tab (crossover, counties, turnout, chase, incidents) gets its own sheet.
 * Rows can be read and edited by hand in the Sheet; keep the "id" column intact.
 */

// The Google Sheet this script stores data in (the long id in the Sheet's URL).
// Leave empty only if this script was opened from the Sheet via Extensions > Apps Script.
var SHEET_ID = '1q0ZN93MrvtRSmKIk86gYVdRMLSK0kJ_DFw5lV1Dx0BI';

var KINDS = ['crossover', 'counties', 'turnout', 'chase', 'incidents', 'source'];
var MAX_FIELD = 40000; // 'source' rows carry Claude's absentee data as JSON text

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var key = PropertiesService.getScriptProperties().getProperty('TRACKER_KEY');
    if (!key) throw new Error('backend_not_configured');
    if (String(body.key || '') !== key) throw new Error('bad_passcode');
    var a = body.action;
    if (a === 'ping') out = { ok: true };
    else if (a === 'all') out = { ok: true, data: readAll_() };
    else if (a === 'save' || a === 'patch' || a === 'delete') out = withLock_(function () { return write_(a, body); });
    else throw new Error('unknown_action');
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'lahn-tracker' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_(kind) {
  if (KINDS.indexOf(kind) < 0) throw new Error('unknown_kind');
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(kind);
  if (!sh) {
    sh = ss.insertSheet(kind);
    sh.getRange(1, 1, 1, 2).setValues([['id', 'at']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function headers_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function clean_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  // Leading apostrophe stores the value as plain text: Sheets won't turn "10:00"
  // into a time or run a typed-in formula. getValues() returns it without the apostrophe.
  return "'" + String(v).slice(0, MAX_FIELD);
}

function write_(action, body) {
  var sh = sheet_(body.kind);
  var head = headers_(sh);
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var id = String(body.id || '');
  var idx = id ? ids.indexOf(id) : -1;

  if (action === 'delete') {
    if (idx >= 0) sh.deleteRow(idx + 2);
    return { ok: true };
  }

  var row = body.row || {};
  if (action === 'patch' && idx < 0) throw new Error('not_found');
  if (!id) id = Utilities.getUuid().slice(0, 12);

  // grow header with any new fields
  var keys = Object.keys(row).filter(function (k) { return /^[A-Za-z0-9_]{1,40}$/.test(k) && k !== 'id'; });
  var added = keys.filter(function (k) { return head.indexOf(k) < 0; });
  if (added.length) {
    sh.getRange(1, head.length + 1, 1, added.length).setValues([added]);
    head = head.concat(added);
  }

  var values;
  if (idx >= 0) {
    values = sh.getRange(idx + 2, 1, 1, head.length).getValues()[0];
    if (action === 'save') values = head.map(function () { return ''; });
  } else {
    values = head.map(function () { return ''; });
  }
  values[0] = "'" + id;
  keys.forEach(function (k) { values[head.indexOf(k)] = clean_(row[k]); });

  if (idx >= 0) sh.getRange(idx + 2, 1, 1, head.length).setValues([values]);
  else sh.appendRow(values);
  return { ok: true, id: id };
}

function readAll_() {
  var out = {};
  KINDS.forEach(function (kind) {
    var sh = sheet_(kind);
    var n = sh.getLastRow();
    if (n < 2) { out[kind] = []; return; }
    var vals = sh.getRange(1, 1, n, sh.getLastColumn()).getValues();
    var head = vals[0].map(String);
    out[kind] = vals.slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
      var o = {};
      head.forEach(function (h, i) {
        var v = r[i];
        if (v === '') v = null;
        else if (v instanceof Date) v = v.getTime();
        else if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
        o[h] = v;
      });
      o.id = String(o.id);
      return o;
    });
  });
  return out;
}
