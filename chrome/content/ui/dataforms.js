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

var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};

var ns_xulx = 'http://hyperstruct.net/xul-extensions';
var ns_data = 'jabber:x:data';


// GUI UTILITIES (SPECIFIC)
// ----------------------------------------------------------------------

/**
 * Returns a XUL fragment representing a form based on the given
 * jabber:x:data (see XEP-0004).
 *
 * Relies on:
 *   - cloneBlueprint()
 *   - presence of following blueprints: data-form, data-form-field-* 
 *
 */

xmpp.ui.createDataForm = function(form) {
    if(form.namespace() != ns_data)
        throw new Error('Wrong data namespace. (' + form.namespace() + ')');
            
    function listSelect(xulList, value) {
        setTimeout(
            function() {
                xulList.addItemToSelection(
                    xulList.getElementsByAttribute('value', value)[0]);
            }, 0);
    }

    var xulForm = cloneBlueprint('data-form');
    _(xulForm, {'xulx:role': 'title'}).value = form.ns_data::title;
    _(xulForm, {'xulx:role': 'instructions'}).textContent = form.ns_data::instructions;

    for each(var field in form.ns_data::field) {
        if(field.ns_data::desc != undefined) {
            
        }
        var xulField = cloneBlueprint('data-form-field-' + field.@type);

        xulField.setAttributeNS(ns_data, 'var', field.@var);
        xulField.setAttributeNS(ns_data, 'type', field.@type);        
        if(field.ns_data::required.length() > 0) 
            xulField.setAttributeNS(ns_data, 'required', 'true');
        
        if(field.@label != undefined)
            _(xulField, {'xulx:role': 'label'}).value = field.@label;        
        if(field.ns_data::desc != undefined) {
            _(xulField, {'xulx:role': 'desc'}).textContent = field.ns_data::desc;
            _(xulField, {'xulx:role': 'desc'}).hidden = false;
        }

        switch(field.@type.toString()) {
        case 'text-single':
        case 'text-private':
            _(xulField, {'xulx:role': 'value'}).value = field.ns_data::value;
            break;

        case 'text-multi':
            for each(var value in field.ns_data::value)
                _(xulField, {'xulx:role': 'value'}).value += value + '\n';
            break;

        case 'fixed':
            _(xulField, {'xulx:role': 'value'}).textContent = field.ns_data::value;
            break;

        case 'hidden':
            _(xulField, {'xulx:role': 'value'}).value = field.ns_data::value;
            break;
            
        case 'boolean':
            _(xulField, {'xulx:role': 'value'}).checked =
                (field.ns_data::value == 1 ? true : false);
            break;

        case 'list-single':
        case 'list-multi':
            for each(var option in field.ns_data::option) 
                _(xulField, {'xulx:role': 'value'}).appendItem(
                    option.@label, option.ns_data::value);

            for each(var value in field.ns_data::value)
                listSelect(_(xulField, {'xulx:role': 'value'}), value)

            break;

        case 'jid-multi':
            for each(var value in field.ns_data::value)
                _(xulField, {'xulx:role': 'value'}).appendItem(value, value);
            break;

        default:
            break;
        }
        _(xulForm, {'xulx:role': 'fields'}).appendChild(xulField);
    }

    return xulForm;
};

/**
 * Retrieves data from a form generated by createDataForm, returning
 * it as an XML object suitable for form submission.
 *
 * Relies on: 
 *   Nothing.
 *
 */

xmpp.ui.readDataForm = function(xulForm) {
    var form = <x xmlns="jabber:x:data" type="submit"/>;
    var xulField = _(xulForm, {'xulx:role': 'fields'}).firstChild;

    while(xulField) {
        if(xulField.getAttributeNS(ns_data, 'type') != 'fixed') {
            var field = <field/>;
            field.@var = xulField.getAttribute('var');
            field.@type = xulField.getAttribute('type');

            var xulValue = _(xulField, {'xulx:role': 'value'});

            switch(field.@type.toString()) {
            case 'hidden':
            case 'jid-single':
            case 'text-single':
            case 'text-private':
                if(xulValue.value)
                    field.value = xulValue.value;
                break;
                
            case 'text-multi':
                for each(var line in xulValue.value.split('\n'))
                    if(line != '')
                        field.value[field.value.length()] = line;
                break;

            case 'jid-multi':
            case 'list-multi':
            case 'list-single':
                for each(var xulItem in xulValue.selectedItems)
                    field.value[field.value.length()] = xulItem.value;
                break;

            case 'boolean':
                var value = xulValue.checked ? 1 : 0;
                field.value = value;

                break;
            }

            if(xulField.getAttributeNS(ns_data, 'required') == 'true' &&
               field.value == undefined) {
                var label = _(xulField, {'xulx:role': 'label'});
                throw new Error('Field "' +
                                (label ? label.value : xulField.getAttributeNS(ns_data, 'var')) +
                                '" is required.');
            }

            form.field[form.field.length()] = field;
        }
        xulField = xulField.nextSibling;
    }
    return form;
};