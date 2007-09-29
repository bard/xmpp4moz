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

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var prefBranch = Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefBranch);
var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Ci.nsIPromptService); 

var ns_muc      = 'http://jabber.org/protocol/muc';
var ns_auth     = 'jabber:iq:auth';


// GLOBAL STATE
// ----------------------------------------------------------------------

var channel;


// GUI UTILITIES
// ----------------------------------------------------------------------

function _(id) {
    return document.getElementById('xmpp-' + id);
}


// INITIALIZATION
// ----------------------------------------------------------------------

function initOverlay() {
    if(prefBranch.getBoolPref('xmpp.firstInstall')) {
        addToolbarButton();
        prefBranch.setBoolPref('xmpp.firstInstall', false);
    }

    // Start watching XMPP traffic

    channel = XMPP.createChannel();

    // Show progress bar when waiting for connection

    channel.on({
        event     : 'stream',
        direction : 'out',
        state     : 'open'
    }, function(stream) {
        document
        .getElementById('xmpp-connecting-account').value = stream.session.name;
        document
        .getElementById('xmpp-status').hidden = false;
    });

    // Hiding progress bar when transport is stopped for any reason

    channel.on({
        event: 'transport',
        state: 'stop'
    }, function(transport) {
        if(document)
            document.getElementById('xmpp-status').hidden = true;
    });
    
    // Hiding progress bar when stream is closed

    channel.on({
        event: 'stream',
        state: 'close'
    }, function(stream) {
        if(document)
            document
        .getElementById('xmpp-status').hidden = true;
    });

    // Hiding progress bar when authentication is accepted

    channel.on({
        event     : 'iq',
        direction : 'out',
        stanza: function(s) { return s.@type == 'set' && s.ns_auth::query != undefined; }
    }, function(request) {

        // To know whether authentication was successful or not,
        // we must track the response iq.  However, we cannot
        // track by means of a <query xmlns="jabber:iq:auth"/>
        // because it has none, so we catch the outgoing auth
        // request instead, note its "id", and register a one-time
        // reaction to handle the response to it.
        
        var authReaction = channel.on({
            event  : 'iq', direction: 'in',
            account: request.account,
            stanza : function(s) { return s.@id == request.stanza.@id; }
        }, function(response) {
            channel.forget(authReaction);
            
            document.getElementById('xmpp-status').hidden = true;
            
            if(response.stanza.@type == 'error' &&
               window == Cc["@mozilla.org/appshell/window-mediator;1"]
               .getService(Ci.nsIWindowMediator)
               .getMostRecentWindow('navigator:browser')) {
                var message =
                    'Error during Jabber authentication: ' +
                    response.stanza.error.*[0].name().localName.replace(/-/g, ' ') +
                    ' (' + response.stanza.error.@code + ')';
                prompts.alert(null, 'Error', message);
                response.session.close();
            }
        });
    });

    // Changing availability and show attributes on toolbar button based
    // on a summary of presences of connected accounts.

    channel.on({
        event: 'presence',
        direction: 'out',
        stanza: function(s) {
            return s.@type == undefined && s.ns_muc::x == undefined;
        }
    }, function(presence) {
        updateStatusIndicator();
    });

    // Reset main button to unavailable icon when every account is
    // offline.

    channel.on({
        event: 'stream',
        direction: 'out',
        state: 'close'
    }, function(stream) {
        updateStatusIndicator();
    });

    connectAutologinAccounts();
    updateStatusIndicator();
}


// GUI ACTIONS
// ----------------------------------------------------------------------

/**
 * Update the status indicator in the toolbar.  Status is determined
 * by querying the presence cache.
 *
 */

function updateStatusIndicator() {
    var summary = XMPP.presenceSummary();
    _('button').setAttribute('availability',
                             summary.stanza.@type.toString() || 'available');
    _('button').setAttribute('show', summary.stanza.show.toString());    
}

function addToolbarButton() {
    var toolbar =
        document.getElementById('nav-bar') ||
        document.getElementById('mail-bar') ||
        document.getElementById('mail-bar2');

    if(!toolbar)
        return;
        
    if(toolbar &&
       toolbar.currentSet.indexOf('xmpp-button') == -1 &&
       toolbar.getAttribute('customizable') == 'true') {

        toolbar.currentSet = toolbar.currentSet.replace(
            /(urlbar-container|separator)/,
            'xmpp-button,$1');
        toolbar.setAttribute('currentset', toolbar.currentSet);
        toolbar.ownerDocument.persist(toolbar.id, 'currentset');
        try { BrowserToolboxCustomizeDone(true); } catch (e) {}
    }
}

function requestedChangeStatus(event) {
    changeStatus(event.target.value);
}

