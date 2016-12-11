/*
Potential problems:
domains loaded on subsequent calls, self signed ssl, multi-process firefox support

Improvements:
Alert when rare CA is seen
Update lamda function, not ES directly
*/

let { Cc, Ci, Cu } = require('chrome');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import("resource://gre/modules/FileUtils.jsm");

const windowUtils = require("sdk/window/utils");
const notifications = require("sdk/notifications");
const CategoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

var { indexedDB, IDBKeyRange } = require('sdk/indexed-db');
var { ToggleButton } = require('sdk/ui/button/toggle');
var prefs = require('sdk/simple-prefs');
var sdkPanels = require("sdk/panel");
var self = require("sdk/self");
var tabs = require("sdk/tabs");
var ui = require("sdk/ui");
var ss = require("sdk/simple-storage");
var Request = require("sdk/request").Request;

var recentLocationChange = 0;
var gBrowser = windowUtils.getMostRecentBrowserWindow().getBrowser();



var onLocationChange = function(webProgress, request,location,flags){
    if(flags !== 1) {
        recentLocationChange = 1;
        var data = {"name": "", "times_seen": ""};
        updatePanel(data);
    }
};

var onSecurityChange = function(webProgress, request, state){
  var currentBrowser = gBrowser.selectedBrowser;
  var serverCert = currentBrowser.securityUI.SSLStatus.serverCert;
  var rootInfo = getRootInfo(serverCert);
  if (rootInfo) {
      getFromDatabase(rootInfo.sha256Fingerprint, function (data) {
          if (typeof(data) == 'undefined') {
              data = {};
              data.fingerprint = rootInfo.sha256Fingerprint;
              data.name = rootInfo.issuerOrganization;
              data.times_seen = 1;
              data.alert_status = 'default';
              //Alert if CA is new and option is enabled
              if (prefs.prefs['alert_on_new']) {
                  notifications.notify({
                      title: "New CA",
                      text: "The CA " + rootInfo.issuerOrganization + " was seen for the first time"
                  });
              }
              reportCA(data);
          } else if(request && recentLocationChange){
              if(data.alert_status == 'always'){
                  notifications.notify({
                      title: "CA Alert",
                      text: "This site uses the CA " + data.name
                  });
              }
              data.times_seen += 1;
              reportCA(data);
          }
          recentLocationChange = 0;
          updateCA(data);
          updatePanel(data);
      });
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
  onLocationChange: onLocationChange,
  onStatusChange:   function(){},
  onSecurityChange: onSecurityChange
};

gBrowser.addProgressListener(updateListener);


/* -- Panel -- */
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

function updatePanel(data){
    CAPanel.port.emit("changeInfo", {"name": data.name, "times_seen": data.times_seen});
}

CAPanel.port.on("openStatsPage",function(){
    openStats();
});

/* -- Stats Tab -- */
function openStats() {
    tabs.open({
        url: self.data.url("stats/stats.html"),
        onLoad: function(tab){
            var worker = tab.attach({
                contentScriptFile: "./stats/stats-content-script.js"
            });
            getAllFromDatabase(function(data){
                data.sort(function(a, b){
                    return b.times_seen-a.times_seen
                });
                worker.port.emit("populateStatsTable",data);
                worker.port.on("updateAlertStatus", function(e) {
                    getFromDatabase(e.fingerprint, function (data) {
                        if (typeof(data) != 'undefined') {
                            data.alert_status = e.value;
                            updateCA(data);
                        }
                    });
                });
            });
        }
    });
}


/* -- IndexedDB -- */
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
                keyPath: "fingerprint",
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
        "fingerprint": data.fingerprint,
        "name": data.name,
        "times_seen": data.times_seen,
        "alert_status": data.alert_status
    });
    request.onerror = database.onerror;
}

function getFromDatabase(fingerprint,callback){
    var db = database.db;
    var transaction = db.transaction(["CAs"], "readwrite");
    var objectStore = transaction.objectStore("CAs");
    var request = objectStore.get(fingerprint);
    request.onerror = database.onerror;
    request.onsuccess = function(event) {
        var data = event.target.result;
        return callback(data);
    };
}
function getAllFromDatabase(callback){
    var db = database.db;
    var transaction = db.transaction(["CAs"], "readwrite");
    var objectStore = transaction.objectStore("CAs");
    var request = objectStore.getAll();
    request.onerror = database.onerror;
    request.onsuccess = function(event) {
        var data = event.target.result;
        return callback(data);
    };
}

openDB(1);

/*-- Statistics Reporting --*/
//Set user ID
if(typeof(ss.storage.user_id) == 'undefined') {
    ss.storage.user_id = Math.floor(Math.random() * Math.pow(10, 16));
}

function reportCA(data){
    if (prefs.prefs['report_cas']) {
        var timestamp = Date.now();
        var json = {
            "timestamp": timestamp,
            "user_id": ss.storage.user_id,
            "name" : data.name,
            "fingerprint" : data.fingerprint
        };
        var endpoint = "/ca/entry/"+timestamp;
        Request({
            url: endpoint,
            content: JSON.stringify(json),
        }).put();
    }
}