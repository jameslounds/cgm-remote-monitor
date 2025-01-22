"use strict";

/** @typedef {ReturnType<DbSizePlugin["analyzeData"]>} DbSizeProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class DbSizePlugin {
  name = /** @type {const} */ ("dbsize");
  label = "Database Size";
  pluginType = "pill-status";
  pillFlip = true;

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  getPrefs(sbx) {
    return {
      warnPercentage: sbx.extendedSettings.warnPercentage
        ? sbx.extendedSettings.warnPercentage
        : 60,
      urgentPercentage: sbx.extendedSettings.urgentPercentage
        ? sbx.extendedSettings.urgentPercentage
        : 75,
      max: sbx.extendedSettings.max ? sbx.extendedSettings.max : 496,
      enableAlerts: sbx.extendedSettings.enableAlerts,
      inMib: sbx.extendedSettings.inMib,
    };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("dbsize", () => this.analyzeData(sbx));
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  analyzeData(sbx) {
    const prefs = this.getPrefs(sbx);

    const recentData = sbx.data.dbstats;

    const maxSize = prefs.max > 0 ? prefs.max : 100 * 1024;
    const totalDataSize =
      ((recentData?.dataSize || 0) + (recentData?.indexSize || 0)) /
      (1024 * 1024);

    const dataPercentage = Math.floor((totalDataSize * 100.0) / maxSize);

    // failsafe to have percentage in 0..100 range
    const boundWarnPercentage = Math.max(
      0,
      Math.min(100, parseInt(prefs.warnPercentage))
    );
    const boundUrgentPercentage = Math.max(
      0,
      Math.min(100, parseInt(prefs.urgentPercentage))
    );

    const warnSize = Math.floor((boundWarnPercentage / 100) * maxSize);
    const urgentSize = Math.floor((boundUrgentPercentage / 100) * maxSize);
    const notificationLevel =
      (totalDataSize >= urgentSize &&
        boundUrgentPercentage > 0 &&
        this.levels.URGENT) ||
      (totalDataSize >= warnSize &&
        boundWarnPercentage > 0 &&
        this.levels.WARN) ||
      this.levels.INFO;

    const display = prefs.inMib
      ? parseFloat(totalDataSize.toFixed(0)) + "MiB"
      : dataPercentage + "%";
    const status = this.levels.toStatusClass(notificationLevel);

    return {
      /**
       * @deprecated In original return type, not used, leaving in for backwards
       *   compatability
       */
      level: undefined,
      totalDataSize,
      dataPercentage,
      details: {
        maxSize: parseFloat(maxSize.toFixed(2)),
        dataSize: parseFloat(totalDataSize.toFixed(2)),
      },
      notificationLevel,
      display,
      status,
    };
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const prefs = this.getPrefs(sbx);

    if (!prefs.enableAlerts) return;

    const prop = sbx.properties.dbsize;

    if (
      prop &&
      prop.dataPercentage &&
      prop.notificationLevel &&
      prop.notificationLevel >= this.levels.WARN
    ) {
      sbx.notifications.requestNotify({
        level: prop.notificationLevel,
        title:
          this.levels.toDisplay(prop.notificationLevel) +
          " " +
          this.translate("Database Size near its limits!"),
        message: this.translate(
          "Database size is %1 MiB out of %2 MiB. Please backup and clean up database!",
          {
            params: [
              prop.details.dataSize.toString(),
              prop.details.maxSize.toString(),
            ],
          }
        ),
        pushoverSound: "echo",
        group: "Database Size",
        plugin: this,
        debug: prop,
      });
    }
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.dbsize;
    if(!prop) return;

    const info = [
      {
        label: this.translate("Data size"),
        value: this.translate("%1 MiB of %2 MiB (%3%)", {
          params: [
            prop.details.dataSize.toString() ,
            prop.details.maxSize.toString(),
            prop.dataPercentage.toString(),
          ],
        }),
      },
    ];

    sbx.pluginBase.updatePillText(this, {
      value: prop.display,
      labelClass: "plugicon-database",
      pillClass: prop.status,
      info,
      hide: prop.totalDataSize <= 0,
    });
  }

  /** @protected @type {import("../types").VirtAsstIntentHandlerFn} */
  virtAsstDatabaseSizeHandler(next, _slots, sbx) {
    if (sbx.properties.dbsize?.display) {
      const dataSize = sbx.properties.dbsize.details.dataSize;
      const dataPercentage = sbx.properties.dbsize.dataPercentage;

      const response = this.translate("virtAsstDatabaseSize", {
        params: [dataSize.toString(), dataPercentage.toString()],
      });

      next(this.translate("virtAsstTitleDatabaseSize"), response);
    } else {
      next(
        this.translate("virtAsstTitleDatabaseSize"),
        this.translate("virtAsstUnknown")
      );
    }
  }

  virtAsst = {
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["db size"],
        intentHandler: this.virtAsstDatabaseSizeHandler.bind(this),
      },
    ],
  };
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new DbSizePlugin(ctx);
