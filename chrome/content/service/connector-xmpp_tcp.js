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
var Cu = Components.utils;

var srvSocketTransport = Cc["@mozilla.org/network/socket-transport-service;1"]
.getService(Ci.nsISocketTransportService);
var srvProxy = Cc['@mozilla.org/network/protocol-proxy-service;1']
.getService(Ci.nsIProtocolProxyService);
var srvIO = Cc['@mozilla.org/network/io-service;1']
.getService(Ci.nsIIOService);

const STREAM_PROLOGUE =
    '<?xml version="1.0"?>' +
    '<stream:stream xmlns="jabber:client" ' +
    'xmlns:stream="http://etherx.jabber.org/streams" ' +
    'to="<SERVER>">';
const STREAM_EPILOGUE =
    '</stream>';

// INITIALIZATION
// ----------------------------------------------------------------------

function init(jid, password, host, port, ssl) {
    this._jid             = jid;
    this._password        = password;
    this._host            = host;
    this._port            = port;
    this._ssl             = ssl;

    this._observers       = [];
    this._keepAliveTimer  = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
    this._proxyInfo       = srvProxy.resolve(
        srvIO.newURI((ssl ? 'https://' : 'http://') + host, null, null), 0);
    this._socketTransport = ssl ?
        srvSocketTransport.createTransport(['ssl'], 1, host, port, this._proxyInfo) :
        srvSocketTransport.createTransport(null, 0, host, port, this._proxyInfo);
    this._socketTransport.setEventSink(this, getCurrentThreadTarget());
    this.onDataAvailable = this._proxyInfo ?
        this.onDataAvailable_prepareProxy :
        this.onDataAvailable_normalOperation;
    this._doc = Cc['@mozilla.org/xml/xml-document;1']
        .createInstance(Ci.nsIDOMXMLDocument);
}


// PUBLIC INTERFACE
// ----------------------------------------------------------------------

function setSession(session) {
    this._session = session;
}

function connect() {
    if(this.isConnected())
        return;

    this.setState('connecting');

    var baseOutstream = this._socketTransport.openOutputStream(0,0,0);
    this._outstream = Cc['@mozilla.org/intl/converter-output-stream;1']
    .createInstance(Ci.nsIConverterOutputStream);
    this._outstream.init(baseOutstream, 'UTF-8', 0, '?'.charCodeAt(0));
    
    this._instream = this._socketTransport.openInputStream(0,0,0);
    var inputPump = Cc['@mozilla.org/network/input-stream-pump;1']
    .createInstance(Ci.nsIInputStreamPump);
    inputPump.init(this._instream, -1, -1, 0, 0, false);

    inputPump.asyncRead(this, null);
}

function disconnect() {
    this.write(STREAM_EPILOGUE);
    this.disconnectedBaseTransport();
}

function isConnected() {
    return ['authenticating', 'active'].indexOf(this._state) != -1;
}

function deliver(element) {
    // XXX metadata could arrive up to here as it might contain info
    // useful to the transport (so will need to be stripped here)
    this.write(serialize(element));
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
    subject = xpWrapped(subject);

    for each(var observer in this._observers) 
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Cu.reportError(e);
        }
}


// INTERNALS
// ----------------------------------------------------------------------

function connectedBaseTransport() {
    this.notifyObservers('start', 'transport', null);
    this.setState('connected');

    this.openStream(function() { this.startKeepAlive(); });
}

function disconnectedBaseTransport() {
    if(!this.isConnected())
        return;

    // this._instream.close();
    // this._outstream.close();
    this._socketTransport.close(0);
    
    this.notifyObservers('stop', 'transport', null);
    this.setState('disconnected');
}

function openedIncomingStream() {
    this.notifyObservers('open', 'stream-in', null);
    if(JID(this._jid).username)
        this.authenticate();
    else
        this.setState('active');
}

function closedIncomingStream() {
    this.stopKeepAlive();
    this.disconnect();
    this.notifyObservers('close', 'stream-in', null);    
}

function receivedElement(element) {
    switch(this._state) {
    case 'authenticating':
        switch(element.getAttribute('type')) {
        case 'result':
            this.setState('active');
            break;
        case 'error':
            this.setState('error');
            this.disconnect();
            break;
        }
        break;
    case 'active':
        this._session.receive(element);
        break;
    default:
        throw new Error('Invalid state. (' + this._state + ')');
    }
}

function setState(name) {
    this._state = name;
    this.notifyObservers(name, 'connector', null);
}

function authenticate() {
    this.setState('authenticating');
    this.write(<iq type="set" id="auth01">
               <query xmlns="jabber:iq:auth">
               <username>{JID(this._jid).username}</username>
               <resource>{JID(this._jid).resource}</resource>
               <password>{this._password}</password>
               </query>
               </iq>);
}

