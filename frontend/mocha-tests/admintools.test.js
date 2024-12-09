"use strict";

require("should");
// var serverSettings = require("./fixtures/default-server-settings");
const path = require("path");

var nowData = {
  sgvs: [{ mgdl: 100, mills: Date.now(), direction: "Flat", type: "sgv" }],
};

var someData = {
  "/api/v1/devicestatus.json?count=500": [
    {
      _id: {
        $oid: "56096da3c5d0fef41b212362",
      },
      uploaderBattery: 37,
      created_at: "2015-09-28T16:41:07.144Z",
    },
    {
      _id: {
        $oid: "56096da3c5d0fef41b212363",
      },
      uploaderBattery: 38,
      created_at: "2025-09-28T16:41:07.144Z",
    },
  ],
  "/api/v1/devicestatus/?find[created_at][$lte]=": {
    n: 1,
  },
  "/api/v1/treatments.json?&find[created_at][$gte]=": [
    {
      _id: "5609a9203c8104a8195b1c1e",
      enteredBy: "",
      eventType: "Carb Correction",
      carbs: 3,
      created_at: "2025-09-28T20:54:00.000Z",
    },
  ],
  "/api/v1/treatments/?find[created_at][$lte]=": {
    n: 1,
  },
  "/api/v1/entries.json?&find[date][$gte]=": [
    {
      _id: "560983f326c5a592d9b9ae0c",
      device: "dexcom",
      date: 1543464149000,
      sgv: 83,
      direction: "Flat",
      type: "sgv",
      filtered: 107632,
      unfiltered: 106256,
      rssi: 178,
      noise: 1,
    },
  ],
  "/api/v1/entries/?find[date][$lte]=": {
    n: 1,
  },
  "/translations/en/en.json": require("../translations/en/en.json"),
  "/api/v1/adminnotifies": {
    status: 200,
    message: {
      notifies: [],
      notifyCount: 0,
    },
  },
};

const headless = require("./fixtures/headless")(this);
describe("admintools", function () {
  var self = this;
  this.timeout(45000); // TODO: see why this test takes longer on CI to complete
  before(function (done) {
    headless.setup(
      {
        mockAjax: someData,
        benvRequires: [path.resolve("./bundle/admin/admininit.js")],
        waitForLoad: true,
        htmlFile: path.resolve("./bundle/admin/index.html"),
      },
      () => {
        done();
      }
    );
  });

  after(function (done) {
    headless.teardown();
    done();
  });

  it("should produce some html", async function (done) {
    var client = window.Nightscout.client;

    window.confirm = function mockConfirm(text) {
      console.log("Confirm:", text);
      return true;
    };

    window.alert = function mockAlert() {
      return true;
    };

    client.dataUpdate(nowData);

    $("#admin_cleanstatusdb_0_html + button")
      .text()
      .should.equal("Delete all documents"); // devicestatus button
    $("#admin_cleanstatusdb_0_status")
      .text()
      .should.equal("Database contains 2 records"); // devicestatus init result

    $("#admin_cleanstatusdb_0_html + button").click();
    $("#admin_cleanstatusdb_0_status")
      .text()
      .should.equal("All records removed ..."); // devicestatus code result

    $("#admin_cleanstatusdb_1_html + button")
      .text()
      .should.equal("Delete old documents"); // devicestatus button
    $("#admin_cleanstatusdb_1_status").text().should.equal(""); // devicestatus init result

    $("#admin_cleanstatusdb_1_html + button").click();
    $("#admin_cleanstatusdb_1_status").text().should.equal("1 records deleted"); // devicestatus code result

    $("#admin_futureitems_0_html + button")
      .text()
      .should.equal("Remove treatments in the future"); // futureitems button 0
    $("#admin_futureitems_0_status")
      .text()
      .should.equal("Database contains 1 future records"); // futureitems init result 0

    $("#admin_futureitems_0_html + button").click();
    $("#admin_futureitems_0_status")
      .text()
      .should.equal("Record 5609a9203c8104a8195b1c1e removed ..."); // futureitems code result 0

    $("#admin_futureitems_1_html + button")
      .text()
      .should.equal("Remove entries in the future"); // futureitems button 1
    $("#admin_futureitems_1_status")
      .text()
      .should.equal("Database contains 1 future records"); // futureitems init result 1

    $("#admin_futureitems_1_html + button").click();
    $("#admin_futureitems_1_status")
      .text()
      .should.equal("Record 560983f326c5a592d9b9ae0c removed ..."); // futureitems code result 1

    $("#admin_cleantreatmentsdb_0_html + button")
      .text()
      .should.equal("Delete old documents"); // treatments button
    $("#admin_cleantreatmentsdb_0_status").text().should.equal(""); // treatments init result

    $("#admin_cleantreatmentsdb_0_html + button").click();
    $("#admin_cleantreatmentsdb_0_status")
      .text()
      .should.equal("1 records deleted"); // treatments code result

    $("#admin_cleanentriesdb_0_html + button")
      .text()
      .should.equal("Delete old documents"); // entries button
    $("#admin_cleanentriesdb_0_status").text().should.equal(""); // entries init result

    $("#admin_cleanentriesdb_0_html + button").click();
    $("#admin_cleanentriesdb_0_status")
      .text()
      .should.equal("1 records deleted"); // entries code result

    done();
  });
});
