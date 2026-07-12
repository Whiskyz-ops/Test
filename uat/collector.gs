/**
 * WISING UAT analytics collector — Google Apps Script.
 *
 * Receives the events posted by monitor-next/lib/analytics.js and appends each
 * one as a row in the bound Google Sheet. Free, no account beyond Google, no
 * server to run. Deploy steps: see uat/collector-setup.md.
 *
 * The app posts via navigator.sendBeacon (fire-and-forget), so responses aren't
 * read by the client — we just need a 200 and a durable append.
 */

var SHEET_NAME = 'events';
var HEADERS = ['received_at', 'event_time', 'participant', 'session', 'event', 'props', 'path'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    sheet_().appendRow([
      new Date(),
      data.t || '',
      data.pid || '',
      data.sid || '',
      data.event || '',
      JSON.stringify(data.props || {}),
      data.path || ''
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// A GET is handy for a quick "is it live?" check in the browser.
function doGet() {
  return json_({ ok: true, service: 'WISING UAT collector', post: 'send events here' });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
