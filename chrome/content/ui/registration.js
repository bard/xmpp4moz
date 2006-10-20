// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var ns_xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
var ns_xulx = 'http://hyperstruct.net/xul-extensions';
var ns_html = 'http://www.w3.org/1999/xhtml';
var ns_data = 'jabber:x:data';
var ns_register = 'jabber:iq:register';

var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};


// GLOBAL STATE
// ----------------------------------------------------------------------

var request;


// GUI INITIALIZATION/FINALIZATION
// ----------------------------------------------------------------------

function init() {
    request = window.arguments[0];
    _('form-container').appendChild(
        xmpp.ui.createRegisterForm(request.query));

    if(request.presets) {
        var xulField = _('form-container', {'xulx:role': 'fields'}).firstChild;
        while(xulField) {
            for(var presetName in request.presets)
                if(presetName == xulField.getAttributeNS(ns_register, 'field') ||
                   presetName == xulField.getAttributeNS(ns_data, 'var'))
                    _(xulField, {'xulx:role': 'value'}).value = request.presets[presetName];

            xulField = xulField.nextSibling;
        }
    }
}

function finish(event) {
    
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function doOk() {
    request.query = xmpp.ui.readRegisterForm(_('form-container').firstChild);
    request.confirm = true;
    return true;
}

function doCancel() {
    return true;
}

