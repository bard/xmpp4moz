/*
  Copyright (C) 2005-2006 by Massimiliano Mirra

  This program is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation; either version 2 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301 USA

  Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
*/


/**
 * The session object sits between the network and the user, mediating
 * exchange of XMPP stanzas between the two and doing some bookkeeping
 * in the meanwhile, like stamping each outgoing stanza with an ID,
 * and remembering what handler to run when a reply to a specific
 * stanza is received.
 *
 * Input from the network is expected to be fed to the receive()
 * method and user should listen for it via the {tag: 'data',
 * direction: 'in'} event.  Input from the user is expected to be fed
 * to the send() method and network should listen for it via the {tag:
 * 'data', direction: 'out'} event.
 *
 */

var Parser      = module.require('class', 'parser');
var event       = module.require('package', 'lib/event_handling');
var converter   = Components.
    classes["@mozilla.org/intl/scriptableunicodeconverter"].
    getService(Components.interfaces.nsIScriptableUnicodeConverter);
converter.charset = 'UTF-8';

function constructor() {
    this._preWatches = [];
    this._postWatches = [];
    this._isOpen = false;
    this._idCounter = 1000;
    this._parser = new Parser();
    this._pending = {};

    var session = this;
    this._parser.on(
        'start', function() {
            session._stream('start');
        },
        'stop', function() {
            session._stream('stop');
        },
        'stanza', function(stanzaDOMElement) {
            session._stanza(
                'in', new XML(
                    (new XMLSerializer()).serializeToString(stanzaDOMElement)));
        });
}

// ----------------------------------------------------------------------
// CONTEXT

function open(server) {
    if(this._isOpen)
        throw new Error('Session already opened.');

    this.send('<?xml version="1.0"?>' +
              '<stream:stream xmlns="jabber:client" ' +
              'xmlns:stream="http://etherx.jabber.org/streams" ' +
              'to="' + server + '">');
    this._isOpen = true;
}
open.doc = 'Send the stream prologue.';

function close() {
    if(!this._isOpen)
        throw new Error('Session already closed.');

    this._isOpen = false;        
    this.send('</stream:stream>');
}
close.doc = 'Send the stream epilogue.';

function isOpen() {
    return this._isOpen;
}

// ----------------------------------------------------------------------
// INPUT

function send(data, handler) {
    if(typeof(data) == 'xml')
        this._stanza('out', data, handler);
    else
        this._data('out', data);
}
send.doc = 'Send text or XML to the other side.  If XML, it is stamped with an \
incrementing counter, and an optional reply handler is associated.  The  \
data is not actually sent since the session has no notion of transports \
internally, but resurfaces as plain text in the {tag: "data", direction: "out"} \
event so that it can be passed to a transport there.';

function receive(data) {
    if(typeof(data) == 'xml')
        this._stanza('in', data);
    else
        this._data('in', data);
}
receive.doc = 'Receive text or XML from the other side.';
    
// ----------------------------------------------------------------------
// OUTPUT

function on(pattern, handler) {
    this._postWatches.push({pattern: pattern, handler: handler});
}

function before(pattern, handler) {
    this._preWatches.push({pattern: pattern, handler: handler});    
}

// ----------------------------------------------------------------------
// INTERNALS

function _stream(state) {
    switch(state) {
    case 'start':
        break;
    case 'stop':
        break;
    }
}

function _data(direction, data) {
    data = converter[direction == 'in' ?
                     'ConvertToUnicode' : 'ConvertFromUnicode'](data);

    event._handle1(
        {direction: direction, tag: 'data', content: data},
        this._preWatches, event._match1);

    if(direction == 'in')
        this._parser.parse(data);

    event._handle1(
        {direction: direction, tag: 'data', content: data},
        this._postWatches, event._match1);
}

function _stanza(direction, stanza, handler) {
    event._handle1(
        {direction: direction, tag: stanza.name(), stanza: stanza, session: this},
        this._preWatches, event._match1);

    switch(direction) {
    case 'in':
        var id = stanza.@id;
        if(this._pending[id]) {
            this._pending[id]({session: this, stanza: stanza}); // ADD TAG HERE
            delete this._pending[id];
        }
        // if(stanza.*::query.length() > 0) {
        //     var nameSpace = stanza.*::query.namespace().toString();
        break;
    case 'out':
        stanza.@id = this._idCounter++;
        if(handler)
            this._pending[stanza.@id] = handler;
        this._data('out', stanza.toXMLString());
        break;
    }

    event._handle1(
        {direction: direction, tag: stanza.name(), stanza: stanza, session: this},
        this._postWatches, event._match1);
}


