"use strict";

const $ = require("jquery");

$(document).ready(function () {
  console.log("Application got ready event");
  window.Nightscout.reportclient();
});
