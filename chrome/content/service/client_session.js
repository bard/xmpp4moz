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

const STREAM_PROLOGUE =
    '<?xml version="1.0"?>' +
    '<stream:stream xmlns="jabber:client" ' +
    'xmlns:stream="http://etherx.jabber.org/streams" ' +
    'to="<SERVER>">';
const STREAM_EPILOGUE =
    '</stream>';


// INITIALIZATION
// ----------------------------------------------------------------------

function init() {
    this._isOpen = false;
    this._idCounter = 1000;
    this._pending = {};
    this._observers = [];
    this._buffer = '';

    this.__defineGetter__('name', function() {
        return this._name;
    });

    this._doc = Cc['@mozilla.org/xml/xml-document;1']
    .createInstance(Ci.nsIDOMXMLDocument);

    this._parser = Cc['@mozilla.org/saxparser/xmlreader;1']
    .createInstance(Ci.nsISAXXMLReader);
    this._parser.parseAsync(null);

    this._parser.errorHandler = {
        error: function() { },
        fatalError: function() { },
        ignorableWarning: function() { },
        QueryInterface: function(iid) {
            if(!iid.equals(Ci.nsISupports) &&
               !iid.equals(Ci.nsISAXErrorHandler))
                throw Cr.NS_ERROR_NO_INTERFACE;
            return this;
        }
    };

    var session = this;
    this._parser.contentHandler = {
        startDocument: function() {
            session._stream('in', 'open');
        },
        
        endDocument: function() {
            session._stream('in', 'close');
        },
        
        startElement: function(uri, localName, qName, attributes) {
            var e = (uri == 'jabber:client' ?
                     session._doc.createElement(localName) :
                     session._doc.createElementNS(uri, localName))
            for(var i=0; i<attributes.length; i++)
                e.setAttribute(attributes.getQName(i),
                               attributes.getValue(i));
    
            if(this._element) {
                this._element.appendChild(e);
                this._element = e;
            }
            else if(['message', 'iq', 'presence'].indexOf(localName) != -1)
                this._element = e;
        },
        
        endElement: function(uri, localName, qName) {
            if(!this._element)
                return;

            if(this._element.parentNode) {
                this._element = this._element.parentNode;
            } else {
                this._element.normalize();
                var e = this._element;
                this._element = null;
                session._element('in', e);
            }
        },
        
        characters: function(value) {
            if(!this._element)
                return;
    
            this._element.appendChild(session._doc.createTextNode(value));
        },
        
        processingInstruction: function(target, data) {},
        
        ignorableWhitespace: function(whitespace) {},
        
        startPrefixMapping: function(prefix, uri) {},
        
        endPrefixMapping: function(prefix) {},
    
        QueryInterface: function(iid) {
            if(!iid.equals(Ci.nsISupports) &&
               !iid.equals(Ci.nsISAXContentHandler))
                throw Cr.NS_ERROR_NO_INTERFACE;
            return this;
        }
    };    
}

function setName(string) {
    this._name = string;
}


// PUBLIC INTERFACE - SESSION MANAGEMENT AND DATA EXCHANGE
// ----------------------------------------------------------------------

// XXX should it really be the session's responsibility to manage the
// stream?  A separate stream handler is probably a better choice, and
// would make uncommon streams (e.g. http-binding) transparent to the
// session.

function open(server) {
    if(this._isOpen)
        // XXX replace with XPCOM exception
        throw new Error('Session already opened.');

    this._data('out', STREAM_PROLOGUE.replace('<SERVER>', server));
    this._stream('out', 'open');
}

function close() {
    if(!this._isOpen)
        // XXX replace with XPCOM exception
        throw new Error('Session already closed.');

    this._stream('out', 'close');
    this._data('out', STREAM_EPILOGUE);
}

function isOpen() {
    return this._isOpen;
}

function send(element, replyObserver) {
    this._element('out', element, replyObserver);
}

function receive(element) {
    this._element('in', element);
}

function addObserver(observer) {
    this._observers.push(observer);    
}

function removeObserver(observer) {
    var index = this._observers.indexOf(observer);
    if(index != -1) 
        this._observers.splice(index, 1);    
}

function onStartRequest(request, context) {
    this._parser.onStartRequest(request, context);
}
        
function onDataAvailable(request, context, inputStream, offset, count) {
    this._parser.onDataAvailable(request, context, inputStream, offset, count);
}

function onStopRequest(request, context, status) {
    this._parser.onStopRequest(request, context, status);
}


// INTERNALS
// ----------------------------------------------------------------------

function _stream(direction, state) {
    if(direction == 'in' && state == 'open')
        this._isOpen = true;
    else if(direction =='out' && state == 'close')
        this._isOpen = false;

    this.notifyObservers(state, 'stream-' + direction, this.name);
}

function _data(direction, data) {
    this.notifyObservers(data, 'data-' + direction, this.name);
}

function _element(direction, domStanza, replyObserver) {
    var meta = this._doc.createElementNS('http://hyperstruct.net/xmpp4moz', 'meta');
    meta.setAttribute('account', this.name);
    meta.setAttribute('direction', direction);
    
    switch(direction) {
    case 'in':
        var id = domStanza.getAttribute('id');
        if(this._pending[id]) {
            try {
                this._pending[id].observe(domStanza, 'reply-in', this.name);
            } catch(e) {
                Cu.reportError(e);
            } finally {
                delete this._pending[id];
            }
        }

        var stampedStanza = domStanza.cloneNode(true);
        stampedStanza.appendChild(stampedStanza.ownerDocument.importNode(meta, true));

        this._data('in', serialize(domStanza));
        this.notifyObservers(stampedStanza, 'stanza-' + direction, this.name);
        
        break;
    case 'out':
        domStanza.setAttribute('id', this._idCounter++);
        if(replyObserver)
            this._pending[domStanza.getAttribute('id')] = replyObserver;

        var stampedStanza = domStanza.cloneNode(true);
        stampedStanza.appendChild(stampedStanza.ownerDocument.importNode(meta, true));


        this.notifyObservers(stampedStanza, 'stanza-' + direction, this.name);
        
        this._data('out', serialize(domStanza));
        break;
    }
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

function serialize(element) {
    var _ = arguments.callee;
    _.serializer = _.serializer ||
        Cc['@mozilla.org/xmlextras/xmlserializer;1'].getService(Ci.nsIDOMSerializer);
    return _.serializer.serializeToString(element);
}