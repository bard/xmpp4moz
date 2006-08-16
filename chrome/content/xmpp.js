var XMPP = {};

Components
.classes['@mozilla.org/moz/jssubscript-loader;1']
.getService(Components.interfaces.mozIJSSubScriptLoader)
    .loadSubScript('chrome://xmpp4moz/content/service/jsapi.js', XMPP);
