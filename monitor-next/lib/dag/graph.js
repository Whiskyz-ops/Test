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
 *
 * Hardened after a real bug found while closing the aggregateIndiaIncome
 * boundary: two nodes read `d.diAgg`/`d.osAgg` inside compute() without
 * declaring them in `deps`. Nothing caught it structurally — `d` was a
 * plain object with only the DECLARED deps as keys, so the undeclared
 * access silently returned `undefined`, which the node's own safe()
 * helper absorbed into a default value instead of crashing. The bug only
 * surfaced because intermediate values were checked against the real
 * model, not because the framework prevented it. depValues is now
 * wrapped in a Proxy that THROWS on any access outside a node's own
 * declared deps — this exact bug class is now impossible to reproduce
 * silently; it becomes a loud, immediate error at the point of the
 * mistake instead of a wrong number discovered later by luck.
 * ==========================================================================*/

function wrapDeps(depValues, nodeId) {
  return new Proxy(depValues, {
    get: function (target, prop) {
      if (typeof prop === "symbol" || prop === "toJSON" || prop === "then") return target[prop];
      if (!Object.prototype.hasOwnProperty.call(target, prop)) {
        throw new Error(
          "Node '" + nodeId + "'.compute() accessed '" + prop + "', which isn't in its own declared deps. " +
          "Add '" + prop + "' to this node's deps array — or if this was accidental, this check just caught a real bug " +
          "(the exact class that silently zeroed out income heads while closing the aggregateIndiaIncome boundary)."
        );
      }
      return target[prop];
    }
  });
}

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
      var guardedDeps = wrapDeps(depValues, id);

      var value;
      if (def.scopeGate && depValues[def.scopeGate] === false) {
        // Structural short-circuit — compute() below is unreachable here.
        value = typeof def.outOfScopeValue === "function" ? def.outOfScopeValue(guardedDeps, ctx) : def.outOfScopeValue;
      } else {
        value = def.compute(guardedDeps, ctx);
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
