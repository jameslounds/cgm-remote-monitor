"use strict";

const { THIRTY_MINUTES } = require("./constants");

const DEFAULT_GROUPS = ["default"];

/** @typedef {Alarm} CAlarm */

class Alarm {
  /** @type {number} */
  silenceTime = THIRTY_MINUTES;
  /** @type {number | undefined} */
  lastEmitTime;

  /**
   * @param {import("./types").Level} level
   * @param {string} group
   * @param {string} label
   */
  constructor(level, group, label) {
    this.level = level;
    this.group = group;
    this.label = label;
    this.lastAckTime = 0;
  }
}

/**
 * list of alarms with their thresholds
 * @type {Partial<Record<string, Alarm>>}
 */
let alarms = {};

class Notifications {
  /**
   *
   * @param {{testMode?: boolean}} env
   * @param {{levels: import("./levels"); bus: ReturnType<import("./bus")>; ddata?: ReturnType<import("./data/ddata")>}} ctx
   */
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;

    this.requests = {
      /**@type {import("./types").Notify[]} */
      notifies: [],
      /**@type {import("./types").Snooze[]} */
      snoozes: [],
    };
    // noitifies might look like {level: string; group: string; isAnnouncement?: boolean}

    this.requestNotify = this.requestNotify.bind(this);
    this.requestSnooze = this.requestSnooze.bind(this);
  }

  /**
   *
   * @param {import("./types").Level} level
   * @param {string} group
   */
  #getAlarm(level, group) {
    const key = `${level}-${group}`;
    let alarm = alarms[key];
    if (!alarm) {
      const display =
        group === "default"
          ? this.ctx.levels.toDisplay(level)
          : group + ":" + level;
      alarm = new Alarm(level, group, display);
      alarms[key] = alarm;
    }

    return alarm;
  }

  /**
   * should only be used when auto acking the alarms after going back in range or when an error corrects
   * setting the silence time to 1ms so the alarm will be re-triggered as soon as the condition changes
   * since this wasn't ack'd by a user action
   * @param {string} group
   */
  #autoAckAlarms(group) {
    const sendClear = [this.ctx.levels.WARN, this.ctx.levels.URGENT]
      .map((level) => {
        const alarm = this.#getAlarm(level, group);
        if (alarm.lastEmitTime) {
          console.info(`auto acking ${alarm.level} - ${group}`);
          this.ack(alarm.level, group, 1);
          return true;
        }
      })
      .some(Boolean);

    if (sendClear) {
      /** @type {import("./types").Notify} */
      const notify = {
        clear: true,
        title: "All Clear",
        message: "Auto ack'd alarm(s)",
        group,
        level: this.ctx.levels.NONE,
      };
      this.ctx.bus.emit("notification", notify);
      this.#logEmitEvent(notify);
    }
  }

  /**
   * @param {import("./types").Notify} notify
   */
  #emitNotification(notify) {
    if(!this.ctx.ddata) return
    const alarm = this.#getAlarm(notify.level, notify.group);
    if (this.ctx.ddata.lastUpdated > alarm.lastAckTime + alarm.silenceTime) {
      this.ctx.bus.emit("notification", notify);
      alarm.lastEmitTime = this.ctx.ddata.lastUpdated;
      this.#logEmitEvent(notify);
    } else {
      const silencedMs =
        alarm.silenceTime - (this.ctx.ddata.lastUpdated - alarm.lastAckTime);
      const silencedMins = Math.floor(silencedMs / 60000);
      console.log(
        `${alarm.label} alarm is silenced for ${silencedMins} minutes more`
      );
    }
  }

  /**
   * Only the tests use this, not sure if they actually use this to init,
   * or if they use it to clear
   * */
  initRequests() {
    this.requests = { notifies: [], snoozes: [] };
  }

  /**
   * Find the first URGENT or first WARN
   * @param {string} [group="default"] - group to search in. Defaults to `"default"`
   */
  findHighestAlarm(group = "default") {
    const filtered = this.requests.notifies.filter(
      ({ group: foundGroup }) => foundGroup === group
    );
    return (
      filtered.find(({ level }) => level === this.ctx.levels.URGENT) ||
      filtered.find(({ level }) => level === this.ctx.levels.WARN)
    );
  }

  findUnSnoozeable() {
    return this.requests.notifies.filter(
      (notify) => notify.level <= this.ctx.levels.INFO || notify.isAnnouncement
    );
  }

  /**
   *
   * @param {import("./types").Notify} notify
   */
  snoozedBy(notify) {
    if (notify.isAnnouncement) return false;

    const filtered = this.requests.snoozes.filter(
      ({ group }) => group === notify.group
    );
    if (!filtered.length) return false;

    return filtered
      .filter((snooze) => snooze.level >= notify.level)
      .sort((a, b) => a.lengthMills - b.lengthMills)
      .at(-1);
  }

  /**
   *
   * @param {import("./types").Notify} notify
   */
  requestNotify(notify) {
    if (
      !Object.prototype.hasOwnProperty.call(notify, "level") ||
      !notify.title ||
      !notify.message ||
      !notify.plugin
    ) {
      console.error(
        new Error(
          "Unable to request notification, since the notify isn't complete: " +
            JSON.stringify(notify)
        )
      );
      return;
    }

    if (!notify.group) notify.group = "default";

    this.requests.notifies.push(notify);
  }

  /**
   *
   * @param {import("./types").Snooze} snooze
   */
  requestSnooze(snooze) {
    if (
      !snooze.level ||
      !snooze.title ||
      !snooze.message ||
      !snooze.lengthMills
    ) {
      console.error(
        new Error(
          "Unable to request snooze, since the snooze isn't complete: " +
            JSON.stringify(snooze)
        )
      );
      return;
    }

    snooze.group = snooze.group || "default";

    this.requests.snoozes.push(snooze);
  }

  process() {
    const notifyGroups = this.requests.notifies.map(({ group }) => group);
    const alarmGroups = /** @type {string[]} */ (
      Object.values(alarms)
        .map((a) => a?.group)
        .filter(Boolean)
    );
    let groups = [...new Set([...notifyGroups, ...alarmGroups])];

    if (!groups.length) groups = DEFAULT_GROUPS.slice();

    groups.forEach((group) => {
      const highestAlarm = this.findHighestAlarm(group);
      if (!highestAlarm) {
        this.#autoAckAlarms(group);
        return;
      }

      const snoozedBy = this.snoozedBy(highestAlarm);
      if (snoozedBy) {
        this.#logSnoozingEvent(highestAlarm, snoozedBy);
        this.ack(snoozedBy.level, group, snoozedBy.lengthMills, true);
        return;
      }

      this.#emitNotification(highestAlarm);
    });

    this.findUnSnoozeable().forEach((n) => this.#emitNotification(n));
  }

  /**
   *
   * @param {import("./types").Level} level
   * @param {string} group
   * @param {number} time
   * @param {boolean} [sendClear]
   */
  ack(level, group, time, sendClear) {
    const alarm = this.#getAlarm(level, group);
    if (!alarm) {
      console.warn(
        "Got an ack for an unknown alarm time",
        `level: ${level}, group: ${group}`
      );
      return;
    }

    if (Date.now() < alarm.lastAckTime + alarm.silenceTime) {
      console.warn(
        "Alarm has already been snoozed, don't snooze it again",
        `level: ${level}, group: ${group}`
      );
      return;
    }

    alarm.lastAckTime = Date.now();
    alarm.silenceTime = time ? time : THIRTY_MINUTES;
    delete alarm.lastEmitTime;

    if (level === this.ctx.levels.URGENT) {
      this.ack(this.ctx.levels.WARN, group, time);
    }

    /*
     * TODO: modify with a local clear, this will clear all connected clients,
     * globally
     */
    if (sendClear) {
      /** @type {import("./types").Notify} */
      const notify = {
        clear: true,
        title: "All Clear",
        message: `${group} - ${this.ctx.levels.toDisplay(level)} was ack'd`,
        group,
        level: this.ctx.levels.NONE,
      };
      // When web client sends ack, this translates the websocket message into
      // an event on our internal bus.
      this.ctx.bus.emit("notification", notify);
      this.#logEmitEvent(notify);
    }
  }

  /** @param {() => void} callback */
  #ifTestModeThen(callback) {
    if (this.env.testMode) {
      return callback();
    } else {
      throw "Test only function was called = while not in test mode";
    }
  }

  resetStateForTests() {
    this.#ifTestModeThen(() => {
      console.info("resetting notifications state for tests");
      alarms = {};
    });
  }

  /**
   * @param {import("./types").Level} level
   * @param {string} group
   */
  getAlarmForTests(level, group) {
    return this.#ifTestModeThen(() => {
      group = group || "default";
      const alarm = this.#getAlarm(level, group);
      console.info("got alarm for tests: ", alarm);
      return alarm;
    });
  }

  /** @param {import("./types").Notify} notify */
  #notifyToView(notify) {
    return {
      level: this.ctx.levels.toDisplay(notify.level),
      title: notify.title,
      message: notify.message,
      group: notify.group,
      plugin: notify.plugin ? notify.plugin.name : "<none>",
      debug: notify.debug,
    };
  }

  /** @param {import("./types").Snooze} snooze */
  #snoozeToView(snooze) {
    return {
      level: this.ctx.levels.toDisplay(snooze.level),
      title: snooze.title,
      message: snooze.message,
      group: snooze.group,
    };
  }

  /** @param {import("./types").Notify} notify */
  #logEmitEvent(notify) {
    const type =
      notify.level >= this.ctx.levels.WARN
        ? "ALARM"
        : notify.clear
          ? "ALL CLEAR"
          : "NOTIFICATION";

    console.info(
      `${this.#logTimestamp()}  EMITTING ${type}: 
        ${JSON.stringify(this.#notifyToView(notify))}`
    );
  }

  /**
   * @param {import("./types").Notify} highestAlarm
   * @param {import("./types").Snooze} snoozedBy
   */
  #logSnoozingEvent(highestAlarm, snoozedBy) {
    console.info(
      `${this.#logTimestamp()}  SNOOZING ALARM:
        ${JSON.stringify(this.#notifyToView(highestAlarm))}
        BECAUSE
            ${JSON.stringify(this.#snoozeToView(snoozedBy))}`
    );
  }

  #logTimestamp() {
    return new Date().toISOString();
  }
}

/** @param {ConstructorParameters<typeof Notifications>} args */
const fn = (...args) => new Notifications(...args);

module.exports = Object.assign(fn, {Alarm});
