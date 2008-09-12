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

function init() {
    if(prefBranch.getBoolPref('xmpp.firstInstall'))
        // We used to add the toolbar button here.  No longer doing
        // that, but keeping the check around.
        prefBranch.setBoolPref('xmpp.firstInstall', false);

    // Start watching XMPP traffic

    channel = XMPP.createChannel();

    // Show progress bar when waiting for connection

    channel.on({
        event: 'connector',
        state: 'connecting'
    }, function(stream) {
        document
            .getElementById('xmpp-connecting-account').value = stream.session.name;
        document
            .getElementById('xmpp-status').hidden = false;
    });

    // Hiding progress bar when transport is stopped for any reason

    channel.on({
        event: 'connector',
        state: 'disconnected'
    }, function() {
        document
            .getElementById('xmpp-status').hidden = true;
    });

    // Hiding progress bar when connector has authenticated

    channel.on({
        event: 'connector',
        state: 'active'
    }, function() {
        document
            .getElementById('xmpp-status').hidden = true;
    });
    
    // Report connection error

    channel.on({
        event: 'connector',
        state: 'error'
    }, function(connector) {
        document
            .getElementById('xmpp-status').hidden = true;
        // alert(connector.info.toXMLString());
        // alert(connector.event);
        // alert(connector.state);
        // alert(XMPP.getStreamErrorCondition(connector.info));
        // alert(XMPP.getStreamErrorMessage(XMPP.getStreamErrorCondition(connector.info)));
        // response.stanza.error.*[0].name().localName.replace(/-/g, ' ') +
        // ' (' + response.stanza.error.@code + ')';
    });
}

function finish() {
    channel.release();
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function modifyToolbarButtons(modifier) {
    var toolbar =
        document.getElementById('nav-bar') ||
        document.getElementById('mail-bar') ||
        document.getElementById('mail-bar2');

    if(!toolbar)
        return;

    if(toolbar.getAttribute('customizable') == 'true') {
        var newSet = modifier(toolbar.currentSet);
        if(!newSet)
            return;

        toolbar.currentSet = newSet;
        toolbar.setAttribute('currentset', toolbar.currentSet);
        toolbar.ownerDocument.persist(toolbar.id, 'currentset');
        try { BrowserToolboxCustomizeDone(true); } catch (e) {}
    }
}

function removeToolbarButton(buttonId) {
    modifyToolbarButtons(function(set) {
        if(set.indexOf(buttonId) != -1)
            return set.replace(buttonId, '');
    });
}

function addToolbarButton(buttonId) {
    modifyToolbarButtons(function(set) {
        if(set.indexOf(buttonId) == -1)
            return set.replace(/(urlbar-container|separator)/,
                               buttonId + ',$1');
    });
}


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

