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
    'XMPPTCPConnector'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var Cr = Components.results;

var USER_LOCALE = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService).getBranch('general.useragent.')
    .getCharPref('locale');

var SECURITY_NONE     = 0;
var SECURITY_SSL      = 1;
var SECURITY_STARTTLS = 2;

var STREAM_PROLOGUE =
    '<?xml version="1.0"?>' +
    '<stream:stream ' +
    'xmlns="jabber:client" ' +
    'xml:lang="' + USER_LOCALE + '" ' +
    'xmlns:stream="http://etherx.jabber.org/streams" ' +
    'version="1.0" ' +
    'to="<SERVER>">';

var STREAM_EPILOGUE =
    '</stream:stream>';

// An array could be used, but hashes can be looked up without
// iterating, and this is a lookup we'll be performing often.
var STREAM_LEVEL_ELEMENT = {
    'jabber:client::message'        : true,
    'jabber:client::presence'       : true,
    'jabber:client::iq'             : true,
    'http://etherx.jabber.org/streams::features': true,
    'urn:ietf:params:xml:ns:xmpp-tls::proceed': true,
    'urn:ietf:params:xml:ns:xmpp-tls::failure' : true,
    'urn:ietf:params:xml:ns:xmpp-sasl::success': true,
    'urn:ietf:params:xml:ns:xmpp-sasl::failure': true,
    'urn:ietf:params:xml:ns:xmpp-sasl::challenge': true,
    'urn:ietf:params:xml:ns:xmpp-streams::error': true
};

var ERROR_CONDITIONS = [
    'bad-format',
    'bad-namespace-prefix',
    'conflict',
    'connection-timeout',
    'host-gone',
    'host-unknown',
    'improper-addressing',
    'internal-server-error',
    'invalid-from',
    'invalid-id',
    'invalid-namespace',
    'invalid-xml',
    'not-authorized',
    'policy-violation',
    'remote-connection-failed',
    'resource-constraint',
    'restricted-xml',
    'see-other-host',
    'system-shutdown',
    'undefined-condition',
    'unsupported-encoding',
    'unsupported-stanza-type',
    'unsupported-version',
    'xml-not-well-formed'
];

var KEEPALIVE_INTERVAL = 30000;

XML.prettyPrinting = false;
XML.ignoreWhitespace = true;

Cu.import('resource://xmpp4moz/socket.jsm');
Cu.import('resource://xmpp4moz/log.jsm');
Cu.import('resource://xmpp4moz/utils.jsm');


// INITIALIZATION
// ----------------------------------------------------------------------

function XMPPTCPConnector(opts) {
    this._node           = opts.node;
    this._domain         = opts.domain;
    this._resource       = opts.resource;
    this._password       = opts.password;
    this._host           = opts.host;
    this._port           = opts.port;
    this._security       = opts.security;

    this._log            = Log.getSource('connector', {account: this._node + '@' + this._domain + '/' + this._resource});

    this._parser         = null;
    this._observers      = [];
    this._state          = 'disconnected';
    this._keepAliveTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
}


// REACTIONS
// ----------------------------------------------------------------------

