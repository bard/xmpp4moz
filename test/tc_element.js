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
var element       = module.require('package', 'xmppjs/element');

var spec = new Specification('Element');

assert.equalsXML = function(x, y) {
    if(typeof(x) == 'string')
        x = new XML(x);
    if(typeof(y) == 'string')
        y = new XML(y);

    var x_XMLString = x.toXMLString();
    var y_XMLString = y.toXMLString();
    
    if(x_XMLString != y_XMLString)
        throw new AssertionFailed(
            'Expected ' + y_XMLString +
            ' to be XML-equivalent to ' + x_XMLString +
            ', but it was not.');
};

spec.stateThat = {
    'Old <message> creation and new one with legacy interface': function() {
        var message;

        message = element.message({to: 'foo@localhost'});
        assert.equals('normal', message.getType());
        assert.equals('<message to="foo@localhost"/>', message.toString());

        message = element.message({to: 'foo@localhost/mozilla', type: 'chat'});
        assert.equals('foo@localhost/mozilla', message.getTo());
        assert.equals('chat', message.getType());
        assert.equals(
            '<message to="foo@localhost/mozilla" type="chat"/>',
            message.toString());
    
        message = element.message({to: 'foo@localhost/mozilla', body: 'hey pal!'});
        assert.equals('hey pal!', message.getBody());
        assert.equals(
            '<message to="foo@localhost/mozilla"><body>hey pal!</body></message>',
            message.toString());
    },

    'New <message> creation': function() {
        var message;

        message = element.message('foo@localhost', 'hello, foo!', { type: 'normal' });
        assert.equals(
            '<message to="foo@localhost" type="normal"><body>hello, foo!</body></message>',
            message.toString());

        message = element.message('foo@localhost', 'hello, foo!');
        assert.equals(
            '<message to="foo@localhost"><body>hello, foo!</body></message>',
            message.toString());

        message = element.message('foo@localhost');
        assert.equals(
            '<message to="foo@localhost"/>',
            message.toString());
    },

    'New <iq> (auth) creation': function() {
        var iq = element.iq(
            'set', 'auth',
            { username: 'foo', resource: 'bar', password: 'secret' });

        assert.equalsXML(
            '<iq type="set">' +
            '<query xmlns="jabber:iq:auth">' +
            '<username>foo</username>' +
            '<password>secret</password>' +
            '<resource>bar</resource>' +
            '</query>' +
            '</iq>', iq.xml);
    },

    'New <iq> roster creation for contact removal': function() {
        var iq = element.iq(
            'set', 'roster/remove',
            { jid: 'contact@example.org' });

        assert.equalsXML(
            '<iq type="set">' +
            '<query xmlns="jabber:iq:roster">' +
            '<item jid="contact@example.org" subscription="remove"/>' +
            '</query>' +
            '</iq>',
            iq.xml);
    },

    'New <iq> roster creation for roster get': function() {
        var iq = element.iq(
            'get', 'roster');
        
        assert.equalsXML(
            '<iq type="get">' +
            '<query xmlns="jabber:iq:roster"/>' +
            '</iq>', iq.xml);
    },

    'New <presence> creation': function() {
        assert.equalsXML(
            '<presence to="foo@bar"/>', 
            element.presence(null, 'foo@bar').xml);

        assert.equals(
            'foo@bar', element.presence(null, 'foo@bar').xml.@to);

        assert.equalsXML(
            '<presence to="foo@bar"/>',
            element.presence('available', 'foo@bar').xml);

        assert.equalsXML(
            '<presence/>', element.presence().xml);

        assert.equalsXML(
            '<presence><show>dnd</show></presence>',
            element.presence(null, null, {show: 'dnd'}).xml);

        assert.equals(
            'dnd',
            element.presence(null, null, {show: 'dnd'}).xml.show);

        assert.equalsXML(
            '<presence><message>Eating!</message></presence>',
            element.presence(null, null, {message: 'Eating!'}).xml);
    },

    'Old <iq> (roster) creation and new one with legacy interface': function() {
        var iqRoster;

        iqRoster = element.iqRoster(
            { id: '1000' });
        assert.equals(
            '<iq type="get" id="1000">' +
            '<query xmlns="jabber:iq:roster"/>' +
            '</iq>',
            iqRoster.toString());
    },

    'New <iq> (roster) parsing from DOM': function() {
        var domElement = (new DOMParser()).parseFromString(
            '<iq from="jsjab@localhost/mozilla" to="jsjab@localhost/mozilla" type="result">' +
            '<query xmlns="jabber:iq:roster">' +
            '<item subscription="both" jid="foo@localhost"/>' +
            '<item subscription="both" jid="bar@localhost"/>' +
            '</query></iq>',
            'text/xml').documentElement;

        var iqRoster = element.wrap(domElement);

        assert.equals('foo@localhost', iqRoster.getItems()[0]);
        assert.equals('bar@localhost', iqRoster.getItems()[1]);
    },

    'Old <iq> (register) creation and new one with legacy interface': function() {
        var iqRegister;

        iqRegister = element.iqRegister(
            { username: 'foo', password: 'bar' });
        assert.equals(
            '<iq type="set">' +
            '<query xmlns="jabber:iq:register">' +
            '<username>foo</username>' +
            '<password>bar</password>' +
            '</query>' +
            '</iq>',
            iqRegister.toString());
    },
    
    'Old <iq> (auth) creation and new one with legacy interface': function() {
        var iqAuth;
        
        iqAuth = element.iqAuth(
            {id: 'auth1', username: 'foobar', password: 'secret', resource: 'jsjab'});
        assert.equals('auth1', iqAuth.getId());
        assert.equals(
            '<iq type="set" id="auth1">' +
            '<query xmlns="jabber:iq:auth">' +
            '<username>foobar</username>' +
            '<password>secret</password>' +
            '<resource>jsjab</resource>' +
            '</query>' +
            '</iq>',
            iqAuth.toString());
    },

    'Old <presence> creation and new one with legacy interface': function() {
        var presence;

        presence = element.presence();
        assert.equals("<presence/>", presence.toString());
        assert.equals('available', presence.getType());

        presence = element.presence({type: 'available'});
        assert.equals('<presence/>', presence.toString());
        assert.equals('available', presence.getType());

        presence = element.presence({type: 'unavailable'});
        assert.equals('unavailable', presence.getType());
        assert.equals('<presence type="unavailable"/>', presence.toString());

        presence = element.presence({to: 'bar@foo.com/mozilla', show: 'dnd'});
        assert.equals('bar@foo.com/mozilla', presence.getTo());
        assert.equals('<presence to="bar@foo.com/mozilla"><show>dnd</show></presence>',
                      presence.toString());
    }
};
