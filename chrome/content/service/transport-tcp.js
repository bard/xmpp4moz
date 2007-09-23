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


// INITIALIZATION
// ----------------------------------------------------------------------

function init(host, port, ssl) {
    this._host            = host;
    this._port            = port;
    this._ssl             = ssl;
    this._observers       = [];
    this._connected       = false;
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
}


// PUBLIC INTERFACE
// ----------------------------------------------------------------------

function write(data) {
    try {
        return this._outstream.writeString(data);
    } catch(e if e.name == 'NS_BASE_STREAM_CLOSED') {
        this.onClose();
    }
}

function isConnected() {
    return this._connected;
}

function connect() {
    if(this._connected)
        return;

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

function asyncRead(listener) {
    this._listener = listener;
}

function disconnect() {
    this.onClose();
}

// XXX implement "topic" and "ownsWeak" parameters as per IDL interface
function addObserver(observer) {
    this._observers.push(observer);    
}

// XXX implement "topic" parameter as per IDL interface
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
            // XXX possibly remove buggy observers
        }
}


// INTERNALS
// ----------------------------------------------------------------------

function onConnect() {
    this._connected = true;
    this.notifyObservers(xpWrapped('stub'), xpWrapped('start'), null);
    this.startKeepAlive();
}

function onClose() {
    if(!this._connected)
        return;

    this._instream.close();
    this._outstream.close();
    this._keepAliveTimer.cancel();
    this._connected = false;
    this.notifyObservers(xpWrapped('stub'), xpWrapped('stop'), null);
}

function startKeepAlive() {
    var transport = this;
    this._keepAliveTimer.initWithCallback({
        notify: function(timer) { transport.write(' '); }
    }, 30000, Ci.nsITimer.TYPE_REPEATING_SLACK);
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
    case Ci.nsISocketTransport.STATUS_CONNECTED_TO:
        // If using a proxy, we'll only be sure about connection when
        // we get a response from the proxy, in onDataAvailable.
        if(this._proxyInfo) {
            this.write('CONNECT ' + this._host + ':' + this._port + ' HTTP/1.0\r\n\r\n');
        } else {
            this.onConnect();
        }
        break;
    }
}

// nsIStreamListener

function onStartRequest(request, context) {
    this._listener.onStartRequest.apply(null, arguments);
}

// nsIStreamListener

function onStopRequest(request, context, status) {
    this._listener.onStopRequest.apply(null, arguments);
    if(status != 0)
        dump('Error! ' + status);
    
    this.onClose();
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
        this.onConnect();
    } else {
        throw new Error('proxy negotiation failed.');
    }

    // Proxy setup done, move to a simpler data handler.

    this.onDataAvailable = this.onDataAvailable_normalOperation;
}

// nsIStreamListener

function onDataAvailable_normalOperation(request, context, inputStream, offset, count) {
    this._listener.onDataAvailable.apply(null, arguments);
}