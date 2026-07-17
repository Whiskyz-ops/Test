"use strict";
/* ============================================================================
 * Minimal dependency-graph resolver — the pilot's actual "framework."
 *
 * Deliberately tiny (no library, matches the engine's own no-bundler
 * philosophy): a node is { deps: [ids], scopeGate: id|null, outOfScopeValue,
 * compute(depValues, ctx) }. resolve() topologically resolves + memoizes.
 *
 * The one piece of real behavior this exists to prove: when a node declares
 * `scopeGate`, and that gate resolves false, `compute()` is NEVER CALLED —
 * the node's value is `outOfScopeValue` by construction. There is no `if`
 * statement inside compute() for a future author to forget to write; the
 * gate lives once, at the node definition, not at every call site.
 * ==========================================================================*/

function createGraph(nodeDefs) {
  Object.keys(nodeDefs).forEach(function (id) {
    var def = nodeDefs[id];
    if (def.scopeGate && def.deps.indexOf(def.scopeGate) === -1) {
      throw new Error(
        "Node '" + id + "' declares scopeGate '" + def.scopeGate + "' but doesn't list it in deps — " +
        "the gate must be an explicit dependency so it resolves before the gate check runs."
      );
    }
  });

  function resolve(targetIds, ctx) {
    var cache = {};
    var inStack = {};

    function resolveOne(id) {
      if (Object.prototype.hasOwnProperty.call(cache, id)) return cache[id];
      var def = nodeDefs[id];
      if (!def) throw new Error("Unknown node '" + id + "'");
      if (inStack[id]) throw new Error("Cycle detected at node '" + id + "'");
      inStack[id] = true;

      var depValues = {};
      def.deps.forEach(function (depId) { depValues[depId] = resolveOne(depId); });

      var value;
      if (def.scopeGate && depValues[def.scopeGate] === false) {
        // Structural short-circuit — compute() below is unreachable here.
        value = typeof def.outOfScopeValue === "function" ? def.outOfScopeValue(depValues, ctx) : def.outOfScopeValue;
      } else {
        value = def.compute(depValues, ctx);
      }

      cache[id] = value;
      inStack[id] = false;
      return value;
    }

    var out = {};
    targetIds.forEach(function (id) { out[id] = resolveOne(id); });
    return { values: out, all: cache };
  }

  return { resolve: resolve, nodeDefs: nodeDefs };
}

module.exports = { createGraph: createGraph };
