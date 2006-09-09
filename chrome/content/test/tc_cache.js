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
var module        = new ModuleManager(['..']);
var PresenceCache = module.require('class', 'lib/presence_cache');
var RosterCache   = module.require('class', 'lib/roster_cache');;


var Cc = Components.classes;
var Ci = Components.interfaces;

var document = Components
    .classes['@mozilla.org/xml/xml-document;1']
    .createInstance(Components.interfaces.nsIDOMXMLDocument);

var domParser = Components
    .classes['@mozilla.org/xmlextras/domparser;1']
    .getService(Components.interfaces.nsIDOMParser);

var serializer = Components
    .classes['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Components.interfaces.nsIDOMSerializer);




function asDom(string) {
    return domParser.parseFromString(string, 'text/xml').documentElement;
}

function asString(dom) {
    return serializer.serializeToString(dom);
}

function createSession(name) {
    var session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);
    session.setName(name);
    return session;
}



var presenceSpec = new Specification('Presence Objects Cache');

presenceSpec.stateThat = {
    'Store presence elements and make them available as an array': function() {
        var cache = new PresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"/>')});

        cache.receive({
            session: session,
            stanza: asDom('<presence from="bar@localhost/Firefox">' +
                          '<show>away</show></presence>')});

        var cachedObjects = cache.copy();
        
        assert.equals(
            '<presence from="foo@localhost/Firefox"/>',
            asString(cachedObjects[0].stanza));

        assert.equals(
            '<presence from="bar@localhost/Firefox">' +
            '<show>away</show>' +
            '</presence>',
            asString(cachedObjects[1].stanza));
    },

    'Do not store stanzas with availability different than available or unavailable': function() {
        var cache = new PresenceCache();
        var session = createSession('bard@localhost/Firefox')

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox" type="subscribe"/>')});

        assert.equals(0, cache.copy().length);
    },

    'Presence elements supersede previous ones with same sender': function() {
        var cache = new PresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"/>')});

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"><show>dnd</show></presence>')});

        assert.equals(1, cache.copy().length);

        assert.equals(
            '<presence from="foo@localhost/Firefox">' + 
            '<show>dnd</show>' +
            '</presence>',
            asString(cache.copy()[0].stanza));
    },

    'Presence elements expressing unavailability cancel previous ones with same sender': function() {
        var cache = new PresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"/>')});

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox" type="unavailable"/>')});

        assert.equals(0, cache.copy().length);
    },

    'Copy of cached objects is not influenced by removals in the cache': function() {
        var cache = new PresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox" ' +
                          'to="bard@localhost/Firefox"/>')
            });

        cache.receive({
            session: session,
            stanza: asDom('<presence from="ben@localhost/Firefox" ' +
                          'to="bard@localhost/Firefox"/>')
            });

        var cachedObjects = cache.copy();
        
        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox" type="unavailable" ' +
                          'to="bard@localhost/Firefox"/>')
            });

        assert.equals('foo@localhost/Firefox',
                      cachedObjects[0].stanza.getAttribute('from'));

        cache.receive({
            session: session,
            stanza: asDom('<presence from="ben@localhost/Firefox" type="unavailable" '+
                          'to="bard@localhost/Firefox"/>')
            });

        assert.equals('ben@localhost/Firefox',
                      cachedObjects[1].stanza.getAttribute('from'));
    }
};



var rosterSpec = new Specification('Roster Objects Cache');
    
rosterSpec.stateThat = {
    'Roster stanzas get merged with previous ones of same session': function() {
        var cache = new RosterCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<iq><query xmlns="jabber:iq:roster">' +
                          '<item subscription="both" jid="foo@localhost"/>' +
                          '<item subscription="none" jid="bar@localhost"/>' +
                          '</query></iq>')
            });

        cache.receive({
            session: session,
            stanza: asDom('<iq><query xmlns="jabber:iq:roster">' +
                          '<item subscription="both" jid="bar@localhost"/>' +
                          '</query></iq>')
            });

        
        assert.equals(1, cache.copy().length);

        assert.equals(
            '<iq><query xmlns="jabber:iq:roster">' +
            '<item subscription="both" jid="foo@localhost"/>' +
            '<item subscription="both" jid="bar@localhost"/>' +
            '</query></iq>',
            asString(cache.copy()[0].stanza));
    },

    'Roster items get added': function() {
        var cache = new RosterCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<iq><query xmlns="jabber:iq:roster">' +
                          '<item subscription="both" jid="foo@localhost"/>' +
                          '</query></iq>')
            });

        cache.receive({
            session: session,
            stanza: asDom('<iq><query xmlns="jabber:iq:roster">' +
                          '<item subscription="both" jid="bar@localhost"/>' +
                          '</query></iq>')
            });
        
        assert.equals(
            '<iq><query xmlns="jabber:iq:roster">' +
            '<item subscription="both" jid="foo@localhost"/>' +
            '<item subscription="both" jid="bar@localhost"/>' +
            '</query></iq>',
            asString(cache.copy()[0].stanza));
    },

    'Items with subscription="remove" cause update of cached roster': function() {
        var cache = new RosterCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<iq><query xmlns="jabber:iq:roster">' +
                          '<item subscription="both" jid="foo@localhost"/>' +
                          '<item subscription="none" jid="bar@localhost"/>' +
                          '</query></iq>')
            });

        cache.receive({
            session: session,
            stanza: asDom('<iq><query xmlns="jabber:iq:roster">' +
                          '<item subscription="remove" jid="foo@localhost"/>' +
                          '</query></iq>')
            });

        
        assert.equals(1, cache.copy().length);

        assert.equals(
            '<iq><query xmlns="jabber:iq:roster">' +
            '<item subscription="none" jid="bar@localhost"/>' +
            '</query></iq>',
            asString(cache.copy()[0].stanza));        
    },

    'Original items are preserved': function() {
        var cache = new RosterCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<iq><query xmlns="jabber:iq:roster">' +
                          '<item subscription="both" jid="foo@localhost"/>' +
                          '</query></iq>')
            });

        var newStanza = asDom('<iq><query xmlns="jabber:iq:roster">' +
                              '<item subscription="both" jid="foo@localhost" name="foo"/>' +
                              '</query></iq>')
        cache.receive({
            session: session,
            stanza: newStanza
            });

        assert.equals(
            '<iq><query xmlns="jabber:iq:roster">' +
            '<item subscription="both" jid="foo@localhost" name="foo"/>' +
            '</query></iq>',
            asString(newStanza));
    }
};
