"use strict";

// import $ from "jquery";
import "flot";
import "flot/jquery.flot.time.js";
import "flot/jquery.flot.pie.js";
import "flot/jquery.flot.fillbetween.js";

$(document).ready(function () {
  console.log("Application got ready event");
  try {
    console.log("calling reportclient");
    window.Nightscout.reportclient();
    console.log("reportclient called");
    
    document.dispatchEvent(new CustomEvent("Nightscout-load"));
  } catch (err) {
    console.log("error")
  }


});