XMPPTCPConnector.prototype.onEvent_streamElement = function(element) {
    this._log.send({state: 'RECV', element: element});
    this.assertState('stream-open', 'requested-tls', 'auth-waiting-result',
                     'binding-resource', 'requesting-session', 'active', 'idle');

    if(element.localName == 'error' && element.namespaceURI == 'http://etherx.jabber.org/streams') {
        for(var i=0; i<ERROR_CONDITIONS.length; i++) {
            if(hasChild(element, 'urn:ietf:params:xml:ns:xmpp-streams', ERROR_CONDITIONS[i])) {
                this.setState('error', element);
                return;
            }
        }
    }

    switch(this._state) {
    case 'auth-waiting-challenge':
        if(element.localName == 'challenge' &&
           element.namespaceURI == 'urn:ietf:params:xml:ns:xmpp-sasl') {
            this._log.send({data: atob(element.textContent)})
        }
        break;
    case 'auth-waiting-result':
        if(element.namespaceURI == 'urn:ietf:params:xml:ns:xmpp-sasl') {
            if(element.localName == 'success') {
                this.setState('wait-stream');
                this.openStream();
            }
            else if(element.localName == 'failure')
                this.setState('error', element);
            else
                throw new Error('Invalid state');
        } else
            throw new Error('Invalid state');
        break;
    case 'binding-resource':
        if(element.localName == 'iq' &&
           element.getAttribute('type') == 'result' &&
           element.getAttribute('id') == 'bind_2') {
            this.requestSession();
            this.setState('requesting-session');
        } else {
            this.setState('error', element.getElementsByTagName('error')[0].firstChild);
        }
        break;
    case 'requesting-session':
        if(element.localName == 'iq' &&
           element.getAttribute('type') == 'result' &&
           element.getAttribute('id') == 'sess_1') {
            this.onEvent_sessionActive();
            this.setState('active');
            this.setState('idle');
        } else {
            this.setState('error', element.getElementsByTagName('error')[0].firstChild);
        }
        break;
    case 'stream-open':
        if(element.localName == 'features' &&
           element.namespaceURI == 'http://etherx.jabber.org/streams') {
            if(this._security == SECURITY_STARTTLS &&
               hasChild(element, 'urn:ietf:params:xml:ns:xmpp-tls', 'starttls')) {
                this.setState('requested-tls');
                this.requestTLS();
            } else if(this._password &&
                      hasChild(element, 'urn:ietf:params:xml:ns:xmpp-sasl', 'mechanisms')) {
                this.setState('auth-waiting-result');
                this.requestSASLAuth('PLAIN');
            } else if(hasChild(element, 'urn:ietf:params:xml:ns:xmpp-bind', 'bind')) {
                this.setState('binding-resource');
                this.bindResource();
            } else {
                // no username/password provided, upper layers just
                // want a bare unauthenticated stream, give it to
                // them!
                this.onEvent_sessionActive();
                this.setState('active');
                this.setState('idle');
            }
        } else
            throw new Error('Unexpected element while waiting for stream features. ' + serialize(element));
        break;
    case 'requested-tls':
        if(element.localName == 'proceed' &&
           element.namespaceURI == 'urn:ietf:params:xml:ns:xmpp-tls') {
            this.setState('negotiating-tls');
            this.startTLS();
        } else if(element.localName == 'failure' &&
                  element.namespaceURI == 'urn:ietf:params:xml:ns:xmpp-tls') {
            this.setState('error', element);
        }
        break;
    case 'active':
        break;
    case 'idle':
        this.setState('accept-stanza', element);
        this.setState('idle');
        break;
    case 'authenticating':
        break;
    }
};

XMPPTCPConnector.prototype.onEvent_transportDisconnected = function() {
    this.setState('disconnected');
};

XMPPTCPConnector.prototype.onEvent_openedOutgoingStream = function() {
    this.setState('wait-stream');
};

XMPPTCPConnector.prototype.onEvent_openedIncomingStream = function() {
    this.assertState('wait-stream');
    this.setState('stream-open');
};

XMPPTCPConnector.prototype.onEvent_closedIncomingStream = function() {
    this.assertState('connected', 'authenticating', 'active', 'idle');
};

XMPPTCPConnector.prototype.onEvent_sessionActive = function() {
    this.startKeepAlive();
};


// PUBLIC API
// ----------------------------------------------------------------------

XMPPTCPConnector.prototype.__defineGetter__('_backlog', function() {
    throw new Error('Backlog no longer available');
});

XMPPTCPConnector.prototype.isConnected = function() {
    return ['requested-tls',
            'auth-waiting-result',
            'stream-open',
            'connected',
            'accept-stanza',
            'active',
            'idle'].indexOf(this._state) != -1;
};

