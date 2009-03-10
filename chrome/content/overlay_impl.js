/*
 * Copyright 2006-2009 by Massimiliano Mirra
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

