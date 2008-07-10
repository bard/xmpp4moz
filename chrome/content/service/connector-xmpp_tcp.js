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

var srvSocketTransport = Cc["@mozilla.org/network/socket-transport-service;1"]
    .getService(Ci.nsISocketTransportService);
var srvProxy = Cc['@mozilla.org/network/protocol-proxy-service;1']
    .getService(Ci.nsIProtocolProxyService);
var srvIO = Cc['@mozilla.org/network/io-service;1']
    .getService(Ci.nsIIOService);

var SECURITY_NONE     = 0;
var SECURITY_SSL      = 1;
var SECURITY_STARTTLS = 2;

var STREAM_PROLOGUE =
    '<?xml version="1.0"?>' +
    '<stream:stream xmlns="jabber:client" ' +
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
    'urn:ietf:params:xml:ns:xmpp-sasl::success': true
};
var KEEPALIVE_INTERVAL = 30000;

XML.prettyPrinting = false;
XML.ignoreWhitespace = true;


// INITIALIZATION
// ----------------------------------------------------------------------

function init(jid, password, host, port, security) {
    this._jid             = jid;
    this._password        = password;
    this._host            = host;
    this._port            = port;
    this._security        = security;
    this._logging         = true;
    this._backlog         = [];

    this._parser = null;
    this._state = 'disconnected';
    this._observers = [];
    this._keepAliveTimer  = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
}


// REACTIONS
// ----------------------------------------------------------------------

