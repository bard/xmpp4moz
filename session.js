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

// ----------------------------------------------------------------------
// DEFINITION OF FSM TRANSITIONS

var stateTransitions = {
    normalSession: {
        connect:      { ok: 'open',         ko: 'offline' },
        open:         { ok: 'authenticate', ko: 'offline' },
        authenticate: { ok: 'online',       ko: 'close'   },
        online:       { },
        close:        { ok: 'disconnect' },
        disconnect:   { ok: 'offline'    },
        offline:      { }
    },
    registrationSession: {
        connect:    { ok: 'open',      ko: 'offline' },
        open:       { ok: 'register',  ko: 'offline' },
        register:   { ok: 'close',     ko: 'close'   },
        close:      { ok: 'disconnect' },
        disconnect: { ok: 'offline'    },
        offline:    { }
    }
};

var fsm         = module.require('package', 'lib/fsm');
var mixin       = module.require('package', 'lib/mixin');
var element     = module.require('package', 'xmppjs/element');
var Parser      = module.require('class', 'xmppjs/parser');
var JID         = module.require('class', 'xmppjs/id');
var EventHelper = module.require('class', 'lib/event_helper');

const charsetConverter = Components.
    classes["@mozilla.org/intl/scriptableunicodeconverter"].
    getService(Components.interfaces.nsIScriptableUnicodeConverter);
charsetConverter.charset = "UTF-8";

function constructor(opts) {
    opts = opts || {};
    var session = this;

    var eventHelper = new EventHelper();
    mixin.forward(this, 'on', eventHelper);
    mixin.forward(this, 'forget', eventHelper);
    mixin.forward(this, '_handle', eventHelper);

    this._parser = new Parser();
    this._parser.on(
        'start', function(sessionID) {
            session._stream('start', sessionID);
        },
        'stop', function() {
            session._stream('stop');
        },
        'stanza', function(element) {
            session._stanza('in', element);
        });

    this._log = opts.logger || {
        enter: function() {},
        leave: function() {},
        trace: function() {}
    };

    this._idCounter = 1000;
    this._pending = {};
    this._setState('offline');

    this._fsm = new fsm.FSM();
    this._fsm.context = this;
    this._fsm.stateHandlers = this;
    this._fsm.stateTransitions = stateTransitions.normalSession;
    this._fsm.on(
        'state/enter', function(stateName) {
            this._setState(stateName);
        });

    this.__defineGetter__( 'state', function() { return this._state; });
}

// ----------------------------------------------------------------------
// CLIENT OPERATIONS

function signOn(opts) {
    this._log.enter(arguments);

    var jid = new JID(opts.userID);

    this.userID = opts.userID;
    this.username = jid.username;
    this.resource = jid.resource;
    this.password = opts.userPassword;
    this.transport = opts.transport;
    this.server = jid.hostname;

    this._fsm.go('connect');

    this._log.leave();
}

function registerID(opts) {
    this._log.enter(arguments);

    var jid = new JID(opts.userID);
    
    this.transport = opts.transport;
    this.username = jid.username;
    this.server = jid.hostname;
    this.password = opts.userPassword;

    var machine =  new fsm.FSM();
    machine.context = this;
    machine.stateHandlers = this;
    machine.stateTransitions = stateTransitions.registrationSession;
    machine.on(
        'state/enter', function(stateName) {
            this._setState(stateName);
        });
    machine.go('connect');

    this._log.leave();
}

function send(stanza, replyHandler) {
    this._send(stanza, replyHandler);
}

function signOff() {
    this._fsm.go('close');
}

function subscribeToPresence(jid) {
    this._send(element.presence({type: 'subscribe', to: jid}));
}

function acceptPresenceSubscription(jid) {
    this._send(element.presence({type: 'subscribed', to: jid}));
}

function cancelPresenceSubscription(jid) {
    this._send(element.iq('set', 'roster/remove', {jid: jid}));
}

function sendPresence(type, opts) {
    opts = opts || {};

    var presence = element.presence({type: type, show: opts.show, to: opts.to})
    this._send(presence);
    this._handle('out/presence', presence);
}

function joinRoom(service, room, nick) {
    if(this._state != 'online') {
        // throw exception
        return;
    }

    var p = element.presence({to: room + '@' + service + '/' + nick});
    this._send(p);
}

function sendMessage(to, body, type) {
    var message = element.message({
        to: to,
        body: body,
        type: type || 'normal'});
    this._send(message);
    this._handle('out/message', message);
}

