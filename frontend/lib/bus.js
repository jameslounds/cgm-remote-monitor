"use strict";
const Stream = require("stream");

/** @param {ReturnType<import("./settings")>} settings */
function init(settings) {
  let beats = 0;
  const started = new Date();
  const interval = settings.heartbeat * 1000;
  /** @type {NodeJS.Timeout} */
  let busInterval;

  const stream =
    /** @type {Stream & {teardown: () => void; readable: Boolean; uptime: () => void}} */ (
      new Stream()
    );

  function ictus() {
    return {
      now: new Date(),
      type: "heartbeat",
      sig: "internal://" + ["heartbeat", beats].join("/"),
      beat: beats++,
      interval: interval,
      started: started,
    };
  }

  function repeat() {
    stream.emit("tick", ictus());
  }

  stream.teardown = function () {
    console.log("Initiating server teardown");
    clearInterval(busInterval);
    stream.emit("teardown");
  };

  stream.readable = true;
  stream.uptime = repeat;
  busInterval = setInterval(repeat, interval);
  return stream;
}
module.exports = init;
