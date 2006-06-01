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

function Socket(host, port, socketOpts) {
    var connected = false;
    var handlers = {};
    var buffer = '';

    this.on = function() {
        for(var i=0; i<arguments.length; i+=2) {
            var eventName = arguments[i];
            var eventHandler = arguments[i+1];
            handlers[eventName] = eventHandler;
        }
    };

    this.__handle = function(eventName, eventInfo) {
        handlers[eventName](eventInfo);
    };

    this.isConnected = function() {
        return connected;
    };

    this.write = function(data) {
        buffer += data;
    };

    this.connect = function() {
        connected = true;
    };

    this.disconnect = function() {
        connected = false;
    };

    var socket = this;

    this.otherSide = {
        write: function(data) {
            socket.__handle('data', data);
        },

        read: function() {
            var data = buffer;
            buffer = '';
            return data;
        },

        acceptSignOn: function() {
            this.read();
            this.openStream();
            this.read();
            this.acceptAuth();
        },

        openStream: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write("<?xml version='1.0'?>" +
                       "<stream:stream xmlns='jabber:client' " +
                       "xmlns:stream='http://etherx.jabber.org/streams' " +
                       "id='2622060002' from='localhost' xml:lang='en'>");
        },

        acceptAuth: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write("<iq type='result' id='1000'/>");
        },

        rejectAuth: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write('<iq type="error" id="1000">' +
                       '<query xmlns="jabber:iq:auth">' +
                       '<username>test</username>' +
                       '<password>test</password>' +
                       '<resource>SamePlace</resource>' +
                       '</query>' +
                       '<error code="401" type="auth">' +
                       '<not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>' +
                       '</error>' +
                       '</iq>');
        },

        closeStream: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write("</stream:stream>");
        },

        sendRoster: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write('<iq from="jsjab@localhost/mozilla" to="jsjab@localhost/mozilla" type="result">' +
                       '<query xmlns="jabber:iq:roster">' +
                       '<item subscription="both" jid="foo@localhost"/>' +
                       '<item subscription="both" jid="bar@localhost"/>' +
                       '</query></iq>');
        },

        deliverSampleMessage: function() {
            this.write("<message from='man@future.com/adams'" +
                       "to='deepthought@future.com'>" +
                       "<body>What is the answer?</body>" +
                       "</message>");
        },

        acceptRegistration: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write("<iq type='result' id='1000'>" +
                       "<query xmlns='jabber:iq:register'/>" +
                       "</iq>")
        },

        rejectRegistration: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write("<iq type='result' id='reg2'>" +
                       "<query xmlns='jabber:iq:register'/>" +
                       "</iq>");
        },

        authorizePresenceSubscription: function(flushBuffer) {
            if(flushBuffer == undefined || flushBuffer == true)
                this.read();

            this.write('<presence type="subscribed" ' +
                       'from="deepthought@future.com/dolphin" ' +
                       'to="jsjab@localhost/mozilla"/>')
        }
    };
}