function requestRoster() {
    if(this._state != 'online') {
        // possibly throw an exception
    } else {
        this._send(element.iq('get', 'roster'));
    }
}

function sessionID() {
    return this._sessionID;
}

// ----------------------------------------------------------------------
// STATE HANDLERS

function connect(continuation) {
    this.on(
        'connectSuccess', function() {
            continuation('ok');
        });

    var session = this;
    this.transport.on(
        'data', function(data) {
            session._data('in', data);
        },
        'stop', function() {
            session._serverDisconnected();
        });
    this.transport.connect();

    this._handle('connectSuccess', session);
}

function open(continuation) {
    this.on(
        'openSuccess', function() {
            continuation('ok');
        });

    this._send('<?xml version="1.0"?>' +
                '<stream:stream xmlns="jabber:client" ' +
                'xmlns:stream="http://etherx.jabber.org/streams" ' +
                'to="' + this.server + '">');
}

function authenticate(continuation) {
    this._send(
        element.iqAuth({
            username: this.username,
            resource: this.resource,
            password: this.password
            }),
        function(session, reply) {
            if(reply.getAttribute('type') == 'result')
                continuation('ok');
            else
                continuation('ko');
        });
}

function online(continuation) {
    continuation('ok');
}

function close(continuation) {
    this._send('</stream:stream>');
    continuation('ok');
}

function disconnect(continuation) {
    this.transport.disconnect();
    continuation('ok');
}

function offline(continuation) {

}

function register(continuation) {
    this._send(
        element.iqRegister({
            username: this.username,
            password: this.password
            }),
        function(session, iq) {
            continuation('ok');
        });    
}

// ----------------------------------------------------------------------
// INTERNALS

function _setState(s) {
    this._log.enter(arguments);

    this._state = s;
    
    this._handle('state', this._state);

    this._log.leave();
}

/**
 * Send a stanza, optionally registering a function that will be
 * called when a reply to that stanza is received
 */
 
function _send(element, replyHandler) {
    this._log.enter(arguments);

    if(element.xml &&
       (replyHandler || element.xml.name().toString() == 'iq')) {
        element.xml.@id = this._idCounter;
        this._idCounter += 1;
    }

    if(replyHandler) 
        this._pending[element.xml.@id.toString()] = replyHandler;

    var data = charsetConverter.ConvertFromUnicode(element.toString());

    this.transport.write(data);

    this._handle('out/data', data);

    this._log.leave();
}

function _startConnectionMonitor() {
    if(this.TESTING)
        return;
    var session = this;
    this._monitorInterval = setInterval(function() { session._send(' '); }, 10000);
}

/**
 * Invoked from transport when other end closes TCP connection.
 *
 */

function _serverDisconnected() {
    this._log.enter(arguments);
    clearInterval(this._monitorInterval);
    this._fsm.go('disconnect');
    this._handle('server disconnect', this);
    this._log.leave();
}

/**
 * Invoked when parser gets an XML stanza.
 *
 */

function _stanza(direction, stanza) {
    this._log.enter(arguments);

    stanza = element.wrap(stanza);
    this._handle('in/element', stanza);

    var id = stanza.getId();
    if(id && id in this._pending) {
        this._pending[id](this, stanza);
        delete this._pending[id];
    }
    
    switch(stanza.nodeName) {
    case 'presence':
        this._handle('in/presence', stanza);
        break;
        
    case 'message':
        this._handle('in/message', stanza);
        break;
        
    case 'iq':
        this._handle('in/iq', stanza);
        
        var nameSpace = stanza.getNameSpace();
        if(nameSpace)
            this._handle('in/iq/' + nameSpace, stanza);
        break;
        
    default:
        throw new Error('Unrecognized element. (' + stanza.nodeName + ')');
        break;
    }

    this._log.leave();
}

/**
 * Invoked when socket has data available.
 * 'direction' parameter unused for now
 *
 */

function _data(direction, data) {
    data = charsetConverter.ConvertToUnicode(data);

    this._log.enter(arguments);

    this._handle('in/data', data);

    this._parser.parse(data);

    this._log.leave();
}

/**
 * Invoked when parser seens start or end of stream.
 *
 */

function _stream(phase, sessionID) {
    this._log.enter(arguments);
 
    if(phase == 'start') {
        this._sessionID = sessionID;
        this._handle('openSuccess', this);
    }
    else {
        this._handle('serverClosedStream', this);
    }

    this._log.leave();
}

