"use strict";

// import $ from "jquery";
import "flot";
import "flot/jquery.flot.time.js";
import "flot/jquery.flot.pie.js";
import "flot/jquery.flot.fillbetween.js";

$(document).ready(function () {
  console.log("Application got ready event");
  window.Nightscout.reportclient();

  document.dispatchEvent(new CustomEvent("Nightscout-load"));
});
