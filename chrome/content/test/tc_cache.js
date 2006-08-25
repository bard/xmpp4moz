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
var Cache         = module.require('package', 'lib/cache').Cache;


var spec = new Specification('Stanza Cache');

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

function createPresenceCache() {
    return new Cache(
        function(newObject, cachedObject) {
            if(newObject.session.name == cachedObject.session.name &&
               newObject.stanza.getAttribute('from') == cachedObject.stanza.getAttribute('from')) {
                if(newObject.stanza.getAttribute('type') == 'unavailable') 
                    return null;
                else
                    return newObject;
            }
        },
        function(newObject) {
            return (!newObject.stanza.hasAttribute('type') ||
                    newObject.stanza.getAttribute('type') == 'unavailable');
        });
}

function createRosterCache() {
    return new Cache(
        function(newObject, cachedObject) {
            if(newObject.session.name != cachedObject.session.name)
                return;

            var newQuery = newObject.stanza.getElementsByTagNameNS('jabber:iq:roster', 'query')[0];
            var cachedQuery = newObject.stanza.getElementsByTagNameNS('jabber:iq:roster', 'query')[0];

            for(var i=0, l=newQuery.childNodes.length; i<l; i++) {
                var cachedRosterItem = cachedQuery.childNodes[i];
                var found = false;
                for(var j=0, k=cachedQuery.childNodes.length; j<k; j++) {
                    var newRosterItem = newQuery.childNodes[j];
                    if(newRosterItem.getAttribute('jid') == cachedRosterItem.getAttribute('jid')) {
                        found = true;
                        break;
                    }
                }
                if(found)
                    cachedQuery.replaceChild(newRosterItem, cachedRosterItem);
                else
                    cachedQuery.appendChild(newRosterItem);
            }
            return cachedObject;
        });
}

spec.stateThat = {
    'Session cache': function() {
        var cache = createPresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"/>')});

        cache.receive({
            session: session,
            stanza: asDom('<presence from="bar@localhost/Firefox"><show>away</show></presence>')});

        var cachedObjects = cache.getEnumeration();

        assert.isTrue(cachedObjects.hasMoreElements());

        assert.equals(
            '<presence from="foo@localhost/Firefox"/>',
            asString(cachedObjects.getNext().stanza));
        
        assert.equals(
            '<presence from="bar@localhost/Firefox">' +
            '<show>away</show>' +
            '</presence>',
            asString(cachedObjects.getNext().stanza));
    },
        
    'Store presence elements and make them available as an array': function() {
        var cache = createPresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"/>')});

        cache.receive({
            session: session,
            stanza: asDom('<presence from="bar@localhost/Firefox">' +
                          '<show>away</show></presence>')});

        var cachedObjects = cache.getEnumeration();
        
        assert.equals(
            '<presence from="foo@localhost/Firefox"/>',
            asString(cachedObjects.getNext().stanza));

        assert.equals(
            '<presence from="bar@localhost/Firefox">' +
            '<show>away</show>' +
            '</presence>',
            asString(cachedObjects.getNext().stanza));
    },

    'Do not store stanzas with availability different than available or unavailable': function() {
        var cache = createPresenceCache();
        var session = createSession('bard@localhost/Firefox')

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox" type="subscribe"/>')});

        assert.equals(null, cache.getEnumeration().getNext());
    },

    'Presence elements supersede previous ones with same sender': function() {
        var cache = createPresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"/>')});

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"><show>dnd</show></presence>')});

        var cachedObjects = cache.getEnumeration();
        var itemCount = 0;
        while(cachedObjects.getNext())
            itemCount++;
        
        assert.equals(1, itemCount);

        assert.equals(
            '<presence from="foo@localhost/Firefox">' + 
            '<show>dnd</show>' +
            '</presence>',
            asString(cache.getEnumeration().getNext().stanza));
    },

    'Presence elements expressing unavailability cancel previous ones with same sender': function() {
        var cache = createPresenceCache();
        var session = createSession('bard@localhost/Firefox');

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox"/>')});

        cache.receive({
            session: session,
            stanza: asDom('<presence from="foo@localhost/Firefox" type="unavailable"/>')});

        assert.equals(null, cache.getEnumeration().getNext());
    },

    'Roster items': function() {
        var cache = createRosterCache();
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

        
        assert.equals(
            '<iq><query xmlns="jabber:iq:roster">' +
            '<item subscription="both" jid="foo@localhost"/>' +
            '<item subscription="none" jid="bar@localhost"/>' +
            '</query></iq>',
            asString(cache.getEnumeration().getNext().stanza));
    }
};
