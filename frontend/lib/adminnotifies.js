"use strict";

const { ONE_HOUR } = require("./constants");

class AdminNotifies {
  /**
   * @param {{
   *   bus: ReturnType<import("./bus")>;
   *   settings: ReturnType<import("./settings")>;
   * }} ctx
   */
  constructor(ctx) {
    /** @protected */
    this.ctx = ctx;
    /** @type {import("./types").NotifyBase[]} */
    this.notifies = [];

    this.ctx.bus.on("admin-notify", this.addNotify);
    this.ctx.bus.on("tick", this.clean);
  }

  /**
   * @param {Omit<import("./types").NotifyBase, "count" | "lastRecorded">
   *   | import("./types").NotifyBase} notify
   */
  addNotify(notify) {
    if (!this.ctx.settings.adminNotifiesEnabled) {
      console.log("Admin notifies disabled, skipping notify", notify);
      return;
    }

    if (!notify) return;

    notify.title ||= "None";
    notify.message ||= "None";

    const existingMessage = this.notifies.find(
      ({ message }) => message === notify.message
    );

    if (existingMessage) {
      existingMessage.count += 1;
      existingMessage.lastRecorded = Date.now();
    } else {
      this.notifies.push({ ...notify, count: 1, lastRecorded: Date.now() });
    }
  }

  getNotifies() {
    return this.notifies;
  }

  clean() {
    this.notifies = this.notifies.filter(
      (obj) => obj.persistent || Date.now() - obj.lastRecorded < 12 * ONE_HOUR
    );
  }

  cleanAll() {
    this.notifies = [];
  }
}

/** @param {ConstructorParameters<typeof AdminNotifies>} args */
module.exports = (...args) => new AdminNotifies(...args);
