"use strict";

require("should");

describe("hashauth", function () {
  this.timeout(50000); // TODO: see why this test takes longer on Travis to complete

  const headless = require("./fixtures/headless")(this);

  before(function (done) {
    done();
  });

  after(function (done) {
    // cleanup js-storage as it evaluates if the test is running in the window or not when first required
    delete require.cache[require.resolve("js-storage")];
    done();
  });

  beforeEach(function (done) {
    headless.setup({ mockAjax: true }, () => {
      require("jquery.tooltips");
      console.log("headless setup done for hashauth");
      done();
    });
  });

  afterEach(function (done) {
    headless.teardown();
    done();
  });

  it("should make module unauthorized", function () {
    const client = require("../lib/client");

    client.hashauth.verifyAuthentication = (next) => {
      client.hashauth.authenticated = false;
      next(true);
    };

    client.init();

    client.hashauth
      .inlineCode()
      .indexOf("Unauthorized")
      .should.be.greaterThan(0);
    client.hashauth.isAuthenticated().should.equal(false);
    should.equal(client.hashauth.hash(), null);
  });

  it("should make module authorized", function () {
    const client = require("../lib/client");

    client.hashauth.verifyAuthentication = (next) => {
      client.hashauth.authenticated = true;
      next(true);
    };

    client.init();

    console.log({ a: client.hashauth.authenticated });

    client.hashauth
      .inlineCode()
      .indexOf("Admin authorized")
      .should.be.greaterThan(0);
    client.hashauth.isAuthenticated().should.equal(true);
  });

  it("should store hash and the remove authentication", function () {
    window.localStorage.removeItem("apisecrethash");

    const client = require("../lib/client");

    client.hashauth.verifyAuthentication = (next) => {
      client.hashauth.authenticated = true;
      next(true);
    };
    client.hashauth.updateSocketAuth = () => {};

    client.init();

    client.hashauth.processSecret("this is my long pass phrase", true);

    client.hashauth
      .hash()
      .should.equal("b723e97aa97846eb92d5264f084b2823f57c4aa1");
    window.localStorage
      .getItem("apisecrethash")
      .should.equal("b723e97aa97846eb92d5264f084b2823f57c4aa1");
    client.hashauth.isAuthenticated().should.equal(true);

    client.hashauth.removeAuthentication();
    client.hashauth.isAuthenticated().should.equal(false);
  });

  it("should not store hash", function () {
    window.localStorage.removeItem("apisecrethash");

    const client = require("../lib/client");

    client.hashauth.verifyAuthentication = (next) => {
      client.hashauth.authenticated = true;
      next(true);
    };

    client.init();

    client.hashauth.processSecret("this is my long pass phrase", false);

    client.hashauth
      .hash()
      .should.equal("b723e97aa97846eb92d5264f084b2823f57c4aa1");
    should.equal(window.localStorage.getItem("apisecrethash"), null);

    client.hashauth.isAuthenticated().should.equal(true);
  });

  it("should report secret too short", function () {
    window.localStorage.removeItem("apisecrethash");

    const client = require("../lib/client");

    client.init();

    window.alert = function mockConfirm(message) {
      message.includes("Too short API secret").should.equal(true);
      return true;
    };

    client.hashauth.processSecret("short passp", false);
  });
});
