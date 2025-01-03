"use strict";

const times = require("../times");

const BG_REF = 140; //Central tendency
const BG_MIN = 36; //Not 39, but why?
const BG_MAX = 400;
const WARN_THRESHOLD = 0.05;
const URGENT_THRESHOLD = 0.1;

const AR = /** @type {const} */ ([-0.723, 1.716]);

//TODO: move this to css
const AR2_COLOR = "cyan";

/**
 * @typedef {{forecast?: ReturnType<Ar2['forecast']>, level?: import("../types").Level, eventName?: string, displayLine?: string}} Ar2Properties
 */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class Ar2 {
  name = "ar2";
  label = "AR2";
  pluginType = "forecast";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.language = ctx.language;
    this.translate = ctx.language.translate;
    this.moment = ctx.moment;
  }

  /**
   * @param {Ar2Properties} prop
   * @param {import("../sandbox").InitializedSandbox} sbx
   * */
  buildTitle(prop, sbx) {
    const rangeLabel = prop.eventName
      ? sbx.translate(prop.eventName, { ci: true }).toUpperCase()
      : sbx.translate("Check BG");
    const level =
      prop.level !== undefined
        ? sbx.levels.toDisplay(prop.level)
        : this.translate("(none)");
    const title = `${level}, ${rangeLabel}`;

    const sgv = sbx.lastScaledSGV();
    if (
      sgv > sbx.scaleMgdl(sbx.settings.thresholds.bgTargetBottom) &&
      sgv < sbx.scaleMgdl(sbx.settings.thresholds.bgTargetTop)
    ) {
      return `${title} ${sbx.translate("predicted")}`;
    }
    return title;
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty(
      "ar2",
      /** @returns {Ar2Properties} */ () => {
        const forecast = this.forecast(sbx);
        const scaled = forecast?.predicted?.map((p) => sbx.scaleEntry(p));
        return {
          forecast,
          ...this.checkForecast(forecast, sbx),
          ...(scaled && scaled.length >= 3
            ? { displayLine: `BG 15m: ${scaled[2]} ${sbx.unitsLabel}` }
            : {}),
        };
      }
    );
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    if (sbx.time - sbx.lastSGVMills() > times.mins(10).msecs) return;

    const prop = sbx.properties.ar2;

    if (prop && prop.level) {
      sbx.notifications.requestNotify({
        level: prop.level,
        title: this.buildTitle(prop, sbx),
        message: sbx.buildDefaultMessage(),
        eventName: prop.eventName,
        pushoverSound: this.pushoverSound(prop, sbx.levels),
        plugin: this,
        debug: this.buildDebug(prop, sbx),
      });
    }
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  forecast(sbx) {
    if (!this.okToForecast(sbx)) {
      return { predicted: [], avgLoss: 0 };
    }

    const predicted = new Array(6) //only 6 points are used for calculating avgLoss
      .fill(0)
      .reduce(this.pushPoint.bind(this), this.initAR2(sbx)).points;

    const size = Math.min(predicted.length - 1, 6);
    const totalLoss = predicted.reduce(
      (acc, curr) => acc + Math.pow(this.log10(curr.mgdl / 120), 2),
      0
    );

    return { predicted, avgLoss: totalLoss / size };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    sbx.pluginBase.addForecastPoints(this.forecastCone(sbx), {
      type: "ar2",
      label: "AR2 Forecast",
    });
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  forecastCone(sbx) {
    if (!this.okToForecast(sbx)) return [];

    const coneFactor = this.getConeFactor(sbx);

    /** @param {ReturnType<Ar2['initAR2']>} result @param {number} step */
    const pushConePoints = (result, step) => {
      const next = this.incrementAR2(result);

      if (coneFactor > 0) {
        next.points.push(
          this.ar2Point(next, {
            offset: 2000,
            coneFactor: -coneFactor,
            step: step,
          })
        );
      }

      next.points.push(
        this.ar2Point(next, {
          offset: 4000,
          coneFactor: coneFactor,
          step: step,
        })
      );

      return next;
    };

    return [
      0.02, 0.041, 0.061, 0.081, 0.099, 0.116, 0.132, 0.146, 0.159, 0.171,
      0.182, 0.192, 0.201,
    ].reduce(pushConePoints.bind(this), this.initAR2(sbx)).points;
  }

  /**
   * @protected
   * @param {(a: string, b: string) => void} next
   * @param {unknown} _slots
   * @param {import("../sandbox").InitializedSandbox} sbx
   */
  virtAsstAr2Handler(next, _slots, sbx) {
    /** @type {ReturnType<Ar2['forecast']>['predicted'] | undefined} */
    const forecast = sbx.properties?.ar2?.forecast?.predicted;
    if (!forecast) {
      return next(
        this.translate("virtAsstTitleAR2Forecast"),
        this.translate("virtAsstUnknown")
      );
    }

    const mgdls = forecast.map((p) => p.mgdl);
    const mills = forecast.map((p) => p.mills);
    const max = Math.max(...mgdls);
    const min = Math.min(...mgdls);
    const maxForecastMills = Math.max(...mills);

    let response = "";
    if (min === max) {
      response = this.translate("virtAsstAR2ForecastAround", {
        params: [
          max.toString(),
          this.moment(maxForecastMills).from(this.moment(sbx.time)),
        ],
      });
    } else {
      response = this.translate("virtAsstAR2ForecastBetween", {
        params: [
          min.toString(),
          max.toString(),
          this.moment(maxForecastMills).from(this.moment(sbx.time)),
        ],
      });
    }
    next(this.translate("virtAsstTitleAR2Forecast"), response);
  }

  virtAsst = {
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["ar2 forecast", "forecast"],
        intentHandler: this.virtAsstAr2Handler.bind(this),
      },
    ],
  };

  /** @protected @param {ReturnType<Ar2['forecast']>} forecast @param {import("../sandbox").InitializedSandbox} sbx */
  checkForecast(forecast, sbx) {
    if (!forecast) return;

    const level =
      forecast.avgLoss > URGENT_THRESHOLD
        ? sbx.levels.URGENT
        : forecast.avgLoss > WARN_THRESHOLD
          ? sbx.levels.WARN
          : undefined;

    if (level === undefined) return;

    return {
      level:
        forecast.avgLoss > URGENT_THRESHOLD
          ? sbx.levels.URGENT
          : sbx.levels.WARN,
      forecast,
      eventName: this.selectEventType({ forecast }, sbx),
    };
  }
  /** @protected @param {Ar2Properties} prop @param {import("../sandbox").InitializedSandbox} sbx */
  selectEventType(prop, sbx) {
    const predicted = prop.forecast?.predicted.map((p) => sbx.scaleEntry(p));
    if (!predicted) return "";

    const in20Mins = predicted?.at(4);
    if (in20Mins === undefined) return "";

    if (
      sbx.settings.alarmHigh &&
      in20Mins > sbx.scaleMgdl(sbx.settings.thresholds.bgTargetTop)
    )
      return "high";
    if (
      sbx.settings.alarmLow &&
      in20Mins < sbx.scaleMgdl(sbx.settings.thresholds.bgTargetBottom)
    )
      return "low";

    return "";
  }

  /** @protected @param {Ar2Properties} prop @param {import("../levels")} levels */
  pushoverSound(prop, levels) {
    switch (true) {
      case prop.level === levels.URGENT:
        return "persistent";
      case prop.eventName === "low":
        return "falling";
      case prop.eventName === "high":
        return "climb";
    }
  }

  /** @protected @param {import("../sandbox").InitializedSandbox} sbx */
  getConeFactor(sbx) {
    const value = Number(sbx.extendedSettings.coneFactor);

    if (isNaN(value) || value < 0) return 2;
    return value;
  }

  /** @protected @param {import("../sandbox").InitializedSandbox} sbx */
  okToForecast(sbx) {
    const bgnow = sbx.properties.bgnow;
    const delta = sbx.properties.delta;

    if (!bgnow || !delta) return false;

    return (
      bgnow.mean >= BG_MIN &&
      delta.mean5MinsAgo &&
      !isNaN(Number(delta.mean5MinsAgo))
    );
  }

  /** @protected @param {import("../sandbox").InitializedSandbox} sbx */
  initAR2(sbx) {
    return {
      forecastTime: sbx.properties.bgnow.mills || sbx.time,
      /** @type {{mills: number; mgdl: number; color: string}[]} */
      points: [],
      prev: Math.log(sbx.properties.delta.mean5MinsAgo / BG_REF),
      curr: Math.log(sbx.properties.bgnow.mean / BG_REF),
    };
  }

  /** @protected @param {ReturnType<Ar2['initAR2']>} result */
  incrementAR2(result) {
    return {
      forecastTime: result.forecastTime + times.mins(5).msecs,
      points: result.points || [],
      prev: result.curr,
      curr:  AR[0] * result.prev + AR[1] * result.curr,
    };
  }

  /** @protected @param {ReturnType<Ar2['initAR2']>} result */
  pushPoint(result) {
    const next = this.incrementAR2(result);
    next.points.push(this.ar2Point(next, { offset: 2000 }));
    return next;
  }

  /**
   * @protected
   * @param {ReturnType<Ar2['incrementAR2']>} result
   * @param {{step?: number; coneFactor?: number; offset?: number;}} options
   * */
  ar2Point(result, options) {
    const step = options.step || 0;
    const coneFactor = options.coneFactor || 0;
    const offset = options.offset || 0;

    const mgdl = Math.round(BG_REF * Math.exp(result.curr + coneFactor * step));

    return {
      mills: result.forecastTime + offset,
      mgdl: Math.max(BG_MIN, Math.min(BG_MAX, mgdl)),
      color: AR2_COLOR,
    };
  }

  /** @protected @param {Ar2Properties} prop @param {import("../sandbox").InitializedSandbox} sbx */
  buildDebug(prop, sbx) {
    if (!prop.forecast) return;
    return {
      forecast: {
        avgLoss: prop.forecast.avgLoss,
        predicted: prop.forecast.predicted
          .map((p) => sbx.scaleEntry(p))
          .join(", "),
      },
    };
  }

  /** @protected @param {number} val */
  log10(val) {
    return Math.log(val) / Math.LN10;
  }
}

// module.exports = init;
/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new Ar2(ctx);