function openStream(continuation) {
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

    var transport = this, doc = this._doc;

    this._parser.contentHandler = {
        startDocument: function() {
            transport.openedIncomingStream();
        },
        
        endDocument: function() {
            transport.closedIncomingStream();
        },
        
        startElement: function(uri, localName, qName, attributes) {
            // Filter out.  These are supposed to be local only --
            // accepting them from outside can cause serious mess.
            // Should probably be filtered by session.
            if(uri == 'http://hyperstruct.net/xmpp4moz' && localName == 'meta')
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
            else if(['message', 'iq', 'presence'].indexOf(localName) != -1)
                this._element = e;
            else
                dump('--- xmpp4moz: started non-stanza element: ' + localName + '\n');
        },
        
        endElement: function(uri, localName, qName) {
            if(!this._element)
                return;
            
            if(this._element.parentNode) {
                this._element = this._element.parentNode;
            } else {
                this._element.normalize();
                transport.receivedElement(this._element);
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
    
    this.write(STREAM_PROLOGUE.replace('<SERVER>', JID(this._jid).hostname));
    this.notifyObservers('open', 'stream-out', null);
    continuation.call(this);
}

function startKeepAlive() {
    var transport = this;
    this._keepAliveTimer.initWithCallback({
        notify: function(timer) { transport.write(' '); }
    }, 30000, Ci.nsITimer.TYPE_REPEATING_SLACK);
}

function stopKeepAlive() {
    this._keepAliveTimer.cancel();
}

function write(data) {
    try {
        return this._outstream.writeString(data);
    } catch(e if e.name == 'NS_BASE_STREAM_CLOSED') {
        this.disconnectedBaseTransport();
    }
}

function serialize(element) {
    var serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1'].getService(Ci.nsIDOMSerializer);
    serialize = function(element) {
        return serializer.serializeToString(element);
    };
    return serialize(element);
}

function xpWrapped(string) {
    if(string instanceof Ci.nsISupportsString)
        return string;
    else if(typeof(string) == 'string') {
        var xpcomized = Cc['@mozilla.org/supports-string;1']
        .createInstance(Ci.nsISupportsString);
        xpcomized.data = string;
        return xpcomized;
    } else
        throw new Error('Not an XPCOM nor a Javascript string. (' + string + ')');
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

function getCurrentThreadTarget() {
    if('@mozilla.org/thread-manager;1' in Cc)
        return Cc['@mozilla.org/thread-manager;1'].getService().currentThread;
    else
        return Cc['@mozilla.org/event-queue-service;1'].getService(Ci.nsIEventQueueService)
            .createFromIThread(
                Cc['@mozilla.org/thread;1'].getService(Ci.nsIThread), true)
}

// nsITransportEventSink

function onTransportStatus(transport, status, progress, progressMax) {
    switch(status) {
    case Ci.nsISocketTransport.STATUS_CONNECTING_TO:
        break;
    case Ci.nsISocketTransport.STATUS_CONNECTED_TO:
        // If using a proxy, we'll only be sure about connection when
        // we get a response from the proxy, in onDataAvailable.
        if(this._proxyInfo) {
            this.write('CONNECT ' + this._host + ':' + this._port + ' HTTP/1.0\r\n\r\n');
        } else {
            this.connectedBaseTransport();
        }
        break;
    }
}

// nsIStreamListener

function onStartRequest(request, context) {
    this._parser.onStartRequest.apply(null, arguments);
}

// nsIStreamListener

function onStopRequest(request, context, status) {
    this._parser.onStopRequest.apply(null, arguments);
    if(status != 0)
        dump('Error! ' + status);
    
    this.disconnectedBaseTransport();
}

// nsIStreamListener

function onDataAvailable_prepareProxy(request, context, inputStream, offset, count) {
    var str = Cc['@mozilla.org/scriptableinputstream;1'] 
    .createInstance(Ci.nsIScriptableInputStream);
    str.init(inputStream);
    
    if(str.read(count).match(/^HTTP\/1.0 200/)) {
        if(this._socketTransport.securityInfo) {
            this._socketTransport.securityInfo.QueryInterface(Ci.nsISSLSocketControl);
            this._socketTransport.securityInfo.proxyStartSSL();
        }
        this.connectedBaseTransport();
    } else {
        throw new Error('proxy negotiation failed.');
    }

    // Proxy setup done, move to a simpler data handler.

    this.onDataAvailable = this.onDataAvailable_normalOperation;
}

// nsIStreamListener

function onDataAvailable_normalOperation(request, context, inputStream, offset, count) {
    this._parser.onDataAvailable.apply(null, arguments);
}
