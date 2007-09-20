/*
 * Copyright 2006-2007 by Massimiliano Mirra
 * 
 * This file is part of xmpp4moz.
 * 
 * xmpp4moz is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 * 
 * xmpp4moz is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 * Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
 *  
 */


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
            else if(field.name().localName == 'registered')
                // XXX should give feedback about registration status.
                continue;
            else {
                var xulField = cloneBlueprint('registration-form-field');
                var fieldName = field.name().localName;
                xulField.setAttributeNS(ns_register, 'field', fieldName);
                _(xulField, {'xulx:role': 'label'}).value =
                    fieldName.slice(0,1).toUpperCase() + fieldName.slice(1);
                if(fieldName == 'password')
                    _(xulField, {'xulx:role': 'value'}).setAttribute('type', 'password');
                _(xulField, {'xulx:role': 'value'}).value = field.text();
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