function onEvent_streamElement(element) {
    this.LOG('DATA   <<< ', element);
    this.assertState('stream-open', 'requested-tls', 'auth-waiting-result',
                     'binding-resource', 'requesting-session', 'active', 'idle');

    switch(this._state) {
    case 'auth-waiting-challenge':
        if(element.localName == 'challenge' &&
           element.namespaceURI == 'urn:ietf:params:xml:ns:xmpp-sasl') {
            this.LOG(atob(element.textContent))
        }
        break;
    case 'auth-waiting-result':
        if(element.namespaceURI == 'urn:ietf:params:xml:ns:xmpp-sasl') {
            if(element.localName == 'success') {
                this.setState('wait-stream');
                this.openStream();
            }
            else if(element.localName == 'failure')
                this.setState('error', xpcomize('auth'));
            else
                throw new Error('Invalid state');
        } else
            throw new Error('Invalid state');
        break;
    case 'binding-resource':
        if(element.localName == 'iq' &&
           element.getAttribute('type') == 'result' &&
           // cheating, should check child instead
           element.getAttribute('id') == 'bind_2') {
            this.requestSession();
            this.setState('requesting-session');
        } else {
            throw new Error('Error while binding resource.');
        }
        break;
    case 'requesting-session':
        if(element.localName == 'iq' &&
           element.getAttribute('type') == 'result' &&
           // cheating, should check child instead
           element.getAttribute('id') == 'sess_1') {
            this.onEvent_sessionActive();
            this.setState('active');
            this.setState('idle');
        } else {
            throw new Error('Error getting session.');
        }
        break;
    case 'stream-open':
        if(element.localName == 'features' &&
           element.namespaceURI == 'http://etherx.jabber.org/streams') {
            if(this._security == SECURITY_STARTTLS &&
               hasChild(element, 'urn:ietf:params:xml:ns:xmpp-tls', 'starttls')) {
                this.setState('requested-tls');
                this.requestTLS();
            } else if(this._jid && this._password &&
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
            // error?
        break;
    case 'requested-tls':
        if(element.localName == 'proceed' &&
           element.namespaceURI == 'urn:ietf:params:xml:ns:xmpp-tls') {
            this.setState('negotiating-tls');
            this._socket.startTLS();
            // assume this is synchronous and it will throw exception
            // if not successful...
            this.setState('connected');
            this.setState('wait-stream');
            this.openStream();
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
}

function onEvent_transportDisconnected() {
    this.setState('disconnected');
}

function onEvent_openedOutgoingStream() {
    this.setState('wait-stream');
}

function onEvent_openedIncomingStream() {
    this.assertState('wait-stream');
    this.setState('stream-open');
}

function onEvent_closedIncomingStream() {
    this.assertState('connected', 'authenticating', 'active', 'idle');
}

function onEvent_sessionActive() {
    this.startKeepAlive();
}


// PUBLIC API
// ----------------------------------------------------------------------

function isConnected() {
    return ['requested-tls',
            'auth-waiting-result',
            'stream-open',
            'connected',
            'accept-stanza',
            'active',
            'idle'].indexOf(this._state) != -1;
}

function connect() {
    this.setState('connecting');
    var connector = this;

    var socket = new Socket(this._host, this._port, this._security, function(msg) { connector.LOG(msg); });
    socket.setListener({
        onReady: function() {
            socket.setReplyTimeout(3000);
            socket.send(STREAM_PROLOGUE.replace('<SERVER>', JID(connector._jid).hostname));
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

        onBadCert: function() {
            connector.setState('error', xpcomize('badcert'));
        },

        onClose: function() {
            // Socket closed.  Only called if we didn't timeout.
            connector.onEvent_transportDisconnected();
        }
    });

    socket.connect();
}

function onDataAvailable(request, context, inputStream, offset, count) {
    switch(this._state) {
    case 'wait-stream':
        this._parseReq = {
            cancel: function(status) {
                this.LOG('PARSE REQ - cancel ' + status);
            },
            isPending: function() {
                this.LOG('PARSE REQ - pending')
            },
            resume: function() {
                this.LOG('PARSE REQ - resume')
            },
            suspend: function() {
                this.LOG('PARSE REQ - suspend')
            }
        };
        this._parser = this.createParser(this._parseReq);
        this._parser.onStartRequest(this._parseReq, null);
        this._parser.onDataAvailable(this._parseReq, null, inputStream, offset, count);
        break;
    default:
        this._parser.onDataAvailable(this._parseReq, null, inputStream, offset, count);
    }
}

function send(element) {
    this.LOG('DATA   >>> ', serialize(element));
    this._write(serialize(element));
}

function disconnect() {
    this._write(STREAM_EPILOGUE);
    this._socket.close();
}


// INTERNALS
// ----------------------------------------------------------------------

function startKeepAlive() {
    var connector = this;
    this._keepAliveTimer.initWithCallback({
        notify: function(timer) {
            if(connector._state == 'idle')
                connector._write(' ');
            else
                connector._keepAliveTimer.cancel();
        }
    }, KEEPALIVE_INTERVAL, Ci.nsITimer.TYPE_REPEATING_SLACK);
}

function _write(data) {
    return this._socket.send(data);
    // try {
    //     if(this._state != 'idle' && this._state != 'active' && this._state != 'accept-stanza')
    //         this.LOG('DATA   >>> ', data);
    //     return this._outstream.writeString(asString(data));
    // } catch(e if e.name == 'NS_BASE_STREAM_CLOSED') {
    //     this.onEvent_transportDisconnected();
    // }
}

function bindResource() {
    this._write(<iq id='bind_2' type='set'>
               <bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'>
               <resource>{JID(this._jid).resource}</resource>
               </bind>
               </iq>);
}

function requestSession() {
    this._write(<iq id='sess_1' type='set'>
               <session xmlns='urn:ietf:params:xml:ns:xmpp-session'/>
               </iq>);
}

function requestSASLAuth(mechanism) {
    switch(mechanism) {
    case 'PLAIN':
        var auth = btoa(JID(this._jid).address + '\0' +
                        JID(this._jid).username + '\0' +
                        this._password);
        this._write(<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>{auth}</auth>);
        break;
    default:
        throw new Error('Unsupported mechanism. + (' + mechanism + ')');
    }
}

function requestLegacyAuth() {
    this._write(<iq type="set" id="auth01">
               <query xmlns="jabber:iq:auth">
               <username>{JID(this._jid).username}</username>
               <resource>{JID(this._jid).resource}</resource>
               <password>{this._password}</password>
               </query>
               </iq>);
}

function requestTLS() {
    this._write(<starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls'/>);
}

function setState(name, stateData) {
    this.LOG('STATE  ', name, ' [', stateData, ']');
    this._state = name;
    this.notifyObservers(stateData, name, null);
}

function openStream() {
    this._write(STREAM_PROLOGUE.replace('<SERVER>', JID(this._jid).hostname));
}

function addObserver(observer) {
    this._observers.push(observer);    
}

function removeObserver(observer) {
    var index = this._observers.indexOf(observer);
    if(index != -1) 
        this._observers.splice(index, 1);    
}

function notifyObservers(subject, topic, data) {
    for each(var observer in this._observers) 
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Cu.reportError(e);
        }
}


// UTILITIES
// ----------------------------------------------------------------------

function assertState() {
    for(var i=0;i<arguments.length;i++)
        if(this._state == arguments[i])
            return;
    this.LOG('ERROR: event ' + arguments.callee.caller.name + ' while in state ' + this._state);
}


function LOG() {
    if(this._logging) {
        var logLine = ('DBG xmpp/tcp (' + this._jid.slice(0, 4) + '…) ' + listToString(arguments))
            .replace(/(<auth mechanism.+?>)([^<]+)/, '$1[password hidden in log]')

        if(this._backlog.length > 200)
            this._backlog.shift();

        this._backlog.push(logLine);

        dump(logLine); dump('\n\n');
    }
}

function getCurrentThreadTarget() {
    if('@mozilla.org/thread-manager;1' in Cc)
        return Cc['@mozilla.org/thread-manager;1'].getService().currentThread;
    else
        return Cc['@mozilla.org/event-queue-service;1'].getService(Ci.nsIEventQueueService)
            .createFromIThread(
                Cc['@mozilla.org/thread;1'].getService(Ci.nsIThread), true)
}

function JID(string) {
    var memo = arguments.callee.memo || (arguments.callee.memo = {});
    if(string in memo)
        return memo[string];
    var m = string.match(/^(.+?@)?(.+?)(?:\/|$)(.*$)/);

    var jid = {};

    if(m[1])
        jid.username = m[1].slice(0, -1);

    jid.hostname = m[2];
    jid.resource = m[3];
    jid.nick     = m[3];
    jid.full     = m[3] ? string : null;
    jid.address  = jid.username ?
        jid.username + '@' + jid.hostname :
        jid.hostname;

    memo[string] = jid;
    return jid;    
}

function serialize(element) {
    var serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1'].getService(Ci.nsIDOMSerializer);
    serialize = function(element) {
        return serializer.serializeToString(element);
    };
    return serialize(element);
}

function createParser() {
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
            connector.onEvent_openedIncomingStream();
        },

        endDocument: function() {
            connector.LOG('PARSER remote closed stream');
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
                e.setAttribute(attributes.getQName(i),
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
                    connector.LOG('PARSER got non-stream-level element: ' + uri + '::' + localName);

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

    return parser;
}

function hasChild(element, childNS, childName) {
    return element.getElementsByTagNameNS(childNS, childName).length > 0;
}

function xpcomize(thing) {
    if(typeof(thing) == 'string') {
        var xpcomString = Cc["@mozilla.org/supports-string;1"]
            .createInstance(Ci.nsISupportsString);
        xpcomString.data = thing;
        return xpcomString;
    } else if(thing instanceof Ci.nsISupports) {
        return thing;
    } else {
        throw new Error('Neither an XPCOM object nor a string. (' + thing + ')');
    }
}

function asString(thing) {
    if(typeof(thing) == 'string')
        return thing;
    else if(typeof(thing) == 'xml')
        return thing.toXMLString();
    else if(thing instanceof Ci.nsISupportsString)
        return thing.toString();
    else if(thing instanceof Ci.nsIDOMElement)
        return serialize(thing);
    else
        return '';
}

function listToString(list) {
    var parts = [];
    for(var i=0,l=list.length; i<l; i++)
        parts.push(asString(list[i]));
    return parts.join('');
}
    

if(typeof(atob) == 'undefined') {
// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function btoa(input) {
   var output = "";
   var chr1, chr2, chr3;
   var enc1, enc2, enc3, enc4;
   var i = 0;

   do {
      chr1 = input.charCodeAt(i++);
      chr2 = input.charCodeAt(i++);
      chr3 = input.charCodeAt(i++);

      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;

      if (isNaN(chr2)) {
         enc3 = enc4 = 64;
      } else if (isNaN(chr3)) {
         enc4 = 64;
      }

      output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) + 
         keyStr.charAt(enc3) + keyStr.charAt(enc4);
   } while (i < input.length);
   
   return output;
}

function atob(input) {
   var output = "";
   var chr1, chr2, chr3;
   var enc1, enc2, enc3, enc4;
   var i = 0;

   // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
   input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

   do {
      enc1 = keyStr.indexOf(input.charAt(i++));
      enc2 = keyStr.indexOf(input.charAt(i++));
      enc3 = keyStr.indexOf(input.charAt(i++));
      enc4 = keyStr.indexOf(input.charAt(i++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      output = output + String.fromCharCode(chr1);

      if (enc3 != 64) {
         output = output + String.fromCharCode(chr2);
      }
      if (enc4 != 64) {
         output = output + String.fromCharCode(chr3);
      }
   } while (i < input.length);

   return output;
}
}


// SOCKET
// ----------------------------------------------------------------------

function Socket(host, port, security, logger) {
    this._id = (new Date()).getTime();
    this._host = host;
    this._port = port;
    this._security = security || SECURITY_NONE;
    this._proxy_info = srvProxy.resolve(
        srvIO.newURI((this._security == SECURITY_SSL ? 'https://' : 'http://') + this._host, null, null),
        null);
    this._listener = null;
    this._transport = null;
    this._reply_timeout = null;
    this._logger = logger;
    this._state = 'disconnected';
}

Socket.prototype = {

    // API
    // ----------------------------------------------------------------------

    // Sets a listener which will get events from the socket.
    //
    // Listener must implement the following interface:
    //
    // - onReady()
    // - onTimeout()
    // - onDataAvailable(request, context, inputStream, offset, count)
    // - onClose()
    // - onBadCertificate()

    setListener: function(listener) {
        if(this._listener)
            throw new Error('Listener already set.');
        this._listener = listener;
    },

    // Sets a timeout before which we must receive data (any data)
    // from the other side, otherwise the sock disables itself and
    // invokes listener's onTimeout().
    //
    // Needed for LP#242098.

    setReplyTimeout: function(msecs) {
        this._log('DEBUG ::: setting reply timeout to ' + msecs);
        var socket = this;
        this._reply_timeout = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        this._reply_timeout.initWithCallback({
            notify: function(timer) {
                socket._setState('timeout');
                socket.close();
           }
        }, msecs, Ci.nsITimer.TYPE_ONESHOT);
    },

    // Connects the socket.

    connect: function() {
        this._transport = this._createTransport();
        this._transport.setEventSink(this, getCurrentThreadTarget());

        var outstream = this._transport.openOutputStream(0,0,0);
        this._outstream = Cc['@mozilla.org/intl/converter-output-stream;1']
            .createInstance(Ci.nsIConverterOutputStream);
        this._outstream.init(outstream, 'UTF-8', 0, '?'.charCodeAt(0));

        var instream  = this._transport.openInputStream(0,0,0);
        var inputPump = Cc['@mozilla.org/network/input-stream-pump;1']
            .createInstance(Ci.nsIInputStreamPump);
        inputPump.init(instream, -1, -1, 0, 0, false);
        inputPump.asyncRead(this, null);
    },

    // Closes the socket.

    close: function() {
        if(this._transport)
            this._transport.close(0);
    },

    send: function(data) {
        if(!(this._state == 'ready' ||
             this._state == 'active'))
            throw new Error('Trying to send data over inactive socket.');

        return this._send(data);
    },

    startTLS: function() {
        this._transport.securityInfo.StartTLS();
    },

    // INTERNALS

    onTransportStatus: function(transport, status, progress, progressMax) {
        switch(status) {
        case Ci.nsISocketTransport.STATUS_RESOLVING:
            this._setState('resolving');
            break;
        case Ci.nsISocketTransport.STATUS_CONNECTING_TO:
            this._setState('connecting');
            var socket = this;
            if('nsIBadCertListener2' in Ci && this._transport.securityInfo) {
                this._transport.securityInfo.QueryInterface(Ci.nsISSLSocketControl);
                this._transport.securityInfo.notificationCallbacks = {
                    notifyCertProblem: function(socketInfo, status, targetSite) {
                        socket._setState('error', 'badcert');
                        return true;
                    },

                    getInterface: function(iid) {
                        return this.QueryInterface(iid);
                    },

                    QueryInterface: function(iid) {
                        if(iid.equals(Ci.nsISupports) ||
                           iid.equals(Ci.nsIInterfaceRequestor) ||
                           iid.equals(Ci.nsIBadCertListener2))
                            return this;
                        throw Cr.NS_ERROR_NO_INTERFACE;
                    }
                };
            }
            break;
        case Ci.nsISocketTransport.STATUS_CONNECTED_TO:
            this._setState('connected');
            if(this._proxy_info) {
                this._setState('proxynego');
                this._send('CONNECT ' + this._host + ':' + this._port + ' HTTP/1.0\r\n\r\n');
            } else {
                this._setState('ready');
            }
            break;
        }
    },

    onStartRequest: function() {
        this._log('DEBUG ::: request started');
    },

    onStopRequest: function() {
        this._log('DEBUG ::: request stopped');
        this._setState('disconnected');
    },

    onDataAvailable: function(request, context, inputStream, offset, count) {
        switch(this._state) {
        case 'proxynego':
            var stream = Cc['@mozilla.org/scriptableinputstream;1']
                .createInstance(Ci.nsIScriptableInputStream);
            stream.init(inputStream);
            var response = stream.read(count);
            this._log('RECV  ::: ' + response);

            this._handleProxyResponse(response);
            break;
        case 'ready':
            if(this._reply_timeout) {
                this._reply_timeout.cancel();
                this._reply_timeout = null;
                this._log('DEBUG ::: got data, timeout cancelled');
            }
            this._setState('active', arguments);
            break;
        case 'active':
            this._setState('active', arguments);
            break;
        }
    },

    _send: function(data) {
        // Low-level _send() needs to be used in more states than
        // send(), which is public API and just used during "active"
        // and "ready" state.
        if(!(this._state == 'ready' ||
             this._state == 'proxynego' ||
             this._state == 'active'))
            throw new Error('Trying to send data outside of a reasonable state.');

        this._log('SEND  ::: ' + asString(data));

        try {
            return this._outstream.writeString(asString(data))
        } catch(e if e.name == 'NS_BASE_STREAM_CLOSED') {
            this._setState('disconnected');
        }
    },

    _setState: function(state, stateInfo) {
        var previousState = this._state;
        this._log('STATE ::: ' + previousState + ' -> ' + state + ' [' + (stateInfo || '') + ']');
        this._state = state;
        switch(state) {
        case 'ready':
            this._listener.onReady();
            break;
        case 'active':
            this._listener.onDataAvailable.apply(null, stateInfo);
            break;
        case 'timeout':
            this._listener.onTimeout();
            break;
        case 'disconnected':
            if(previousState == 'active')
                this._listener.onClose();
            break;
        case 'error':
            if(stateInfo == 'badcert')
                this._listener.onBadCertificate();
            break;
        }
    },

    _createTransport: function() {
        switch(this._security) {
        case SECURITY_NONE:
            return srvSocketTransport.createTransport([], 0, this._host, this._port, this._proxy_info);
            break;
        case SECURITY_SSL:
            return srvSocketTransport.createTransport(['ssl'], 1, this._host, this._port, this._proxy_info);
            break;
        case SECURITY_STARTTLS:
            return srvSocketTransport.createTransport(['starttls'], 1, this._host, this._port, this._proxy_info);
            break;
        }
    },

    _handleProxyResponse: function(response) {
        var [match, code] = response.match(/^HTTP\/1.\d (\d{3})/);
        if(!match) {
            this._setState('error', ['bad proxy response', response]);
            this.close();
            this._log('DEBUG ::: proxy nego fail');
            return; // break?
        } else {
            switch(code) {
            case '200':
                if(this._transport.securityInfo) {
                    this._transport.securityInfo.QueryInterface(Ci.nsISSLSocketControl);
                    this._transport.securityInfo.proxyStartSSL();
                }
                this._log('DEBUG ::: proxy nego ok');

                this._setState('ready');
                break;
            default:
                this._setState('error', ['proxy refused connection', code]);
                this._setState('disconnected');
                this._log('DEBUG ::: proxy nego fail');
                break;
            }
        }
    },

    _log: function(msg) {
        if(this._logger)
            this._logger('SOCKET-' + this._id + '/' + msg);
    }
};


