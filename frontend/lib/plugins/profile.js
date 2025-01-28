"use strict";

/** @import {Plugin} from "../types" */

/**
 * This is just a fake plugin to hold extended settings
 *
 * @implements {Plugin}
 */
class Profile {
  name = /** @type {const} */ ("profile");
  label = "Profile";
  pluginType = "fake";
}

module.exports = () => new Profile();
