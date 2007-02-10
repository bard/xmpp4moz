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


// GLOBAL STATE
// ----------------------------------------------------------------------

var prefBranch = Components
    .classes["@mozilla.org/preferences-service;1"]
    .getService(Components.interfaces.nsIPrefService)
    .getBranch("xmpp.account.")
    .QueryInterface(Components.interfaces.nsIPrefBranch2);

var request;


// INITIALIZATION
// ----------------------------------------------------------------------

function init() {
    request = window.arguments[0];
    
    _('main').getButton('accept').disabled = true;
    _('main').getButton('extra1').addEventListener(
        'command', configureAccounts, false);

    prefBranch.addObserver('', prefObserver, false);

    xmpp.ui.refreshAccounts(_('xmpp-popup-accounts'));
    
    var accounts = XMPP.accounts;
    if(request.jid) {
        for each(var account in accounts) {
            if(request.jid == account.jid) {
                _('account-name').hidden = false;
                _('account-name').value = request.jid;
                selectedAccount(account.jid);
                break;
            }
        }
    } else {
        _('accounts').hidden = false;
        for each(var account in accounts) {
            if(XMPP.isUp(account.jid)) {
                _('accounts').value = account.jid;
                break;
            }
        }
        if(!_('accounts').value)
            _('accounts').value = accounts[0].jid;
        selectedAccount(_('accounts').value);
    }
}

function finish() {
    prefBranch.removeObserver('', prefObserver);
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function configureAccounts() {
    Components
        .classes["@mozilla.org/appshell/window-mediator;1"]
        .getService(Components.interfaces.nsIWindowMediator)
        .getMostRecentWindow("navigator:browser")
        .openPreferences('xmpp-pane');
}


// ----------------------------------------------------------------------
// REACTIONS

function selectedAccount(jid) {
    _('main').getButton('accept').disabled = false;
    if(XMPP.isUp(jid)) {
        _('password-area').hidden = true;
        _('already-connected').hidden = false;
    } else {        
        _('password-area').hidden = false;
        _('already-connected').hidden = true;
    }
}

function doOk() {
    request.jid = request.jid || _('accounts').value;
    request.password = _('password').value;
    request.confirm = true;

    return true;
}

function doCancel() {
    return true;
}

var prefObserver = {
    observe: function(subject, topic, data) {
        refreshAccountList();
    }
};


// ----------------------------------------------------------------------
// UTILITIES

function _(id) {
    return document.getElementById(id);
}

function deleteChildren(container) {
    var i = container.childNodes.length - 1;
    while(i >= 0) {
        var child = container.childNodes[i];
        container.removeChild(child);
        i--;
    }
}

