/*
Potential problems:
domains loaded on subsequent calls, self signed ssl, multi-process firefox support

Improvements:
How many times has the cert been seen

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
  var currentBrowser = gBrowser.selectedBrowser;
  var serverCert = currentBrowser.securityUI.SSLStatus.serverCert;
  rootInfo = getRootInfo(serverCert);
  if(rootInfo) {
    //Do stuff with root info (populate panel...)
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

var myPanel = sdkPanels.Panel({
  contentURL: "./panel/panel.html",
  contentScriptFile: "./panel/panel-content-script.js",
  onHide: handleHide
});

function handleChange(state) {
  if (state.checked) {
    myPanel.show({
      position: panelButton
    });
    myPanel.port.emit("changeInfo", rootInfo.issuerOrganization);
  }
}

function handleHide() {
  panelButton.state('window', {checked: false});
}
