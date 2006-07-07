/*
 * This file should be loaded into the prototype of a Javascript XPCOM
 * component, and init should be called.
 *
 * It makes a multi-session XMPP client available application-wide.
 *
 */

function init() {
    function forward(src, name, dst) {
        src[name] = function() {
            return dst[name].apply(dst, arguments);
        }
    }

    Components
        .classes['@mozilla.org/moz/jssubscript-loader;1']
        .getService(Components.interfaces.mozIJSSubScriptLoader)
        .loadSubScript('chrome://mozeskine/content/module_manager.js');
    
    var Client = (new ModuleManager())
        .require('class', 'client');

    var client = new Client();

    for each(var name in ['signOn', 'signOff', 'send', 'on', 'addObserver', 'removeObserver'])
        forward(this, name, client);
}