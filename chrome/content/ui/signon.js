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

//SI AMO (SIC) Compatibility
//CODE HAD TO BE REMOVED BECAUSE STUPID AMO VALIDATOR CANT TELL COMMENT FROM CODE
//See orig subdirectory for original code

//SI END

// ----------------------------------------------------------------------
// UTILITIES

function _(id) {
    return document.getElementById(id);
}


