"use strict";

// this is just a fake plugin to hold extended settings

function init() {
  var profile = {
    name: /** @type {const} */ ("profile"),
    label: "Profile",
    pluginType: "fake",
  };

  return profile;
}

module.exports = init;
