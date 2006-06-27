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


var Specification = mozlab.mozunit.Specification;
var assert        = mozlab.mozunit.assertions;
var module        = new ModuleManager(['../..']);
var Session       = module.require('class', 'xmppjs/session');
var stanza        = module.require('package', 'xmppjs/stanza');
var mocks         = module.require('package', 'xmppjs/test/mocks');

var spec = new Specification('Session');
    
spec.stateThat = {

    // Excersising state handlers, individually and as driven by state machine

    'Connecting session causes underlying transport to connect': function() {
        var session = new Session();
        var transport = new mocks.Socket();
            
        assert.isFalse(transport.isConnected());
        session.transport = transport;
        session.connect(function() {});
        assert.isTrue(transport.isConnected());
    },

    'After connecting, session opens the XML stream': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var data;
        session.transport = transport;
        session.server = 'localhost';
        session.on(
            'in/data', function(d) {
                data = d;
            });

        session._fsm.go('connect');
            
        assert.equals('open', session.state);
        assert.equals('<?xml version="1.0"?>' +
                      '<stream:stream xmlns="jabber:client" ' +
                      'xmlns:stream="http://etherx.jabber.org/streams" '+
                      'to="localhost">', transport.otherSide.read());

        transport.otherSide.openStream();
        assert.equals("<?xml version='1.0'?>" +
                      "<stream:stream xmlns='jabber:client' " +
                      "xmlns:stream='http://etherx.jabber.org/streams' " +
                      "id='2622060002' from='localhost' xml:lang='en'>", data);
        assert.equals('2622060002', session.sessionID());

    },

    'Successful authentication leads to "online" state': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var data;
        session.on(
            'in/data', function(d) {
                data = d;
            });

        session.transport = transport;
        session.username = 'jsjab';
        session.password = 'secret';
        session.resource = 'mozilla';
        session._fsm.go('connect');
            
        assert.equals('open', session.state);

        transport.otherSide.openStream();
        assert.equals('authenticate', session.state);
        assert.equals('<iq type="set" id="1000">' +
                      '<query xmlns="jabber:iq:auth">' +
                      '<username>jsjab</username>' +
                      '<password>secret</password>' +
                      '<resource>mozilla</resource>' +
                      '</query></iq>', transport.otherSide.read());

        transport.otherSide.acceptAuth();
        assert.equals("<iq type='result' id='1000'/>", data);
        assert.equals('online', session.state);
    },

    'Exceptions are raised when state is called from other states where it is not expected': function() {
        // assert.fail('Write me');
    },
        
    'States of a successfull session are "connect", "open", "authenticate", "online", "close", "offline"': function() {
        var session = new Session();
        var transport = new mocks.Socket();
        var log = [];

        session.server = 'localhost';
        session.username = 'jsjab';
        session.resource = 'mozilla';
        session.password = 'secret';
        session.transport = transport;
        session.on(
            'state', function(state) {
                log.push(state);
            });

        session._fsm.go('connect');
        transport.otherSide.openStream();
        transport.otherSide.acceptAuth();

        session._fsm.go('close');
        transport.otherSide.closeStream();
            
        assert.equals('connect, open, authenticate, ' +
                      'online, close, disconnect, offline',
                      log.join(', '));
    },
        
    // Higher level client functionality

    'signOn() brings from offline to online': function() {
        var session = new Session();
        var transport = new mocks.Socket();
        var callbackCalled;
    
        session.signOn({
            transport: transport,
            userID: 'jsjab@localhost/mozilla',
            userPassword: 'secret'});
        
        transport.otherSide.acceptSignOn();
        assert.equals('online', session.state);
    },

    'Session can notify its presence after going online': function() {
        var session = new Session();
        var transport = new mocks.Socket();
            
        session.signOn({
            transport: transport,
            userID: 'jsjab@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        session.sendPresence();
    
        assert.equals('<presence/>', transport.otherSide.read());
    },

    'Session can send a message': function() {
        var session = new Session();
        var transport = new mocks.Socket();
            
        session.signOn({
            transport: transport,
            userID: 'jsjab@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        session.sendMessage('man@future.com', '42!');
    
        assert.equals('<message to="man@future.com" type="normal">' +
                      '<body>42!</body></message>', transport.otherSide.read());
    },

    'Session can perform a registration': function() {
        var session = new Session();
        var transport = new mocks.Socket();
            
        var states = [];
        session.on(
            'state', function(state) {
                states.push(state);
            });

        var registrationSuccessful;

        var whenRegistered = session.on(
            'in/iq/jabber:iq:register', function(iq) {
                if(iq.getType() == 'result') 
                    registrationSuccessful = true;
                session.forget('in/iq/jabber:iq:register', whenRegistered);
            });

        session.registerID({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret' });

        transport.otherSide.openStream();

        assert.equals('<iq type="set" id="1000">' +
                      '<query xmlns="jabber:iq:register">' +
                      '<username>foo</username>' +
                      '<password>secret</password>' +
                      '</query></iq>', transport.otherSide.read());

        transport.otherSide.acceptRegistration();
        transport.otherSide.closeStream();
    
        assert.isTrue(registrationSuccessful);
        assert.equals('connect, open, register, close, disconnect, offline',
                      states.join(', '));
    },

    'Session can request to subscribe to the presence of another user': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'});
        transport.otherSide.acceptSignOn();

        session.subscribeToPresence('deepthought@future.com');
        assert.equals('<presence to="deepthought@future.com" type="subscribe"/>',
                      transport.otherSide.read());

        var presence;
        session.on(
            'in/presence', function(p) {
                presence = p;
            });

        transport.otherSide.authorizePresenceSubscription();
    
        assert.equals('subscribed', presence.getType());
        assert.equals('deepthought@future.com/dolphin', presence.getFrom());
    },

    'Outgoing <iq>s are stamped with incrementing id values': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'});
        transport.otherSide.acceptSignOn();
        
        session._send(stanza.iq('get', 'roster'));
        assert.equals(
            '<iq type="get" id="1001"><query xmlns="jabber:iq:roster"/></iq>',
            transport.otherSide.read());

        session._send(stanza.iq('get', 'roster'));
        assert.equals(
            '<iq type="get" id="1002"><query xmlns="jabber:iq:roster"/></iq>',
            transport.otherSide.read())
    },

    // Callbacks on various events

    'Callback is called on stream opening': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var streamStartedSeen;
        session.on(
            'openSuccess', function() {
                streamStartedSeen = true;
            });
        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });

        transport.otherSide.openStream();

        assert.isTrue(streamStartedSeen);
    },

    'Callback is called when stanza is received': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var stanza;
        session.on( 
           'in/stanza', function(e) {
                stanza = e;
            });

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        assert.equals('iq', stanza.nodeName);
        assert.equals('result', stanza.getAttribute('type'));
        assert.equals('1000', stanza.getAttribute('id'));
    },

    'Received stanza has a reference to the session is has been carried by': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var stanza;
        session.on(
            'in/stanza', function(e) {
                stanza = e;
            });

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();
        
        assert.equals(session, stanza.session);
    },

    'Callback is called when data is sent': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var data;
        session.on(
            'out/data', function(d) {
                data = d;
            });
            
        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        assert.matches(/^<\?xml version="1\.0"/, data);
    },

    'Callback is called when data is received': function() {
        var session = new Session();
        var transport = new mocks.Socket();
            
        var data;
        session.on(
            'in/data', function(d) {
                data = d;
            });
        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });

        transport.otherSide.openStream();
    
        assert.matches(/^<\?xml version='1\.0'/, data);
    },

    'Callback is called when session state changes': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var state;
        session.on(
            'state', function(s) {
                state = s;
            });
        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
    
        assert.equals('open', state);
    },

    // Stanza handlers

    'Arbitrary IQ can be handled': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        var iq;
        session.on(
            'in/iq/foo:bar', function(i) {
                iq = i;
            });

        transport.otherSide.write("<iq from='jsjab@localhost/mozilla' " +
                                  "to='jsjab@localhost/mozilla' " +
                                  "type='result'><query xmlns='foo:bar'></query></iq>");
    
        assert.isDefined(iq);
    },

    'Example of scheduling a one-time action for just after a state is reached': function() {
        var session = new Session();
        var transport = new mocks.Socket();
        var callbackCalled, forgottenCallback;
    
        var whenOnline = session.on(
            'state', function(state) {
                if(state == 'online') {
                    callbackCalled = true;
                    forgottenCallback = session.forget('state', whenOnline);
                }                
            });
        assert.isDefined(whenOnline);

        session.signOn({
            transport: transport,
            userID: 'jsjab@localhost/mozilla',
            userPassword: 'secret'});
        
        transport.otherSide.acceptSignOn();
        assert.isTrue(callbackCalled);
        assert.equals(forgottenCallback, whenOnline);
    },
    
    'Example of handling failed authentication': function() {
        var session = new Session();
        var transport = new mocks.Socket();
            
        var userNotified;
        session.on(
            'in/iq/jabber:iq:auth', function(iq) {
                if(iq.getType() == 'error') 
                    userNotified = true;
            });

        var states = [];
        session.on(
            'state', function(state) {
                states.push(state);
            })

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.openStream();
        transport.otherSide.rejectAuth();
        transport.otherSide.closeStream();

        assert.equals('connect, open, authenticate, close, disconnect, offline',
                      states.join(', '));
        assert.isTrue(userNotified);
    },
        
    'Example of handling stream closed by the other side': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        var userNotified;
        session.on(
            'serverClosedStream', function(session) {
                if(session.state == 'online') {
                    session._fsm.go('close'); // XXX should be done internally
                    userNotified = true;
                }
            });

        var states = [];
        session.on(
            'state', function(state) {
                states.push(state);
            })

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();
        transport.otherSide.closeStream();

        assert.equals('connect, open, authenticate, ' +
                      'online, close, disconnect, offline',
                      states.join(', '));
        assert.isTrue(userNotified);
    },

    'Example of handling roster entries': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        var iq;
        session.on(
            'in/iq/jabber:iq:roster', function(i) {
                iq = i;
            });

        session.requestRoster();
        assert.equals('<iq type="get" id="1001"><query xmlns="jabber:iq:roster"/></iq>',
                      transport.otherSide.read());

        transport.otherSide.sendRoster();

        assert.isDefined(iq);
        assert.equals('foo@localhost', iq.getItems()[0]);
        assert.equals('bar@localhost', iq.getItems()[1]);    
    },
    
    'Example of handling presence stanzas': function() {
        var session = new Session();
        var transport = new mocks.Socket();
    
        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        var presence;
        session.on(
            'in/presence', function(p) {
                presence = p;
            });

        transport.otherSide.write("<presence from='foo@localhost/mozilla' " +
                                  "to='jsjab@localhost/mozilla'/>");

        assert.isDefined(presence);
        assert.equals('foo@localhost/mozilla', presence.getFrom());
        assert.equals('available', presence.getType());
        assert.equals('jsjab@localhost/mozilla', presence.getTo());

        transport.otherSide.write("<presence from='foo@localhost/mozilla' " +
                                  "to='jsjab@localhost/mozilla'>" +
                                  "<show>away</show>" +
                                  "</presence>");

        assert.equals('foo@localhost/mozilla', presence.getFrom());
        assert.equals('available', presence.getType());
        assert.equals('jsjab@localhost/mozilla', presence.getTo());
        assert.equals('away', presence.getShow());

        session.on(
            'out/presence', function(p) {
                presence = p;
            });

        session.sendPresence('available', {show: 'dnd'});
        assert.equals('dnd', presence.getShow());
    },
        
    'Example of handling sending of messages': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        session.signOn({
            transport: transport,
            userID: 'jsjab@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        var message;
        session.on(
            'out/message', function(m) {
                message = m;
            });

        session.sendMessage('man@future.com', '42!');
        assert.equals('42!', message.getBody());
        assert.equals('man@future.com', message.getTo());
    },

    'Example of handling reception of messages': function() {
        var session = new Session();
        var transport = new mocks.Socket();

        session.signOn({
            transport: transport,
            userID: 'foo@localhost/mozilla',
            userPassword: 'secret'
            });
        transport.otherSide.acceptSignOn();

        var message;
        session.on(
            'in/message', function(m) {
                message = m;
            });

        transport.otherSide.write('<message from="foo@localhost/mozilla">' +
                                  '<body>Hello, world!</body></message>');
        assert.isDefined(message);
        assert.equals('foo@localhost/mozilla', message.getFrom());
        assert.equals('Hello, world!', message.getBody());
    }
};
