/* ============================================================================
 * Shared FX-rate resolution for the DAG's what-if tool.
 * Default matches engine/constants.js's CONST.FX.INR_PER_USD (83.0 INR/USD) —
 * every node file used to hard-copy this literal into its own inrToUsd/
 * moneyFromInr helpers (see docs/DAG_MIGRATION_TRACKER.md's FX note). Those
 * helpers now read the rate through fxRate(ctx) instead, so dragging the
 * what-if FX slider (ctx.fxRateOverride, set by monitor-next/lib/dag-adapter.js)
 * re-prices every INR<->USD conversion in the graph from one place. With no
 * override present, behavior is byte-identical to the old bare literal.
 * ==========================================================================*/
var DEFAULT_FX_RATE = 83.0;

function fxRate(ctx) {
  var v = ctx && ctx.fxRateOverride;
  var n = Number(v);
  return (v !== undefined && v !== null && !isNaN(n) && n > 0) ? n : DEFAULT_FX_RATE;
}

module.exports = { fxRate: fxRate, DEFAULT_FX_RATE: DEFAULT_FX_RATE };
