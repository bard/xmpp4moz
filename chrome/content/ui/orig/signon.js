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

var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;


// GLOBAL STATE
// ----------------------------------------------------------------------

var prefBranch = Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefService)
    .getBranch("xmpp.account.")
    .QueryInterface(Ci.nsIPrefBranch2);

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
        var account = XMPP.getAccountByJid(request.jid);
        if(account) {
            _('account-name').hidden = false;
            _('account-name').value = request.jid;
            selectedAccount(account.jid);
        }
    } else {
        _('accounts').hidden = false;
        var result;
        XMPP.accounts.forEach(
            function(account) {
                if(result)
                    return;
                if(XMPP.isUp(account))
                    result = account;
            });
        _('accounts').value = result ? result.jid : accounts[0].jid;

        selectedAccount(_('accounts').value);
    }
}

function finish() {
    prefBranch.removeObserver('', prefObserver);
}

//SI (AMO) Compatibility
/*
// GUI ACTIONS
// ----------------------------------------------------------------------

// XXX Redundant with and dependent on SamePlace code -- wrong, but no
// better solution in sight.

function openPreferences(paneID) {
    var instantApply;
    try {
        instantApply = Cc['@mozilla.org/preferences-service;1']
            .getService(Ci.nsIPrefBranch)
            .getBoolPref('browser.preferences.instantApply');
    } catch(e) {
        instantApply = false;
        Cu.reportError(e);
    }
        
    var features = 'chrome,titlebar,toolbar,centerscreen' +
        (instantApply ? ',dialog=no' : '');
    
    var prefWindow = Cc['@mozilla.org/appshell/window-mediator;1']
        .getService(Ci.nsIWindowMediator)
        .getMostRecentWindow('SamePlace:Preferences');
    
    if(prefWindow) {
        prefWindow.focus();
        if(paneID) {
            var pane = prefWindow.document.getElementById(paneID);
            prefWindow.document.documentElement.showPane(pane);
        }
    } else {
        window.openDialog('chrome://sameplace/content/preferences/preferences.xul',
                          'SamePlace:Preferences', features, paneID);
    }
}

function configureAccounts() {
    openPreferences();
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
        _('password').value = XMPP.accounts.filter(function(a) {
            return a.jid == jid;
        })[0].password || '';
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
        xmpp.ui.refreshAccounts(_('xmpp-popup-accounts'));
    }
};
*/
//SI END

// ----------------------------------------------------------------------
// UTILITIES

function _(id) {
    return document.getElementById(id);
}


