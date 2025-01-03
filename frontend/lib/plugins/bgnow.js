"use strict";

const times = require("../times");

const offset = times.mins(2.5).msecs;
const bucketFields = /** @type {const} */ (["index", "fromMills", "toMills"]);

/**
 * @typedef {{
 *   isEmpty?: boolean;
 *   mills: number;
 *   mean: number;
 *   last?: number;
 *   errors?: import("../types").Sgv[];
 *   sgvs: import("../types").Sgv[];
 * }} Bucket
 */

/** @typedef {Omit<Bucket, (typeof bucketFields)[number]>} BGNowProperties */
/** @typedef {Bucket[]} BucketsProperties */

// There's no sane way to pass the generic parameter to `ReturnType<BgNow["calcDelta"]>`,
// so we have construct the type manually.
/**
 * @typedef {null
 *   | (Omit<NonNullable<ReturnType<BgNow["calcDelta"]>>, "previous"> & {
 *       previous?: Omit<Bucket, (typeof bucketFields)[number]>;
 *     })} DeltaProperties
 */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class BgNow {
  name = "bgnow";
  label = "BG Now";
  pluginType = "pill-primary";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.utils = require("../utils")(ctx);

    /** @type {Bucket} */
    this.recent;
  }

  /** @param {Bucket[]} buckets */
  mostRecentBucket(buckets) {
    // TODO revisit is b really potentially falsy?\
    return buckets.find((b) => b && !b.isEmpty);
  }

  /**
   * @param {Bucket | undefined} recent
   * @param {Bucket[]} buckets
   */
  previousBucket(recent, buckets) {
    if (typeof recent !== "object") return;

    return buckets.find((b) => !b.isEmpty && b.mills < recent.mills);
  }

  /**
   * @template {Record<PropertyKey, unknown>} TBucket
   * @param {TBucket} [bucket]
   * @returns {Omit<TBucket, (typeof bucketFields)[number]> | undefined}
   */
  omitBucketFields(bucket) {
    if (!bucket) return;

    const cloned = structuredClone(bucket);

    for (const field of bucketFields) {
      delete cloned[field];
    }

    return cloned;
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  setProperties(sbx) {
    const buckets = this.fillBuckets(sbx);
    const recent = this.mostRecentBucket(buckets);
    const previous = this.previousBucket(recent, buckets);
    const delta = this.calcDelta(recent, previous, sbx);

    sbx.offerProperty("bgnow", () => {
      return this.omitBucketFields(recent);
    });

    sbx.offerProperty("delta", () => {
      return delta;
    });

    sbx.offerProperty("buckets", () => {
      return buckets;
    });
  }

  /**
   * @param {ReturnType<import("../sandbox")>} sbx
   * @param {{ bucketCount?: number; bucketMins?: number }} [opts]
   */
  fillBuckets(sbx, opts) {
    const bucketCount = opts?.bucketCount || 4;
    const bucketMins = opts?.bucketMins || 5;
    const bucketMsecs = times.mins(bucketMins).msecs;

    const lastSGVMills = sbx.lastSGVMills();

    const buckets = Array(bucketCount)
      .fill(0)
      .map((_, index) => {
        const fromMills = lastSGVMills - offset - index * bucketMsecs;

        return {
          index,
          fromMills,
          toMills: fromMills + bucketMsecs,
          /** @type {import("../types").Sgv[]} */
          sgvs: [],
        };
      });

    sbx.data.sgvs.toReversed().forEach((sgv) => {
      // If in the future, skip to the next iteration
      if (sgv.mills > sbx.time) return;

      const bucket = buckets.find(
        (bucket) =>
          sgv.mills >= bucket.fromMills && sgv.mills <= bucket.toMills,
      );

      if (bucket) {
        sbx.scaleEntry(sgv);
        bucket.sgvs.push(sgv);
      }
    });

    return buckets.map((b) => this.analyzeBucket(b));
  }

  /** @protected @param {import("../types").Sgv} entry */
  notError(entry) {
    return entry && entry.mgdl > 39; //TODO maybe lower instead of expecting dexcom?
  }

  /** @protected @param {import("../types").Sgv} entry */
  isError(entry) {
    return !entry || !entry.mgdl || entry.mgdl < 39;
  }

  /**
   * @param {Omit<Bucket, "mean" | "mills" | "last" | "errors"> &
   *   Partial<Bucket>} bucket
   * @returns {Bucket}
   * @protected
   */
  analyzeBucket(bucket) {
    if (bucket.sgvs.length === 0) {
      return { isEmpty: true, sgvs: [], mills: NaN, mean: NaN };
    }

    const sgvs = bucket.sgvs.filter((b) => this.notError(b));
    const sum = sgvs.reduce((acc, sgv) => acc + sgv.mgdl, 0);
    const mean = sum / sgvs.length;
    const mostRecent = sgvs.toSorted((a, b) => b.mills - a.mills).at(0);
    const errors = bucket.sgvs.filter((b) => this.isError(b));

    return {
      mean,
      last: mostRecent?.mgdl ?? NaN,
      mills: mostRecent?.mills ?? NaN,
      ...(errors.length > 0 && { errors }),
      ...bucket,
    };
  }

  /**
   * @template {{ mills: number; mean: number }} TPrevious
   * @param {{ mills: number; mean: number } | undefined} recent
   * @param {TPrevious | undefined} previous
   * @param {ReturnType<import("../sandbox")>} sbx
   */
  calcDelta(recent, previous, sbx) {
    if (!recent || Object.getOwnPropertyNames(recent).length === 0) {
      //console.info('No recent CGM data is available');
      return null;
    }

    if (!previous || Object.getOwnPropertyNames(previous).length === 0) {
      //console.info('previous bucket not found, not calculating delta');
      return null;
    }

    const absolute = recent.mean - previous.mean;
    const elapsedMins = (recent.mills - previous.mills) / times.min().msecs;
    const interpolated = elapsedMins > 9;
    const mean5MinsAgo = interpolated
      ? recent.mean - ((recent.mean - previous.mean) / elapsedMins) * 5
      : recent.mean - (recent.mean - previous.mean);

    const mgdl = Math.round(recent.mean - mean5MinsAgo);

    const scaled =
      sbx.settings.units === "mmol"
        ? sbx.roundBGToDisplayFormat(
            sbx.scaleMgdl(recent.mean) - sbx.scaleMgdl(mean5MinsAgo),
          )
        : mgdl;

    const display = (scaled >= 0 ? "+" : "") + scaled;

    return {
      absolute,
      elapsedMins,
      interpolated,
      mean5MinsAgo,
      mgdl,
      scaled,
      display,
      previous: this.omitBucketFields(previous),
      times: {
        recent: recent.mills,
        previous: previous.mills,
      },
    };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const translate = this.translate;
    /** @type {BGNowProperties} */
    const prop = sbx.properties.bgnow;
    /** @type {DeltaProperties} */
    const delta = sbx.properties.delta;

    /** @type {Record<"label" | "value", string>[]} */
    const info = [];
    let display = (delta && delta.display) ?? undefined;

    if (delta && delta.interpolated) {
      display += " *";
      info.push({
        label: translate("Elapsed Time"),
        value: Math.round(delta.elapsedMins) + " " + translate("mins"),
      });
      info.push({
        label: translate("Absolute Delta"),
        value:
          sbx.roundBGToDisplayFormat(sbx.scaleMgdl(delta.absolute)) +
          " " +
          sbx.unitsLabel,
      });
      info.push({
        label: translate("Interpolated"),
        value:
          sbx.roundBGToDisplayFormat(sbx.scaleMgdl(delta.mean5MinsAgo)) +
          " " +
          sbx.unitsLabel,
      });
    }

    /**
     * @type {Record<
     *   string,
     *   {
     *     time: string;
     *     value: number;
     *     recent?: import("../types").Sgv;
     *     delta?: string;
     *   }
     * >}
     */
    const deviceInfos = {};

    prop.sgvs?.forEach((entry) => {
      const device = this.utils.deviceName(entry.device);
      if (!device) return;
      deviceInfos[device] = {
        time: this.utils.timeFormat(this.moment(entry.mills), sbx),
        value: sbx.scaleEntry(entry),
        recent: entry,
      };
    });

    delta?.previous?.sgvs?.forEach((entry) => {
      const device = this.utils.deviceName(entry.device);
      if (!device) return;

      const deviceInfo = deviceInfos[device];
      if (deviceInfo && deviceInfo.recent) {
        const deviceDelta = this.calcDelta(
          { mills: deviceInfo.recent.mills, mean: deviceInfo.recent.mgdl },
          { mills: entry.mills, mean: entry.mgdl },
          sbx,
        );
        if (deviceDelta) deviceInfo.delta = deviceDelta.display;
      } else {
        deviceInfos[device] = {
          time: this.utils.timeFormat(this.moment(entry.mills), sbx),
          value: sbx.scaleEntry(entry),
        };
      }
    });
    if (delta?.previous?.sgvs && Object.keys(deviceInfos).length > 1) {
      Object.entries(deviceInfos).forEach(([name, deviceInfo]) => {
        let display = deviceInfo.value.toString();
        if (deviceInfo.delta) {
          display += " " + deviceInfo.delta;
        }

        display += " (" + deviceInfo.time + ")";

        info.push({ label: name, value: display });
      });
    }

    sbx.pluginBase.updatePillText(
      {
        name: "delta",
        label: translate("BG Delta"),
        pluginType: "pill-major",
        pillFlip: true,
      },
      {
        value: display,
        label: sbx.unitsLabel,
        ...(info.length && { info }),
      },
    );
  }
  /** @protected @type {import("../types").VirtAsstIntentHandlerFn} */
  virtAsstDelta(next, _slots, sbx) {
    /** @type {DeltaProperties} */
    const delta = sbx.properties.delta;

    next(
      this.translate("virtAsstTitleDelta"),
      this.translate(
        delta?.interpolated ? "virtAsstDeltaEstimated" : "virtAsstDelta",
        {
          params: [
            delta?.display == "+0" ? "0" : (delta?.display ?? ""),
            this.moment(delta?.times.recent).from(this.moment(sbx.time)),
            this.moment(delta?.times.previous).from(this.moment(sbx.time)),
          ],
        },
      ),
    );
  }

  /** @satisfies {{ intentHandlers: import("../types").VirtAsstIntentHandler[] }} */
  virtAsst = {
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["delta"],
        intentHandler: this.virtAsstDelta.bind(this),
      },
    ],
  };
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new BgNow(ctx);
