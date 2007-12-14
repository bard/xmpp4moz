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


// INITIALIZATION
// ----------------------------------------------------------------------

function init(name) {
    this._isOpen = false;
    this._idCounter = 1000;
    this._pending = {};
    this._observer = null;
    this._name = name;

    this.__defineGetter__('name', function() {
        return this._name;
    });
}


// PUBLIC INTERFACE - SESSION MANAGEMENT AND DATA EXCHANGE
// ----------------------------------------------------------------------

function open(server) {
    throw new Error('Deprecated!');
}

function close() {
    throw new Error('Deprecated!');
}

function isOpen() {
    throw new Error('Deprecated!');
}

function send(element, replyObserver) {
    element.setAttribute('id', this._idCounter++);

    if(replyObserver)
        this._pending[element.getAttribute('id')] = replyObserver;
    
    this.notifyObservers(setMeta(element, this.name, 'out'),
                         'stanza-out',
                         this.name);
}

function receive(element) {
    this.notifyObservers(setMeta(element, this.name, 'in'),
                         'stanza-in',
                         this.name);

    var id = element.getAttribute('id');
    if(this._pending[id])
        try {
            this._pending[id].observe(element, 'reply-in', this.name);
        } catch(e) {
            Cu.reportError(e);
        } finally {
            delete this._pending[id];
        }
}

function addObserver(observer) {
    if(this._observer)
        throw new Error('Only one observer allowed.');
    this._observer = observer;
}

function removeObserver(observer) {
    if(observer != this._observer)
        throw new Error('Observer not recognized.');
    this._observer = null;
}


// INTERNALS
// ----------------------------------------------------------------------

function notifyObservers(subject, topic, data) {
    try {
        this._observer.observe(subject, topic, data);
    } catch(e) {
        Cu.reportError(e);
    }
}


function getStackTrace() {
    var frame = Components.stack.caller;
    var str = "<top>";

    while (frame) {
        str += '\n' + frame;
        frame = frame.caller;
    }

    return str;
}

function setMeta(domStanza, account, direction) {
    var outDomStanza = stripMeta(domStanza);

    var meta = domStanza
        .ownerDocument
        .createElementNS('http://hyperstruct.net/xmpp4moz/protocol/internal', 'meta');
    meta.setAttribute('account', account);
    meta.setAttribute('direction', direction);
    outDomStanza.appendChild(
        outDomStanza.ownerDocument.importNode(meta, true));
    return outDomStanza;
}

function stripMeta(domStanza) {
    var outDomStanza = domStanza.cloneNode(true);
    var metas = outDomStanza.getElementsByTagNameNS('http://hyperstruct.net/xmpp4moz/protocol/internal', 'meta');
    for(var i=0; i<metas.length; i++)
        outDomStanza.removeChild(metas[i]);
    return outDomStanza;
}
