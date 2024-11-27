import "./public/css/drawer.css";
import "./public/css/dropdown.css";
import "./public/css/sgv.css";

import "jquery-ui-bundle";
import "jquery.tooltips";

import _ from "lodash";
window._ = _;
import * as d3 from "d3";
window.d3 = d3;

import Storage from "js-storage";
window.Storage = Storage;

import moment from "moment-timezone";
window.moment = moment;

window.Nightscout = window.Nightscout || {};

var ctx = {
  moment: moment,
};

// import client from "./src/client"

window.Nightscout = {
  // client: client,
  client: require("../lib/client"),
  units: require("../lib/units")(),
  admin_plugins: require("../lib/admin_plugins/")(ctx),
};

window.Nightscout.report_plugins_preinit = require("../lib/report_plugins/");
window.Nightscout.predictions = require("../lib/report/predictions");
window.Nightscout.reportclient = require("../lib/report/reportclient");
window.Nightscout.profileclient = require("../lib/profile/profileeditor");
window.Nightscout.foodclient = require("../lib/food/food");
// even though it's typescript, this is apparently fine
// import foodClient from "./src/food";
// window.Nightscout.foodclient = foodClient;

console.info("Nightscout bundle ready");

// // Needed for Hot Module Replacement
// if (typeof module.hot !== "undefined") {
//   module.hot.accept();
// }
