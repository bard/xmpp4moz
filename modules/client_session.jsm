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


// EXPORTS
// ----------------------------------------------------------------------

var EXPORTED_SYMBOLS = [
    'Session'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;


// API
// ----------------------------------------------------------------------

function Session(account) {
    this._idPrefix = '_' + Date.now().toString();
    this._idCounter = 1000;
    this._pending = {};
    this._observer = null;
    this._account = account;
}

Session.prototype.__defineGetter__('name', function() {
    return this._account; // XXX transitional
});

Session.prototype.send = function(element, replyObserver) {
    if(!element.getAttribute('id'))
        element.setAttribute('id', this._idPrefix + this._idCounter++);

    if(replyObserver)
        this._pending[element.getAttribute('id')] = replyObserver;

    try {
        this._observer.observe(setMeta(element, this._account, 'out'),
                               'stanza-out',
                               this.name);
    } catch(e) {
        Cu.reportError(e);
    }
};

Session.prototype.receive = function(element) {
    try {
        this._observer.observe(setMeta(element, this._account, 'in'),
                               'stanza-in',
                               this.name);
    } catch(e) {
        Cu.reportError(e);
    }

    var id = element.getAttribute('id');
    if(this._pending[id])
        try {
            this._pending[id].observe(element, 'reply-in', this.name);
        } catch(e) {
            Cu.reportError(e);
        } finally {
            delete this._pending[id];
        }
};

Session.prototype.setObserver = function(observer) {
    if(this._observer)
        throw new Error('Observer already set.');
    this._observer = observer;
};

// INTERNALS
// ----------------------------------------------------------------------

function setMeta(domStanza, account, direction) {
    var outDomStanza = stripMeta(domStanza);
    outDomStanza.setAttributeNS('http://hyperstruct.net/xmpp4moz/protocol/internal', 'account', account);
    outDomStanza.setAttributeNS('http://hyperstruct.net/xmpp4moz/protocol/internal', 'direction', direction);
    return outDomStanza;
}

function stripMeta(domStanza) {
    var outDomStanza = domStanza.cloneNode(true);
    outDomStanza.removeAttributeNS('http://hyperstruct.net/xmpp4moz/protocol/internal', 'account');
    outDomStanza.removeAttributeNS('http://hyperstruct.net/xmpp4moz/protocol/internal', 'direction');
    return outDomStanza;
}
