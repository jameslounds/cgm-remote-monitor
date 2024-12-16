"use strict";

const { ONE_HOUR } = require("./constants");

class AdminNotifies {
  constructor(ctx) {
    this.ctx = ctx;
    this.notifies = [];

    this.ctx.bus.on("admin-notify", this.addNotify);
    this.ctx.bus.on("tick", this.clean);
  }
  addNotify(notify) {
    if (!this.ctx.settings.adminNotifiesEnabled) {
      console.log("Admin notifies disabled, skipping notify", notify);
      return;
    }

    if (!notify) return;

    if (!notify.title) notify.title = "No title";
    if (!notify.message) notify.message = "No message";

    const existingMessage = this.notifies.find(
      ({ message }) => message === notify.message
    );

    if (existingMessage) {
      existingMessage.count += 1;
      existingMessage.lastRecorded = Date.now();
    } else {
      notify.count = 1;
      notify.lastRecorded = Date.now();
      this.notifies.push(notify);
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

module.exports = (ctx) => new AdminNotifies(ctx);
