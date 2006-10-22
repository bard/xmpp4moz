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


