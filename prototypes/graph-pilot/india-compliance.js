"use strict";
/* A TRC only supports treaty relief for the period it certifies: one whose
 * validity dates (when entered on Layer 1 India) don't overlap this
 * financial year (April of base_tax_year to the next March) doesn't count
 * as on file. Blank dates keep the old behaviour (the upload/flag alone). */
function trcCoversYear(india, router) {
  var trc = (india && india.compliance_docs && india.compliance_docs.trc) || {};
  var fy = Number(router && router.base_tax_year) || 2026;
  var fyStart = fy + "-04-01", fyEnd = (fy + 1) + "-03-31";
  if (trc.validity_end_date && String(trc.validity_end_date) < fyStart) return false;
  if (trc.validity_start_date && String(trc.validity_start_date) > fyEnd) return false;
  return true;
}
function safe(obj, path, dflt) {
  var parts = path.split("."), cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return dflt; cur = cur[parts[i]]; }
  return cur === undefined || cur === null ? dflt : cur;
}
function trcOnFile(india, router) {
  var flag = safe(india, "dtaa.trc_status", false) === true || safe(india, "compliance_docs.trc.document_uploaded", false) === true;
  return flag && trcCoversYear(india, router);
}
module.exports = { trcCoversYear: trcCoversYear, trcOnFile: trcOnFile };
