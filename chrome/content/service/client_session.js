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
 * method and user should listen for it via the {event: 'data',
 * direction: 'in'} event.  Input from the user is expected to be fed
 * to the send() method and network should listen for it via the {event:
 * 'data', direction: 'out'} event.
 *
 */

// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const loader = Components
    .classes['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Components.interfaces.mozIJSSubScriptLoader);
const converter = Components
    .classes["@mozilla.org/intl/scriptableunicodeconverter"]
    .getService(Components.interfaces.nsIScriptableUnicodeConverter);
const serializer = Components
    .classes['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Components.interfaces.nsIDOMSerializer);
const domParser = Components
    .classes['@mozilla.org/xmlextras/domparser;1']
    .getService(Components.interfaces.nsIDOMParser);

converter.charset = 'UTF-8';
loader.loadSubScript('chrome://xmpp4moz/content/lib/module_manager.js');
const module = new ModuleManager(['chrome://xmpp4moz/content']);
const Parser = module.require('class', 'service/parser');


// INITIALIZATION
// ----------------------------------------------------------------------

function init() {
    this._isOpen = false;
    this._idCounter = 1000;
    this._parser = new Parser();
    this._pending = {};
    this._observers = [];

    var session = this;
    this._parser.setObserver({
        onStart: function(id) {
                session._stream('in', 'open');
            },
        onStop: function() {
                session._stream('in', 'close');
            },
        onStanza: function(domElement) {
                session._stanza('in', domElement);
            }});

    this.__defineGetter__(
        'name', function() {
            return this._name;
        });
}

function setName(string) {
    this._name = string;
}

// PUBLIC INTERFACE
// ----------------------------------------------------------------------

function open(server) {
    if(this._isOpen)
        throw new Error('Session already opened.');

    this.send('<?xml version="1.0"?>' +
              '<stream:stream xmlns="jabber:client" ' +
              'xmlns:stream="http://etherx.jabber.org/streams" ' +
              'to="' + server + '">');
    this._stream('out', 'open');
    this._isOpen = true;
}
open.doc = 'Send the stream prologue.';

function close() {
    if(!this._isOpen)
        throw new Error('Session already closed.');
    // Important: putting the following line at the bottom causes loop.
    this._isOpen = false;

    this._stream('out', 'close');
    this.send('</stream:stream>');
}
close.doc = 'Send the stream epilogue.';

function isOpen() {
    return this._isOpen;
}

function send(data, observer) {
    var session = this;
    if(observer)
        var handler = function(reply) {
            observer.observe(null, 'reply-in-' + session.name,
                             reply.stanza.toXMLString())
        }

    var domStanza = domParser
        .parseFromString(data, 'text/xml')
        .documentElement;

    if(domStanza.tagName == 'parsererror' ||
       domStanza.namespaceURI == 'http://www.mozilla.org/newlayout/xml/parsererror.xml')
        this._data('out', data);
    else
        this._stanza('out', domStanza, handler);

}

send.doc = 'Send text or XML to the other side.  If XML, it is stamped with an \
incrementing counter, and an optional reply handler is associated.  The  \
data is not actually sent since the session has no notion of transports \
internally, but resurfaces as plain text in the {event: "data", direction: "out"} \
event so that it can be passed to a transport there.';

function receive(data) { 
    this._data('in', data);
}
receive.doc = 'Receive text or XML from the other side.';
    
function addObserver(observer) {
    this._observers.push(observer);    
}

function removeObserver(observer) {
    var index = this._observers.indexOf(observer);
    if(index != -1) 
        this._observers.splice(index, 1);    
}


// INTERNALS
// ----------------------------------------------------------------------

function _stream(direction, state) {
    this.notifyObservers(null, 'stream-' + direction, state);
}

function _data(direction, data) {
    data = converter[direction == 'in' ?
                     'ConvertToUnicode' :
                     'ConvertFromUnicode'](data);

    if(direction == 'in')
        this._parser.parse(data);

    this.notifyObservers(null, 'data-' + direction, data);
}

function _stanza(direction, domStanza, handler) {
    switch(direction) {
    case 'in':
        var id = domStanza.getAttribute('id');
        if(this._pending[id]) {
            this._pending[id]({session: this,
                        stanza: new XML(serializer.serializeToString(domStanza))}); // MISSING EVENT NAME
            delete this._pending[id];
        }
        // if(stanza.*::query.length() > 0) {
        //     var nameSpace = stanza.*::query.namespace().toString();
        break;
    case 'out':
        domStanza.setAttribute('id', this._idCounter++);
        if(handler)
            this._pending[domStanza.getAttribute('id')] = handler;
        this._data('out', serializer.serializeToString(domStanza));
        break;
    }

    this.notifyObservers(null, 'stanza-' + direction, serializer.serializeToString(domStanza));
}

function notifyObservers(subject, topic, data) {
    for each(var observer in this._observers) 
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Components.utils.reportError(e);
        }    
}