XMPPTCPConnector.prototype.connect = function() {
    this.setState('connecting');
    var connector = this;

    var socket = new Socket(this._host, this._port, this._security, this._node + '@' + this._domain + '/' + this._resource);

    socket.setListener({
        onReady: function() {
            socket.setReplyTimeout(3000);
            socket.send(STREAM_PROLOGUE.replace('<SERVER>', connector._domain));
            connector.onEvent_openedOutgoingStream();
        },

        onDataAvailable: function(request, context, inputStream, offset, count) {
            if(connector._state == 'connecting')
                connector._state = 'connected';

            connector._socket = socket;
            connector.onDataAvailable.apply(connector, arguments);
        },

        onTimeout: function() {
            // Socket disables itself.  Retry.
            connector.connect();
        },

        onBadCertificate: function() {
            connector.setState('error', 'bad-certificate');
        },

        onClose: function() {
            // Socket closed.  Only called if we didn't timeout.
            connector.onEvent_transportDisconnected();
        }
    });

    try {
        socket.connect();
    } catch(e if e.name == 'NS_ERROR_OFFLINE') {
        connector.onEvent_transportDisconnected();
    }
};

XMPPTCPConnector.prototype.onDataAvailable = function(request, context, inputStream, offset, count) {
    switch(this._state) {
    case 'wait-stream':
        [this._parser, this._parseReq] = this.createParser();
        this._parser.onStartRequest(this._parseReq, null);
        this._parser.onDataAvailable(this._parseReq, null, inputStream, offset, count);
        break;
    default:
        this._parser.onDataAvailable(this._parseReq, null, inputStream, offset, count);
    }
};

XMPPTCPConnector.prototype.send = function(element) {
    this._log.send({state: 'SEND', element: element});
    this._write(serialize(element));
};

XMPPTCPConnector.prototype.disconnect = function() {
    if(this._state == 'active' || this._state == 'idle')
        this._write(STREAM_EPILOGUE);
    if(this._socket)
        this._socket.close();
};


// INTERNALS
// ----------------------------------------------------------------------

XMPPTCPConnector.prototype.startKeepAlive = function() {
    var connector = this;
    this._keepAliveTimer.initWithCallback({
        notify: function(timer) {
            if(connector._state == 'idle')
                connector._write(' ');
            else
                connector._keepAliveTimer.cancel();
        }
    }, KEEPALIVE_INTERVAL, Ci.nsITimer.TYPE_REPEATING_SLACK);
};

XMPPTCPConnector.prototype.startTLS = function() {
    this._socket.startTLS();
    this.setState('wait-stream');
    this._socket.setReplyTimeout(3000);
    this.openStream();
};

XMPPTCPConnector.prototype._write = function(data) {
    return this._socket.send(data);
    // try {
    //     if(this._state != 'idle' && this._state != 'active' && this._state != 'accept-stanza')
    //         this._log('DATA   >>> ', data);
    //     return this._outstream.writeString(asString(data));
    // } catch(e if e.name == 'NS_BASE_STREAM_CLOSED') {
    //     this.onEvent_transportDisconnected();
    // }
};

XMPPTCPConnector.prototype.bindResource = function() {
    this._write(<iq id='bind_2' type='set'>
               <bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'>
               <resource>{this._resource}</resource>
               </bind>
               </iq>);
};

XMPPTCPConnector.prototype.requestSession = function() {
    this._write(<iq id='sess_1' type='set'>
               <session xmlns='urn:ietf:params:xml:ns:xmpp-session'/>
               </iq>);
};

XMPPTCPConnector.prototype.requestSASLAuth = function(mechanism) {
    switch(mechanism) {
    case 'PLAIN':
        var auth = btoa(this._node + '@' + this._domain + '\0' +
                        this._node + '\0' +
                        this._password);
        this._write(<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>{auth}</auth>);
        break;
    default:
        throw new Error('Unsupported mechanism. + (' + mechanism + ')');
    }
};