// XXX paneID is currently ignored (needs to be fixed in preferences.xul)

function openPreferences(paneID) {
    var instantApply;
    try {
        instantApply = prefBranch.getBoolPref('browser.preferences.instantApply', false);
    } catch(e) {
        instantApply = false;
    }
        
    var features = 'chrome,titlebar,toolbar,centerscreen' +
        (instantApply ? ',dialog=no' : ',modal');
    
    var wm = Cc['@mozilla.org/appshell/window-mediator;1']
    .getService(Ci.nsIWindowMediator);
    
    var win = wm.getMostRecentWindow('XMPP:Preferences');
    
    if(win) {
        win.focus();
        if(paneID) {
            var pane = win.document.getElementById(paneID);
            win.document.documentElement.showPane(pane);
        }
    } else {
        window.openDialog('chrome://xmpp4moz/content/preferences.xul',
                          'XMPP Preferences', features, paneID);
    }
}


// NETWORK ACTIONS
// ----------------------------------------------------------------------

/**
 * Bring up accounts configured as "autoLogin".
 *
 */

function connectAutologinAccounts() {
    XMPP.accounts
    .filter(function(a) {
        return a.autoLogin && !XMPP.isUp(a);
    })
    .forEach(function(a) {
        XMPP.up(a);
    });
}

function changeStatus(type) {
    var accountsUp = XMPP.accounts.filter(XMPP.isUp);

    if(accountsUp.length == 0) {
        if(type == 'available')
            XMPP.accounts.forEach(XMPP.up);
    } else {
        accountsUp.forEach(
            function(account) {
                if(type == 'unavailable')
                    XMPP.down(account);
                else {
                    var existingPresenceStanza =
                        XMPP.cache.fetch({
                            event     : 'presence',
                            account   : account.jid,
                            direction : 'out',
                            stanza    : function(s) {
                                return s.ns_muc::x == undefined;
                            }
                        })[0];
                    
                    var newPresenceStanza = (existingPresenceStanza ?
                                             existingPresenceStanza.stanza.copy() :
                                             <presence/>);
                    switch(type) {
                    case 'available':
                        delete newPresenceStanza.show;
                        break;
                    case 'away':
                        newPresenceStanza.show = <show>away</show>;
                        break;
                    case 'dnd':
                        newPresenceStanza.show = <show>dnd</show>;
                        break;
                    }
                    XMPP.send(account, newPresenceStanza);
                }
            });
    }
}


// GUI REACTIONS
// ----------------------------------------------------------------------

function selectedAccount(event) {
    var accountJid = event.target.value;
    if(XMPP.isUp(accountJid))
        XMPP.down(accountJid);
    else
        XMPP.up(accountJid);
};


// BROWSER HANDLING
// ----------------------------------------------------------------------

if(typeof(getBrowser) == 'function' && getBrowser().selectedBrowser) {

    // GUI REACTIONS
    // ----------------------------------------------------------------------

    var locationChangeListener = {
        QueryInterface: function(aIID) {
            if(aIID.equals(Ci.nsIWebProgressListener) ||
               aIID.equals(Ci.nsISupportsWeakReference) ||
               aIID.equals(Ci.nsISupports))
                return this;
            throw Cr.NS_NOINTERFACE;
        },
        onLocationChange: function(aProgress, aRequest, aURI) {
            refresh();
        },
        onStateChange: function(aProgress, aRequest, aStateFlags, aStatus) {},
        onProgressChange: function() {},
        onStatusChange: function() {},
        onSecurityChange: function() {},
        onLinkIconAvailable: function() {}
    };

    window.addEventListener(
        'load', function(event) {
            getBrowser().addProgressListener(locationChangeListener);

            getBrowser().addEventListener('DOMAttrModified', function(event) {
                if(event.attrName == 'address')
                    refresh();
            }, false);
        }, false);


    // GUI ACTIONS
    // ----------------------------------------------------------------------

    function disableContent() {
        XMPP.disableContentDocument(getBrowser().selectedBrowser);
    }

    function refresh() {
        var browser = getBrowser().selectedBrowser;

        if(browser.hasAttribute('address') &&
           browser.hasAttribute('account')) {
            _('toolbox-toolbar').getElementsByAttribute('role', 'address')[0]
                .value = browser.getAttribute('address');
            _('toolbox-tooltip').getElementsByAttribute('role', 'address')[0]
                .value = browser.getAttribute('address');
            _('toolbox-tooltip').getElementsByAttribute('role', 'account')[0]
                .value = browser.getAttribute('account');
            _('toolbox').hidden = false;
        } else
            _('toolbox').hidden = true;
    }
}

