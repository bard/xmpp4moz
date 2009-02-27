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
    'Socket'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var Cr = Components.results;

var srvSocketTransport = Cc["@mozilla.org/network/socket-transport-service;1"]
    .getService(Ci.nsISocketTransportService);
var srvProxy = Cc['@mozilla.org/network/protocol-proxy-service;1']
    .getService(Ci.nsIProtocolProxyService);
var srvIO = Cc['@mozilla.org/network/io-service;1']
    .getService(Ci.nsIIOService);

var SECURITY_NONE     = 0;
var SECURITY_SSL      = 1;
var SECURITY_STARTTLS = 2;

Cu.import('resource://xmpp4moz/log.jsm');
Cu.import('resource://xmpp4moz/utils.jsm');


// API
// ----------------------------------------------------------------------

function Socket(host, port, security, jid) {
    this._host = host;
    this._port = port;
    this._security = security || SECURITY_NONE;
    this._proxy_info = srvProxy.resolve(
        srvIO.newURI((this._security == SECURITY_SSL ? 'https://' : 'http://') + this._host, null, null),
        null);
    this._listener = null;
    this._transport = null;
    this._reply_timeout = null;
    this._log = Log.getSource('socket', {account: jid, id: Date.now()});

    this._state = 'disconnected';
}

// Sets a listener which will get events from the socket.
//
// Listener must implement the following interface:
//
// - onReady()
// - onTimeout()
// - onDataAvailable(request, context, inputStream, offset, count)
// - onClose()
// - onBadCertificate()

Socket.prototype.setListener = function(listener) {
    if(this._listener)
        throw new Error('Listener already set.');
    this._listener = listener;
};

// Sets a timeout before which we must receive data (any data)
// from the other side, otherwise the sock disables itself and
// invokes listener's onTimeout().
//
// Needed for LP#242098.

Socket.prototype.setReplyTimeout = function(msecs) {
    this._log.send({debug: 'setting reply timeout to ' + msecs});
    var socket = this;
    this._reply_timeout = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
    this._reply_timeout.initWithCallback({
        notify: function(timer) {
            socket._reply_timeout = null;
            socket.close();
            socket._setState('timeout');
        }
    }, msecs, Ci.nsITimer.TYPE_ONESHOT);
};

// Connects the socket.

Socket.prototype.connect = function() {
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
};

// Closes the socket.

Socket.prototype.close = function() {
    if(this._transport)
        this._transport.close(0);
};

Socket.prototype.send = function(data) {
    if(!(this._state == 'ready' ||
         this._state == 'active'))
        throw new Error('Trying to send data over inactive socket.');

    return this._send(data);
};

Socket.prototype.startTLS = function(onSuccess) {
    this._transport.securityInfo.StartTLS();
};

// INTERNALS
// ----------------------------------------------------------------------

Socket.prototype.onTransportStatus = function(transport, status, progress, progressMax) {
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
    case Ci.nsISocketTransport.STATUS_RECEIVING_FROM:
        this._clearReplyTimeout();
        break;
    default:
        break;
    }
};

Socket.prototype.onStartRequest = function() {
    this._log.send({debug: 'request started'});
};

Socket.prototype.onStopRequest = function() {
    this._log.send({debug: 'request stopped'});
    this._clearReplyTimeout();
    this._setState('disconnected');
};

Socket.prototype.onDataAvailable = function(request, context, inputStream, offset, count) {
    switch(this._state) {
    case 'proxynego':
        var stream = Cc['@mozilla.org/scriptableinputstream;1']
            .createInstance(Ci.nsIScriptableInputStream);
        stream.init(inputStream);
        var response = stream.read(count);
        this._log.send({received: response});

        this._handleProxyResponse(response);
        break;
    case 'ready':
    case 'active':
        this._setState('active', arguments);
        break;
    }
};

Socket.prototype._send = function(data) {
    // Low-level _send() needs to be used in more states than
    // send(), which is public API and just used during "active"
    // and "ready" state.
    if(!(this._state == 'ready' ||
         this._state == 'proxynego' ||
         this._state == 'active'))
        throw new Error('Trying to send data outside of a reasonable state.');

    this._log.send({
        state: 'SEND',
        data: asString(data)
            .replace(/(<auth mechanism.+?>)([^<]+)/, '$1[password hidden in log]')});

    try {
        return this._outstream.writeString(asString(data));
    } catch(e if e.name == 'NS_BASE_STREAM_CLOSED') {
        this._setState('disconnected');
    }
};

Socket.prototype._clearReplyTimeout = function() {
    if(!this._reply_timeout)
        return;

    this._log.send({debug: 'cancelling timeout'});
    this._reply_timeout.cancel();
    this._reply_timeout = null;
};

Socket.prototype._setState = function(state, stateInfo) {
    var previousState = this._state;
    this._log.send({previous: previousState, current: state, info: stateInfo || ''});
    this._state = state;
    switch(state) {
    case 'ready':
        this._listener.onReady();
        break;
    case 'active':
        this._listener.onDataAvailable.apply(null, stateInfo);
        break;
    case 'timeout':
        if(previousState == 'ready' ||
           previousState == 'active') // Avoid calling onTimeout if we're in error state
            this._listener.onTimeout();
        break;
    case 'disconnected':
        if(previousState == 'active' ||
           previousState == 'connecting' ||
           previousState == 'resolving' ||
           previousState == 'disconnected')
            this._listener.onClose();
        break;
    case 'error':
        if(stateInfo == 'badcert')
            this._listener.onBadCertificate();
        break;
    }
};

Socket.prototype._createTransport = function() {
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
};

Socket.prototype._handleProxyResponse = function(response) {
    var [match, code] = response.match(/^HTTP\/1.\d (\d{3})/);
    if(!match) {
        this._setState('error', ['bad proxy response', response]);
        this.close();
        this._log.send({debug: 'proxy nego fail'});
        return; // break?
    } else {
        switch(code) {
        case '200':
            if(this._transport.securityInfo) {
                this._transport.securityInfo.QueryInterface(Ci.nsISSLSocketControl);
                this._transport.securityInfo.proxyStartSSL();
            }
            this._log.send({debug: 'proxy nego ok'});

            this._setState('ready');
            break;
        default:
            this._setState('error', ['proxy refused connection', code]);
            this._setState('disconnected');
            this._log.send({debug: 'proxy nego fail'});
            break;
        }
    }
};

function getCurrentThreadTarget() {
    if('@mozilla.org/thread-manager;1' in Cc)
        return Cc['@mozilla.org/thread-manager;1'].getService().currentThread;
    else
        return Cc['@mozilla.org/event-queue-service;1'].getService(Ci.nsIEventQueueService)
            .createFromIThread(
                Cc['@mozilla.org/thread;1'].getService(Ci.nsIThread), true)
}