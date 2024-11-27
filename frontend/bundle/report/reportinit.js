"use strict";

import $ from "jquery";
import "flot";
import "flot/jquery.flot.time";
import "flot/jquery.flot.pie";
import "flot/jquery.flot.fillbetween";

$(document).ready(function () {
  console.log("Application got ready event");
  window.Nightscout.reportclient();
});
