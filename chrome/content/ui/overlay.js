window.addEventListener(
    'load', function(event) { xmpp4moz.initOverlay(); }, false);

var xmpp4moz = {};
var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};

Components
.classes['@mozilla.org/moz/jssubscript-loader;1']
.getService(Components.interfaces.mozIJSSubScriptLoader)
    .loadSubScript('chrome://xmpp4moz/content/ui/overlay_impl.js', xmpp4moz);