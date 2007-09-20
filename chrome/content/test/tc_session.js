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


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;

Cc['@mozilla.org/moz/jssubscript-loader;1']
.getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript('chrome://xmpp4moz/content/lib/module_manager.js');

var module     = new ModuleManager(['chrome://mozlab/content']);
var mozunit    = module.require('package', 'mozunit/package');
var assert     = mozunit.assertions;
var spec       = new mozunit.Specification('Session');


// UTILITIES
// ----------------------------------------------------------------------

function createSession() {
    return Cc['@hyperstruct.net/xmpp4moz/xmppsession;1'].createInstance(Ci.nsIXMPPClientSession);
}

function asString(thing) {
    if(thing instanceof Ci.nsISupportsString)
        return thing.toString();
    else if(thing instanceof Ci.nsIDOMElement)
        return Cc['@mozilla.org/xmlextras/xmlserializer;1']
            .getService(Ci.nsIDOMSerializer)
            .serializeToString(thing);
    else
        throw new Error('Ooops');
}


// SPECIFICATION
// ----------------------------------------------------------------------

spec.stateThat = {
    'Session can open a stream': function() {
        var session = createSession();
        var output;

        session.addObserver({
            observe: function(subject, topic, data) {
                    if(topic == 'data-out')
                        output = asString(subject);
                }}, null, false);

        session.open('localhost');
        assert.equals('<?xml version="1.0"?>' +
                      '<stream:stream xmlns="jabber:client" ' +
                      'xmlns:stream="http://etherx.jabber.org/streams" '+
                      'to="localhost">', output);

    },

    'Session can close a stream': function() {
        var session = createSession();
        var output;
        
        session.addObserver({
            observe: function(subject, topic, data) {
                    if(topic == 'data-out')
                        output = asString(subject);
                }}, null, false);

        session.open('localhost');
        session.close();
        assert.equals('</stream:stream>', output);       
    },

    'Session can tell whether stream is open or not': function() {
        var session = createSession();

        assert.isFalse(session.isOpen());
        session.open('localhost');
        assert.isTrue(session.isOpen());
        session.close();
        assert.isFalse(session.isOpen());
    },

    'Session throws error when trying to open already opened stream': function() {
        var session = createSession();

        session.open('localhost');
        assert.raises('NS_ERROR_XPC_JS_THREW_JS_OBJECT', function() {
                          session.open('localhost');
                      });
    },

    'Session throws error when trying to close already closed stream': function() {
        var session = createSession();

        session.open('localhost');
        session.close()
        assert.raises('NS_ERROR_XPC_JS_THREW_JS_OBJECT', function() {
                          session.close();
                      });        
    },

    'Outgoing XML stanzas are stamped with incrementing IDs': function() {
        var session = new createSession();
        var output;
        
        session.addObserver({
            observe: function(subject, topic, data) {
                    if(topic == 'data-out')
                        output = asString(subject);
                }}, null, false);
        session.open('localhost');
        
        session.send('<message to="alyssa@localhost"/>', null);
        assert.equals('<message to="alyssa@localhost" id="1000"/>', output);
        session.send('<message to="alyssa@localhost"/>', null);
        assert.equals('<message to="alyssa@localhost" id="1001"/>', output);
    },

    'All traffic is reported in the "data-(in|out)" topic of the session observer': function() {
        var session = new createSession();
        var receivedData = 0;
        var sentData = 0;

        session.addObserver({
            observe: function(subject, topic, data) {
                    if(topic == 'data-in')
                        receivedData += 1;
                    if(topic == 'data-out')
                        sentData += 1;
                }}, null, false);

        session.open('localhost');
        assert.equals(1, sentData);
        session.receive('<stream:stream>');
        assert.equals(1, receivedData);

        session.send('<message/>', null);
        assert.equals(2, sentData);
        session.receive('<message/>');
        assert.equals(2, receivedData);
    },
    
    'XML stream state changes are reported in the "stream-(in|out)" topic of the session observer': function() {
        var session = new createSession();
        var receivedStream, sentStream;;
        
        session.addObserver({
            observe: function(subject, topic, data) {
                    if(topic == 'stream-in')
                        receivedStream = true;
                    if(topic == 'stream-out')
                        sentStream = true;
                }}, null, false);
        session.open('localhost');

        assert.isFalse(sentStream);
        session.open('localhost');
        assert.isTrue(sentStream);

        assert.isFalse(receivedStream);
        session.receive('<stream:stream from="localhost">');
        assert.isTrue(receivedStream);
    },

    'XML stanzas are reported in the "stanza-(in|out)" topic of the session observer': function() {
        var session = new createSession();
        var receivedStanza, sentStanza;
        
        session.addObserver({
            observe: function(subject, topic, data) {
                    if(topic == 'stanza-in')
                        receivedStanza = true;
                    if(topic == 'stanza-out')
                        sentStanza = true;
                }}, null, false);
        session.open('localhost');

        assert.isFalse(sentStanza);
        session.send('<message to="alyssa@localhost"/>', null);
        assert.isTrue(sentStanza);

        assert.isFalse(receivedStanza);
        session.receive('<message from="foo@bar/Test"/>');
        assert.isTrue(receivedStanza);
    },

    'Observers can be associated to the reply to a specific stanza': function() {
        var session = createSession();
        var reply;

        var replyObserver = {
            observe: function(subject, topic, data) {
                reply = asString(subject);
            }
        };
        session.open('localhost');

        session.send('<iq type="get"><query xmlns="test"/></iq>', replyObserver);
        session.receive('<iq id="1000" type="result"/>');
        assert.equals('<iq id="1000" type="result"/>', reply);
    },

    'Observers get back the name of the session the events are coming from, if set': function() {
        var session = createSession();
        var reportedSessionName;

        session.setName('jim@enterprise.glxy')
        session.addObserver({
            observe: function(subject, topic, data) {
                    reportedSessionName = data;
                }}, null, false);

        session.open('localhost');
        assert.equals('jim@enterprise.glxy', reportedSessionName);
    }
};

spec.verify();