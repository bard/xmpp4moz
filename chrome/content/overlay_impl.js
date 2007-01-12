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

var prefBranch = Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefBranch);
var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Ci.nsIPromptService); 

var ns_muc      = 'http://jabber.org/protocol/muc';

// GLOBAL STATE
// ----------------------------------------------------------------------

var channel;


// INITIALIZATION
// ----------------------------------------------------------------------

function initOverlay() {
    channel = XMPP.createChannel();

    // Show progress bar when waiting for connection

    channel.on(
        { event: 'stream', direction: 'out', state: 'open' },
        function(stream) {
            document
                .getElementById('xmpp-connecting-account').value = stream.session.name;
            document
                .getElementById('xmpp-status').hidden = false;
        });

    // Hiding progress bar when stream is closed

    channel.on(
        { event: 'stream', state: 'close' },
        function(stream) {
            if(document)
                document
                    .getElementById('xmpp-status').hidden = true;
        });

    // Hiding progress bar when authentication is accepted

    channel.on(
        { event: 'iq', direction: 'out', stanza: function(s) {
                return (s.@type == 'set' &&
                        s.*::query.length() > 0 &&
                        s.*::query.name().uri == 'jabber:iq:auth') }},
        function(iq) {
            var reaction = channel.on({
                event: 'iq', direction: 'in', session: iq.session,
                stanza: function(s) { return s.@id == iq.stanza.@id; }},                
                function(reply) {
                    channel.forget(reaction);

                    document.
                        getElementById('xmpp-status').hidden = true;

                    if(reply.stanza.@type == 'error' &&
                       window == Cc["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Ci.nsIWindowMediator)
                       .getMostRecentWindow('navigator:browser')) {
                        var message =
                            'Error during Jabber authentication: ' +
                            reply.stanza.error.*[0].name().localName.replace(/-/g, ' ') +
                            ' (' + reply.stanza.error.@code + ')';
                        prompts.alert(null, 'Error', message);
                        reply.session.close();
                    }
                });
        });

    // Changing availability and show attributes on toolbar button based
    // on a summary of presences of connected accounts.

    channel.on(
        { event: 'presence', direction: 'out', stanza: function(s) {
                return s.@type == undefined && s.ns_muc::x == undefined;
            }},
        function(presence) {
            var summary = XMPP.presenceSummary();
            var button = document.getElementById('xmpp-button');
            button.setAttribute('availability', summary.stanza.@type.toString() || 'available');
            button.setAttribute('show', summary.stanza.show.toString());
        });

    channel.on(
        { event: 'stream', direction: 'out', state: 'close' },
        function(stream) {
            if(XMPP.accounts.every(XMPP.isDown)) {
                var button = document.getElementById('xmpp-button');
                button.setAttribute('availability', 'unavailable');
                button.setAttribute('show', '');
            }
        });
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function disableContent() {
    XMPP.disableContentDocument(getBrowser().selectedBrowser);
}

function refresh() {
    var browser = getBrowser().selectedBrowser;
    var toolbox = document.getElementById('xmpp-toolbox');

    if(browser.hasAttribute('address') &&
       browser.hasAttribute('account')) {
        var toolbar = document.getElementById('xmpp-toolbox-toolbar');
        var tooltip = document.getElementById('xmpp-toolbox-tooltip');        
        toolbar.getElementsByAttribute('role', 'address')[0].value = browser.getAttribute('address');
        tooltip.getElementsByAttribute('role', 'address')[0].value = browser.getAttribute('address');
        tooltip.getElementsByAttribute('role', 'account')[0].value = browser.getAttribute('account');
        toolbox.hidden = false;
    } else
        toolbox.hidden = true;
}

function addToolbarButton() {
    var toolbox = document.getElementById('navigator-toolbox');
    var toolbar = toolbox.getElementsByAttribute('id', 'nav-bar')[0];
        
    if(toolbar &&
       toolbar.currentSet.indexOf('xmpp-button') == -1 &&
       toolbar.getAttribute('customizable') == 'true') {

        toolbar.currentSet = toolbar.currentSet.replace(
            /urlbar-container/,
            'xmpp-button,urlbar-container');
        toolbar.setAttribute('currentset', toolbar.currentSet);
        toolbox.ownerDocument.persist(toolbar.id, 'currentset');
    }
}

function requestedChangeStatus(event) {
    changeStatus(event.target.value);
}


// NETWORK ACTIONS
// ----------------------------------------------------------------------

function changeStatus(type) {
    for each(var account in XMPP.accounts) {
        if(XMPP.isUp(account)) {
            if(type == 'unavailable')
                XMPP.down(account);
            else {
                var stanza;
                for each(var presence in XMPP.cache.presenceOut) 
                    if(presence.session.name == account.jid) {
                        stanza = presence.stanza.copy();
                        break;
                    }

                stanza = stanza || <presence/>;

                switch(type) {
                case 'available':
                    delete stanza.show;
                    break;
                case 'away':
                    stanza.show = <show>away</show>;
                    break;
                case 'dnd':
                    stanza.show = <show>dnd</show>;
                    break;
                }
                XMPP.send(account, stanza);
            }
        }
    }
}


// GUI REACTIONS
// ----------------------------------------------------------------------

window.addEventListener(
    'load', function(event) {
        if(prefBranch.getBoolPref('xmpp.firstInstall')) {
            prefBranch.setBoolPref('xmpp.firstInstall', false);
            addToolbarButton();
        }
    }, false);

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

        getBrowser().addEventListener(
            'DOMAttrModified', function(event) {
                if(event.attrName == 'address')
                    refresh();
            }, false);
    }, false);


// GUI HOOKS
// ----------------------------------------------------------------------

xmpp.ui.selectedAccount = function(accountJid) {
    if(XMPP.isUp(accountJid))
        XMPP.down(accountJid);
    else
        XMPP.up(accountJid);
}
