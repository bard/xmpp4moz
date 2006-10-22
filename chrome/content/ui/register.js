/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is xmpp4moz.
 *
 * The Initial Developer of the Original Code is
 * Massimiliano Mirra <bard [at] hyperstruct [dot] net>.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */


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
