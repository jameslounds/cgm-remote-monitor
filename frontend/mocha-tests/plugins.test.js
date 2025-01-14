"use strict";

var should = require("should");

describe("Plugins", function () {
  it("should find client plugins, but not server only plugins", function (done) {
    var plugins = require("../lib/plugins/")({
      settings: {},
      language: require("../lib/language")(),
    }).registerClientDefaults();

    plugins.byName("bgnow").name.should.equal("bgnow");
    plugins.byName("rawbg").name.should.equal("rawbg");

    //server only plugin
    should.not.exist(plugins.byName("treatmentnotify"));

    done();
  });

  it("should find sever plugins, but not client only plugins", function (done) {
    var plugins = require("../lib/plugins/")({
      settings: {},
      language: require("../lib/language")(),
    }).registerServerDefaults();

    plugins.byName("rawbg").name.should.equal("rawbg");
    plugins.byName("treatmentnotify").name.should.equal("treatmentnotify");

    //client only plugin
    should.not.exist(plugins.byName("cannulaage"));

    done();
  });
});
