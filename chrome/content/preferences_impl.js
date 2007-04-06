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

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var appInfo =Cc['@mozilla.org/xre/app-info;1']
    .getService(Ci.nsIXULAppInfo);
var prompts = Cc['@mozilla.org/embedcomp/prompt-service;1']
    .getService(Ci.nsIPromptService); 
var pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.account.');

var ns_register = 'jabber:iq:register';


// GLOBAL STATE
// ----------------------------------------------------------------------

var selectedAccountKey;


// GUI UTILITIES (GENERIC)
// ----------------------------------------------------------------------

function _(id) {
    return document.getElementById(id);
}

function v(id) {
    return _(id).value;
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function openServerMap() {
    window.open('https://www.xmpp.net/map/node', 'xmpp-servers-map', '');
}

function refreshAccountList() {
    for(var i=_('xmpp-accounts').getRowCount()-1; i>=0; i--) 
        _('xmpp-accounts').removeItemAt(i);

    XMPP.accounts.forEach(
        function(account) {
            _('xmpp-accounts').appendItem(account.jid, account.key);    
        });
}

function showAccount(accountKey) {
    selectedAccountKey = accountKey;

    function uncamelize(string) {
        return string
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase() 
    }

    _('xmpp-account-message').hidden = true;
    _('xmpp-account-settings').hidden = false;
    var account = XMPP.getAccountByKey(accountKey);

    for each(var accountField in
             ['address', 'password', 'resource', 'autoLogin',
              'connectionHost', 'connectionPort', 'connectionSecurity']) {
        var prefName = account.key + '.' + accountField;
        var elementId = 'xmpp-' + uncamelize(accountField);
            
        var prefValue;
        try {
            prefValue = pref.getCharPref(prefName);
        } catch(e) {
            try {
                prefValue = pref.getIntPref(prefName);
            } catch(e) {
                try {
                    prefValue = pref.getBoolPref(prefName);
                } catch(e) {
                    prefValue = '';
                }
            }
        }

        if(typeof(prefValue) == 'boolean')
            _(elementId).checked = prefValue;
        else
            _(elementId).value = prefValue;
    }
}

function createAccount() {
    var newAccountKey = (new Date()).getTime();
    
    pref.setCharPref(newAccountKey + '.address', 'new.user@sameplace.cc');
    pref.setCharPref(newAccountKey + '.resource', appInfo.name);
    pref.setCharPref(newAccountKey + '.password', '');
    pref.setBoolPref(newAccountKey + '.autoLogin', true);
    pref.setCharPref(newAccountKey + '.connectionHost', 'sameplace.cc');
    pref.setIntPref(newAccountKey + '.connectionPort', 5223);
    pref.setIntPref(newAccountKey + '.connectionSecurity', 1);

    refreshAccountList();
    showAccount(newAccountKey);
}

function deleteAccount(accountKey) {
    // TODO: ask for confirmation here
    accountKey = accountKey || selectedAccountKey;
    if(!accountKey)
        return;

    pref.deleteBranch(accountKey + '.');

    refreshAccountList();
    _('xmpp-account-message').hidden = false;
    _('xmpp-account-settings').hidden = true;
}

function registerAccount(address, host, port, ssl) {
    var jid = address;

    var request = {
        confirm: false,
        query: undefined, 
        presets: {
            username: XMPP.JID(jid).username,
            password: v('xmpp-password')
        }
    };

    XMPP.open(
        jid, { host: host, port: port, ssl: ssl },
        function() {
            XMPP.send(
                jid,
                <iq to={XMPP.JID(jid).hostname} type="get">
                <query xmlns="jabber:iq:register"/>
                </iq>,
                function(reply) {
                    request.query = reply.stanza.ns_register::query;

                    window.openDialog(
                        'chrome://xmpp4moz/content/ui/registration.xul',
                        'xmpp4moz-registration', 'modal,centerscreen',
                        request);
                    
                    if(request.confirm) {
                        var iq = <iq to={XMPP.JID(jid).hostname} type="set"/>;
                        iq.query = request.query;
                        XMPP.send(
                            jid, iq, function(reply) {
                                if(reply.stanza.@type == 'result') 
                                    prompts.alert(
                                        null, 'Registration successful',
                                        'Account successfully registered.');
                                else
                                    prompts.alert(
                                        null, 'Registration error', 
                                        reply.stanza.error.*[0].name().localName.replace(/-/g, ' ') +
                                        ' (' + reply.stanza.error.@code + ')');
                                    
                                XMPP.close(jid);
                            });
                        
                    } else {
                        XMPP.close(jid);
                    }
                });
        });
}


// GUI REACTIONS
// ----------------------------------------------------------------------

function changedField(field) {
    function camelize(string) {
        var parts = string.split('-');
        return parts[0] + 
            parts.slice(1).map(
                function(part) {
                    return part[0].toUpperCase() + part.slice(1);
                }).join();
    }

    var prefName = selectedAccountKey + '.' + camelize(field.id.replace(/^xmpp-/, ''));

    if('checked' in field) 
        pref.setBoolPref(prefName, field.checked);
    else
        try {
            pref.setCharPref(prefName, field.value);
        } catch(e) {
            pref.setIntPref(prefName, parseInt(field.value));
        }
    
    // XXX hackish
    if(field.id == 'xmpp-address') 
        changedField(_('xmpp-connection-host'));
}

function modifiedAddress(address) {
    var server = address.split('@')[1] || '';
    _('xmpp-connection-host').value =
        (server == 'gmail.com' ? 'talk.google.com' : server);
}

function requestedRegisterAccount() {
    registerAccount(v('xmpp-address'),
                    v('xmpp-connection-host'),
                    v('xmpp-connection-port') || 5223,
                    v('xmpp-connection-security') == 1 ? true : false)
}

function selectedAccount() {
    var addressItem = _('xmpp-accounts').selectedItem;
    if(!addressItem)
        return;
    showAccount(addressItem.value);
}
