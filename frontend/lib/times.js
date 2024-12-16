"use strict";

/** @param {number} value */
function weeks(value) {
  return {
    mins: value * 7 * 24 * 60,
    secs: value * 7 * 24 * 60 * 60,
    msecs: value * 7 * 24 * 60 * 60 * 1000,
  };
}
/** @param {number} value */
function days(value) {
  return {
    hours: value * 24,
    mins: value * 24 * 60,
    secs: value * 24 * 60 * 60,
    msecs: value * 24 * 60 * 60 * 1000,
  };
}
/** @param {number} value */
function hours(value) {
  return {
    mins: value * 60,
    secs: value * 60 * 60,
    msecs: value * 60 * 60 * 1000,
  };
}
/** @param {number} value */
function mins(value) {
  return {
    secs: value * 60,
    msecs: value * 60 * 1000,
  };
}
/** @param {number} value */
function secs(value) {
  return {
    msecs: value * 1000,
  };
}
/** @param {number} value */
function msecs(value) {
  return {
    mins: value / 1000 / 60,
    secs: value / 1000,
    msecs: value,
  };
}

const times = {
  week: () => weeks(1),
  weeks,
  day: () => days(1),
  days,
  hour: () => hours(1),
  hours,
  min: () => mins(1),
  mins,
  sec: () => secs(1),
  secs,
  msec: () => msecs(1),
  msecs,
};

module.exports = times;
