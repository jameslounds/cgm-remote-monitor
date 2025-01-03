"use strict";

/** @typedef {ReturnType<Direction["info"]>} DirectionProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class Direction {
  name = "direction";
  label = "BG direction";
  pluginType = "bg-status";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("direction", () => {
      if (!sbx.isCurrent(sbx.lastSGVEntry())) return;

      return this.info(sbx.lastSGVEntry());
    });
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    var prop = sbx.properties.direction;

    if (!prop || !prop.value) {
      sbx.pluginBase.updatePillText(this, {
        hide: true,
      });
    } else {
      if ((sbx.lastSGVMgdl() ?? NaN) < 39) {
        prop.value = "CGM ERROR";
        prop.label = "✖";
      }

      sbx.pluginBase.updatePillText(this, {
        label: prop && prop.label + "&#xfe0e;",
        directHTML: true,
      });
    }
  }

  /** @param {import("../types").Sgv} [sgv] */
  info(sgv) {
    if (!sgv) return { display: null };

    return {
      value: sgv.direction,
      label: this.directionToChar(sgv.direction),
      entity: this.charToEntity(this.directionToChar(sgv.direction)),
    };
  }

  /** @type {Partial<Record<string, string>>} @protected */
  static dir2Char = {
    NONE: "⇼",
    TripleUp: "⤊",
    DoubleUp: "⇈",
    SingleUp: "↑",
    FortyFiveUp: "↗",
    Flat: "→",
    FortyFiveDown: "↘",
    SingleDown: "↓",
    DoubleDown: "⇊",
    TripleDown: "⤋",
    "NOT COMPUTABLE": "-",
    "RATE OUT OF RANGE": "⇕",
  };

  /** @param {string} [char] @protected */
  charToEntity(char) {
    return char && char.length && "&#" + char.charCodeAt(0) + ";";
  }

  /** @param {string} [direction] @protected */
  directionToChar(direction) {
    if(!direction) return "-";
    return Direction.dir2Char[direction] || "-";
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new Direction(ctx);
