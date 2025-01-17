"use strict";

require("should");

var nowData = {
  sgvs: [{ mgdl: 100, mills: Date.now(), direction: "Flat", type: "sgv" }],
  treatments: [],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let window, document;

describe("careportal", async function () {
  this.timeout(60000); // TODO: see why this test takes longer on Travis to complete

  var headless = require("./fixtures/headless")(this);

  before(function (done) {
    const t = Date.now();
    console.log("Starting headless setup for Careportal test");

    function d(args) {
      console.log("Headless setup for Careportal test done");
      ({ window, document } = args);
      done();
    }

    headless.setup({ mockAjax: true }, d);
  });

  after(function (done) {
    headless.teardown();
    done();
  });

  it("open careportal, and enter a treatment", async () => {
    console.log("Careportal test client start");

    var client = window.Nightscout.client;

    console.log("Careportal test client init");
    client.init();
    sleep(50);

    // because `client/index.js` gets cached, and the `module.exports` is an instance of a class,
    // the `$` gets sorta closured, and becomes whatever it was when the module was first required for all subsequent test runs.
    // By doing this, we tell just the careportal to use the "real" jQuery (which knows about the only `window` we haven't already `happyDOM.close`d)
    client.careportal.$ = $;

    console.log("Careportal test client data update");
    client.dataUpdate(nowData, true);
    sleep(50);

    client.careportal.prepareEvents();

    $("#eventType").val("Snack Bolus");
    $("#glucoseValue").val("100");
    $("#carbsGiven").val("10");
    $("#insulinGiven").val("0.60");
    $("#preBolus").val(15);
    $("#notes").val("Testing");
    $("#enteredBy").val("Dad");

    //simulate some events
    client.careportal.eventTimeTypeChange();
    client.careportal.dateTimeFocus();
    client.careportal.dateTimeChange();

    window.confirm = function mockConfirm(message) {
      function containsLine(line) {
        message.indexOf(line + "\n").should.be.greaterThan(0);
      }

      containsLine("Event Type: Snack Bolus");
      containsLine("Blood Glucose: 100");
      containsLine("Carbs Given: 10");
      containsLine("Insulin Given: 0.60");
      containsLine("Carb Time: 15 mins");
      containsLine("Notes: Testing");
      containsLine("Entered By: Dad");

      return true;
    };

    window.alert = function mockAlert(messages) {
      messages.should.equal("");
    };

    console.log("Careportal test saving");

    client.careportal.save();
  });
});