XMPPTCPConnector.prototype.requestLegacyAuth = function() {
    this._write(<iq type="set" id="auth01">
                <query xmlns="jabber:iq:auth">
                <username>{this._node}</username>
                <resource>{this._resource}</resource>
                <password>{this._password}</password>
                </query>
                </iq>);
};

XMPPTCPConnector.prototype.requestTLS = function() {
    this._write(<starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls'/>);
};

XMPPTCPConnector.prototype.setState = function(stateName, stateData) {
    this._log.send({state: stateName, data: stateData});
    this._state = stateName;
    this.notifyObservers(stateData, stateName, null);
};

XMPPTCPConnector.prototype.openStream = function() {
    this._write(STREAM_PROLOGUE.replace('<SERVER>', this._domain));
};

XMPPTCPConnector.prototype.addObserver = function(observer) {
    this._observers.push(observer);
};

XMPPTCPConnector.prototype.removeObserver = function(observer) {
    var index = this._observers.indexOf(observer);
    if(index != -1)
        this._observers.splice(index, 1);
};

XMPPTCPConnector.prototype.notifyObservers = function(subject, topic, data) {
    for each(var observer in this._observers)
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Cu.reportError(e);
        }
}


// UTILITIES
// ----------------------------------------------------------------------

XMPPTCPConnector.prototype.assertState = function() {
    for(var i=0;i<arguments.length;i++)
        if(this._state == arguments[i])
            return;
    this._log.send({error: 'bad-event', event: arguments.callee.caller.name, state: this._state});
};


XMPPTCPConnector.prototype.createParser = function() {
    var doc = Cc['@mozilla.org/xml/xml-document;1']
        .createInstance(Ci.nsIDOMXMLDocument);
    var parser = Cc['@mozilla.org/saxparser/xmlreader;1']
        .createInstance(Ci.nsISAXXMLReader);
    var connector = this;

    parser.errorHandler = {
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

    parser.contentHandler = {
        startDocument: function() {
            connector._log.send({debug: 'remote opened XML stream'});
            connector.onEvent_openedIncomingStream();
        },

        endDocument: function() {
            connector._log.send({debug: 'remote closed XML stream'});
            connector.onEvent_closedIncomingStream();
        },

        startElement: function(uri, localName, qName, attributes) {
            // Filter out.  These are supposed to be local only --
            // accepting them from outside can cause serious mess.
            // Should probably be filtered by session.
            if(uri == 'http://hyperstruct.net/xmpp4moz/protocol/internal')
                return;

            var e = (uri == 'jabber:client' ?
                     doc.createElement(qName) :
                     doc.createElementNS(uri, qName))

            for(var i=0; i<attributes.length; i++)
                e.setAttributeNS(attributes.getURI(i),
                                 attributes.getQName(i),
                                 attributes.getValue(i));

            if(this._element) {
                this._element.appendChild(e);
                this._element = e;
            }
            else if(localName == 'stream' && uri == 'http://etherx.jabber.org/streams')
                ;
            else
                this._element = e;
        },

        endElement: function(uri, localName, qName) {
            if(!this._element)
                return;

            if(this._element.parentNode) {
                this._element = this._element.parentNode;
            } else {
                this._element.normalize();

                if(!STREAM_LEVEL_ELEMENT[uri + '::' + localName])
                    connector._log.send({debug: 'parser got non-stream-level element ' + uri + '::' + localName});

                connector.onEvent_streamElement(this._element);
                this._element = null;
            }
        },

        characters: function(value) {
            if(!this._element)
                return;

            this._element.appendChild(doc.createTextNode(value));
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

    parser.parseAsync(null);

    var parseReq = {
        cancel: function(status) {},
        isPending: function() {},
        resume: function() {},
        suspend: function() {}
    };

    return [parser, parseReq];
};

function hasChild(element, childNS, childName) {
    return element.getElementsByTagNameNS(childNS, childName).length > 0;
}
