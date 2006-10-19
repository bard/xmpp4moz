// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var ns_xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
var ns_xulx = 'http://hyperstruct.net/xul-extensions';
var ns_html = 'http://www.w3.org/1999/xhtml';
var ns_data = 'jabber:x:data';
var ns_register = 'jabber:iq:register';

var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};


// GUI UTILITIES (SPECIFIC)
// ----------------------------------------------------------------------

xmpp.ui.createRegisterForm = function(registerQuery) {
    var data = registerQuery.ns_data::x;
    if(data.length() > 0) 
        return xmpp.ui.createDataForm(data);
    else {
        var xulForm = cloneBlueprint('registration-form');
        for each(var field in registerQuery.*) {
            if(field.name().localName == 'instructions')
                _(xulForm, {'xulx:role': 'instructions'}).textContent = field.toString();
            else {
                var xulField = cloneBlueprint('registration-form-field');
                var fieldName = field.name().localName;
                xulField.setAttributeNS(ns_register, 'field', fieldName);
                _(xulField, {'xulx:role': 'label'}).value =
                    fieldName.slice(0,1).toUpperCase() + fieldName.slice(1);
                if(fieldName == 'password')
                _(xulField, {'xulx:role': 'value'}).setAttribute('type', 'password');
                _(xulForm, {'xulx:role': 'fields'}).appendChild(xulField);
            }
        } 
        return xulForm;
    }
};

xmpp.ui.readRegisterForm = function(xulForm) {
    var query = <query xmlns="jabber:iq:register"/>;

    switch(xulForm.getAttributeNS(ns_xulx, 'role')) {
    case 'data-form':
        query.x = xmpp.ui.readDataForm(xulForm);
        return query;        
        break;
    case 'registration-form':
        var xulField = _(xulForm, {'xulx:role': 'fields'}).firstChild;
        while(xulField) {
            var fieldName = xulField.getAttributeNS(ns_register, 'field');
            var fieldValue = _(xulField, {'xulx:role': 'value'}).value;
            query[fieldName] = <{fieldName}>{fieldValue}</{fieldName}>;
            xulField = xulField.nextSibling;
        }
        return query;
        break;
    }
};
