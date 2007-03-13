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


/**
 * The session component sits between the network and the XMPP
 * service, mediating exchange of XMPP stanzas and doing some
 * bookkeeping in the meanwhile, such as stamping outgoing stanzas
 * with unique IDs and remembering what handler to run when a reply to
 * a specific stanza is received.
 *
 * Input from the network is expected to be fed to the receive()
 * method.  It resurfaces in session and can be listened through an
 * observer, watching for the 'data-out' topic.
 *
 */


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader);
const serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Ci.nsIDOMSerializer);
const domParser = Cc['@mozilla.org/xmlextras/domparser;1']
    .getService(Ci.nsIDOMParser);


// INITIALIZATION
// ----------------------------------------------------------------------

function init() {
    this._isOpen = false;
    this._idCounter = 1000;
    this._pending = {};
    this._observers = [];

    this.__defineGetter__(
        'name', function() {
            return this._name;
        });
}

function setName(string) {
    this._name = string;
}


// PUBLIC INTERFACE - SESSION MANAGEMENT AND DATA EXCHANGE
// ----------------------------------------------------------------------

/**
 * Send the stream prologue.
 *
 */

function open(server) {
    if(this._isOpen)
        throw new Error('Session already opened.');

    this.send('<?xml version="1.0"?>' +
              '<stream:stream xmlns="jabber:client" ' +
              'xmlns:stream="http://etherx.jabber.org/streams" ' +
              'to="' + server + '">');

    this._stream('out', 'open');
}

/**
 * Send the stream epilogue.
 *
 */

function close() {
    if(!this._isOpen)
        throw new Error('Session already closed.');

    this._stream('out', 'close');
    this.send('</stream:stream>');
}

function isOpen() {
    return this._isOpen;
}

/**
 * Send data to the other side.  Conversion to XML DOM will be
 * attempted internally; if successful, stanza will be stamped with
 * unique id.  If observer is provided and the data was valid XML,
 * observer will be called upon reception of reply.
 *
 */

function send(data, observer) {
    if(observer) {
        var session = this;
        var handler = function(domReply) {
            observer.observe(domReply, 'reply-in', this.name);
        }
    }

    if(/^(<\?xml version="1.0"\?><stream:stream|<\/stream:stream>|\s*$)/.test(data))
        // Session: work around apparently uncatchable exception from
        // parseFromString() by not attempting to parse known invalid
        // XML (stream prologue/epilogue, keepalives).
        this._data('out', data);
    else {
        var domStanza = domParser.parseFromString(data, 'text/xml').documentElement;
        if(domStanza.tagName == 'parsererror' ||
           domStanza.namespaceURI == 'http://www.mozilla.org/newlayout/xml/parsererror.xml')
            this._data('out', data);
        else
            this._stanza('out', domStanza, handler);        
    } 
}

/**
 * Receive text or XML from the other side.
 *
 */

function receive(data) { 
    this._data('in', data);
}
    
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
    if(direction == 'in')
        if(state == 'open')
            this._isOpen = true;
        else if(state == 'close')
            this._isOpen = false;

    this.notifyObservers(state, 'stream-' + direction, this.name);
}

function _data(direction, data) {
    this.notifyObservers(data, 'data-' + direction, this.name);

    if(direction == 'in') {
        if(!this._isOpen) {
            try {
                new XML(data);
            } catch(e if e.name == 'SyntaxError') {
                if(/<stream:stream/.test(data))
                    this._stream('in', 'open');
                else
                    dump('*** xmpp4moz *** Invalid data read: ' + data + '\n');
            }
        } else {
            var node = domParser
                .parseFromString('<stream:stream xmlns:stream="http://etherx.jabber.org/streams">' +
                                 data +
                                 (/<\/stream:stream>\s*$/.test(data) ?
                                  '' : '</stream:stream>'),
                                 'text/xml')
                .documentElement
                .firstChild;
            while(node) {
                if(node.nodeType == Ci.nsIDOMNode.ELEMENT_NODE)
                    this._stanza('in', node);

                node = node.nextSibling;
            }
        }
        if(data.indexOf('</stream:stream>') != -1)
            this._stream('in', 'close');
    }
}

function _stanza(direction, domStanza, handler) {
    switch(direction) {
    case 'in':
        var id = domStanza.getAttribute('id');
        if(this._pending[id]) {
            this._pending[id](domStanza);
            delete this._pending[id];
        }
        break;
    case 'out':
        domStanza.setAttribute('id', this._idCounter++);
        if(handler)
            this._pending[domStanza.getAttribute('id')] = handler;
        this._data('out', serializer.serializeToString(domStanza));
        break;
    }

    this.notifyObservers(domStanza, 'stanza-' + direction, this.name);
}

function notifyObservers(subject, topic, data) {
    if(typeof(subject) == 'string') {
        var xpcString = Cc["@mozilla.org/supports-string;1"]
            .createInstance(Ci.nsISupportsString);
        xpcString.data = subject;
        subject = xpcString;
    }
    
    for each(var observer in this._observers) 
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Cu.reportError(e);
        }    
}

