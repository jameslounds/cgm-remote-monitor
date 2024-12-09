// // import "./public/css/drawer.css";
// // import "./public/css/dropdown.css";
// // import "./public/css/sgv.css";

import "jquery-ui-bundle";
import "jquery.tooltips";

import _ from "lodash";
window._ = _;
import * as d3 from "d3";
window.d3 = d3;

import Storage from "js-storage";
window.Storage = Storage;

// import moment from "moment-timezone";
// window.moment = moment;

window.Nightscout = window.Nightscout || {};

// var ctx = {
// moment: moment,
// };

import client from "../lib/client/index.js";
import initUnits from "../lib/units.js";
import initAdminPlugins from "../lib/admin_plugins/index.js";
window.Nightscout = {
  client,
  units: initUnits(),
  admin_plugins: initAdminPlugins(),
};

import report_plugins from "../lib/report_plugins/index.js";
import report_predictions from "../lib/report/predictions.js";
import report_reportclient from "../lib/report/reportclient.js";
import profile_profileeditor from "../lib/profile/profileeditor.js";
import food from "../lib/food/food.js";

window.Nightscout.report_plugins_preinit = report_plugins;
window.Nightscout.predictions = report_predictions;
window.Nightscout.reportclient = report_reportclient;
window.Nightscout.profileclient = profile_profileeditor;
window.Nightscout.foodclient = food;
// even though it's typescript, this is apparently fine
// import foodClient from "./src/food";
// window.Nightscout.foodclient = foodClient;

console.info("Nightscout bundle ready");

// // Needed for Hot Module Replacement
// if (typeof module.hot !== "undefined") {
//   module.hot.accept();
// }
