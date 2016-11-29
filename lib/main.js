/*
Potential problems:
domains loaded on subsequent calls, self signed ssl, multi-process firefox support

Improvements:
How many times has the cert been seen
Modularize

*/

const windowUtils = require("sdk/window/utils");
const notifications = require("sdk/notifications");

let { Cc, Ci, Cu } = require('chrome');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import("resource://gre/modules/FileUtils.jsm");

const CategoryManager = Cc["@mozilla.org/categorymanager;1"]
    .getService(Ci.nsICategoryManager);

var rootInfo = {};


var gBrowser = windowUtils.getMostRecentBrowserWindow().getBrowser();


var onSecurityChange = function(webProgress, request, state){
  if(request) {
      var currentBrowser = gBrowser.selectedBrowser;
      var serverCert = currentBrowser.securityUI.SSLStatus.serverCert;
      rootInfo = getRootInfo(serverCert);
      if (rootInfo) {
          getFromDatabase(rootInfo.sha256Fingerprint, function (data) {
              if (typeof(data) == 'undefined') {
                  data = {};
                  data.fingerPrint = rootInfo.sha256Fingerprint;
                  data.name = rootInfo.issuerOrganization;
                  data.times_seen = 1;
                  if (typeof(rootInfo.issuerOrganization) != 'undefined') {
                      notifications.notify({
                          title: "New CA",
                          text: "The CA " + rootInfo.issuerOrganization + " was seen for the first time"
                      });
                  }
              } else {
                  data.times_seen += 1;
              }
              rootInfo.times_seen = data.times_seen;
              updateCA(data);
              CAPanel.port.emit("changeInfo", {"name": rootInfo.issuerOrganization, "times_seen": rootInfo.times_seen});
          });
      }
  }
};

var getRootInfo = function(serverCert){
  if(serverCert.issuer){
    if(serverCert.issuer.isBuiltInRoot){
      return {'issuerOrganization': serverCert.issuer.issuerOrganization,'sha256Fingerprint': serverCert.issuer.sha256Fingerprint};
    }
    return getRootInfo(serverCert.issuer);
  }
  return false;
};

var updateListener = {
  onStateChange:    function(){},
  onProgressChange: function(){},
  onLocationChange: function(){rootInfo = {};},
  onStatusChange:   function(){},
  onSecurityChange: onSecurityChange
};

gBrowser.addProgressListener(updateListener);


/* -- Panel -- */

var ui = require("sdk/ui");
var { ToggleButton } = require('sdk/ui/button/toggle');
var sdkPanels = require("sdk/panel");
var self = require("sdk/self");

var panelButton = ToggleButton({
  id: "panel-button",
  label: "CA Info",
  icon: "./icons/icon.png",
  onChange: handleChange
});

var CAPanel = sdkPanels.Panel({
  contentURL: "./panel/panel.html",
  contentScriptFile: "./panel/panel-content-script.js",
  onHide: handleHide
});

function handleChange(state) {
  if (state.checked) {
      CAPanel.show({
      position: panelButton
    });
  }
}

function handleHide() {
  panelButton.state('window', {checked: false});
}

/* -- IndexedDB -- */

var { indexedDB, IDBKeyRange } = require('sdk/indexed-db');

var database = {};

database.onerror = function(e) {
    console.error(e.value)
};

function openDB(version) {
    var request = indexedDB.open("care", version);

    request.onupgradeneeded = function(e) {
        var db = e.target.result;
        e.target.transaction.onerror = database.onerror;

        if(db.objectStoreNames.contains("CAs")) {
            db.deleteObjectStore("CAs");
        }

        var store = db.createObjectStore("CAs",
            {
                keyPath: "fingerPrint",
            });
    };

    request.onsuccess = function(e) {
        database.db = e.target.result;
    };

    request.onerror = database.onerror;
}
function updateCA(data) {
    var db = database.db;
    var trans = db.transaction(["CAs"], "readwrite");
    var store = trans.objectStore("CAs");
    var request = store.put({
        "fingerPrint": data.fingerPrint,
        "name": data.name,
        "times_seen": data.times_seen
    });
    request.onerror = database.onerror;
}

function getFromDatabase(fingerPrint,callback){
    var db = database.db;
    var transaction = db.transaction(["CAs"], "readwrite");
    var objectStore = transaction.objectStore("CAs");
    var request = objectStore.get(fingerPrint);
    request.onerror = database.onerror;
    request.onsuccess = function(event) {
        var data = event.target.result;
        return callback(data);
    };
}

openDB(1);