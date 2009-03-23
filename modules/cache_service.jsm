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
    'cache'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import('resource://xmpp4moz/utils.jsm');
Cu.import('resource://xmpp4moz/query.jsm');
Cu.import('resource://xmpp4moz/namespaces.jsm');


// PUBLIC API
// ----------------------------------------------------------------------

var cache = {};

cache.first = function(query) {
    return this._doc.evaluate(query,
                              this._doc,
                              this.resolve,
                              Ci.nsIDOMXPathResult.ANY_UNORDERED_NODE_TYPE,
                              null).singleNodeValue;
};

cache.all = function(query) {
    return this._doc.evaluate(query,
                              this._doc,
                              this.resolve,
                              Ci.nsIDOMXPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                              null);
};

cache.receive = function(element) {
    if(typeof(element) == 'object' && ('stanza' in element)) {
        log('DEPRECATION WARNING: received old-format object from ' +
            Components.stack.caller);
        element = element.stanza;
    }

    for each(var rule in this._rules) {
        if(rule.appliesTo(element)) {
            var imported = this._doc.importNode(element, true);
            rule.doApply(imported, this);
        }
    }
};

cache.toString = function() {
    return serialize(this._doc);
};


// INTERNAL API // XXX prefix with _ ?
// ----------------------------------------------------------------------

cache.init = function() {
    this._doc = Cc['@mozilla.org/xml/xml-document;1']
        .createInstance(Ci.nsIDOMXMLDocument);
    this._doc.QueryInterface(Ci.nsIDOMXPathEvaluator);
    this._doc.appendChild(
        this._doc.importNode(
            asDOM(<x4m:cache xmlns:x4m={ns_x4m_in} xmlns="jabber:client"/>),
            true));
    this._rules = [];
};

cache.addRule = function(rule) {
    this._rules.push(rule);
};

cache.insert = function(element) {
    this._doc.documentElement.appendChild(element);
};

cache.replace = function(newElement, oldElement) {
    this._doc.documentElement.replaceChild(newElement, oldElement);
};

cache.remove = function(element) {
    this._doc.documentElement.removeChild(element);
};

cache.resolve = function(prefix) {
    var ns = cache.__parent__['ns_' + prefix];
    if(ns)
        return ns;
    else
        throw new Error('Unknown namespace prefix. (' + prefix + ')');
};


// BUSINESS RULES
// ----------------------------------------------------------------------

var vCardRules = {
    appliesTo: function(element) {
        return (element.nodeName == 'iq' &&
                element.getAttribute('type') == 'result' &&
                element.getElementsByTagNameNS('vcard-temp', 'vCard').length > 0 &&
                element.getAttributeNS(ns_x4m_in, 'direction') == 'in');
//                element.getElementsByTagNameNS(ns_x4m_in, 'meta')[0].getAttribute('direction') == 'in');
    },

    doApply: function(stanza, cache) {
//        var account = stanza.getElementsByTagNameNS(ns_x4m_in, 'meta')[0].getAttribute('account');
        var account = stanza.getAttributeNS(ns_x4m_in, 'account');
        var previous = cache.first(q()
                                   .event('iq')
                                   .account(account)
                                   .child('vcard-temp', 'vCard')
                                   .from(stanza.getAttribute('from'))
                                   .compile());

        if(previous)
            cache.replace(stanza, previous)
        else
            cache.insert(stanza);
    }
};

var bookmarkRules = {
    appliesTo: function(element) {
        return (element.nodeName == 'iq' &&
                element.getAttribute('type') == 'result' &&
                element.getElementsByTagNameNS('storage:bookmarks', 'storage').length > 0 &&
                element.getAttributeNS(ns_x4m_in, 'direction') == 'in');
        //        element.getElementsByTagNameNS(ns_x4m_in, 'meta')[0].getAttribute('direction') == 'in');
    },

    doApply: function(stanza, cache) {
        var account = stanza.getAttributeNS(ns_x4m_in, 'account');
        //var account = stanza.getElementsByTagNameNS(ns_x4m_in, 'meta')[0].getAttribute('account');
        var previous = cache.first(q()
                                   .event('iq')
                                   .account(account)
                                   .xpath('//*[local-name() = "storage" and ' +
                                          'namespace-uri() = "storage:bookmarks"]')
                                   .compile());

        if(previous)
            cache.replace(stanza, previous);
        else
            cache.insert(stanza);
    }
}

var rosterRules = {
    appliesTo: function(element) {
        return (element.nodeName == 'iq' &&
                element.getElementsByTagNameNS(ns_roster, 'query').length > 0 &&
                element.getAttributeNS(ns_x4m_in, 'direction') == 'in');
//                element.getElementsByTagNameNS(ns_x4m_in, 'meta')[0].getAttribute('direction') == 'in');
    },

    doApply: function(stanza, cache) {
        function getItem(query, jid) {
            var items = query.getElementsByTagName('item');
            for(var i=0; i<items.length; i++)
                if(items[i].getAttribute('jid') == jid)
                    return items[i];

            return null;
        }

        var previous = cache.first(
            q()
            .event('iq')
            .account(stanza.getAttributeNS(ns_x4m_in, 'account'))
//            .account(stanza.getElementsByTagNameNS(ns_x4m_in, 'meta')[0].getAttribute('account'))
            .child('jabber:iq:roster', 'query')
            .compile());

        if(!previous)
            cache.insert(stanza);
        else if(stanza.getAttribute('type') == 'result')
            if(stanza.getElementsByTagNameNS(ns_roster, 'query')[0].childNodes.length == 0) {
                // ignore
            } else {
                cache.replace(stanza, previous);
            }
        else if(stanza.getAttribute('type') == 'set') {
            var pushedItem = stanza
            .getElementsByTagNameNS(ns_roster, 'query')[0]
            .getElementsByTagName('item')[0];

            if(pushedItem)
                pushedItem = pushedItem.cloneNode(true);
            else
                return;

            var updatedIq = previous.cloneNode(true);
            var updatedQuery = updatedIq.getElementsByTagNameNS(ns_roster, 'query')[0];
            var existingItem = getItem(updatedQuery, pushedItem.getAttribute('jid'));

            if(pushedItem.getAttribute('subscription') == 'remove') {
                if(existingItem)
                    updatedQuery.removeChild(existingItem);
            } else {
                if(existingItem)
                    updatedQuery.replaceChild(pushedItem, existingItem);
                else
                    updatedQuery.appendChild(pushedItem);
            }

            cache.replace(updatedIq, previous);
        } else
            throw new Error('Unhandled case: ' + serialize(stanza) + '\n');
    }
}

var presenceRules = {
    appliesTo: function(element) {
        if(element.nodeName != 'presence')
            return false;

        if(element.hasAttribute('to') &&
           !element.hasAttribute('from') &&
           !this.isMUCPresence(element))
            return false;

        if(element.hasAttribute('type') &&
           element.getAttribute('type') != 'unavailable')
            return false;

        return true;
    },

    doApply: function(stanza, cache) {
        var query = q()
            .event     ('presence')
            .direction (stanza.getAttributeNS(ns_x4m_in, 'direction'))
            .account   (stanza.getAttributeNS(ns_x4m_in, 'account'))
            .from      (stanza.getAttribute('from'));

        query = this.isMUCPresence(stanza) ?
            // This is a MUC nick change presence packet.
            query.to(JID(stanza.getAttribute('to')).address) :
            // A normal or directed presence packet.
            query.to(stanza.getAttribute('to'));

        var previous = cache.first(query.compile());


        if(stanza.getAttribute('type') == 'unavailable') {
            if(previous) {
                if(this.isMUCUserPresence(previous))
                    cache.remove(previous);
                else
                    cache.replace(stanza, previous);
            } else {
                // Ignore.
            }
        } else { // "type" is undefined, thus available.
            if(previous) {
                cache.replace(stanza, previous);
            } else {
                cache.insert(stanza);
            }
        }
    },

    isMUCUserPresence: function(stanza) {
        return stanza.getElementsByTagNameNS(ns_muc_user, 'x').length > 0;
    },

    isMUCPresence: function(stanza) {
        return stanza.getElementsByTagNameNS(ns_muc, 'x').length > 0;
    }
}


// UTILITIES
// ----------------------------------------------------------------------

function q() {
    return new Query();
}


// INITIALIZATION
// ----------------------------------------------------------------------

cache.init();
cache.addRule(presenceRules);
cache.addRule(rosterRules);
cache.addRule(bookmarkRules);
cache.addRule(vCardRules);


// TESTS
// ----------------------------------------------------------------------

function verify() {
    if(!('assert' in this))
        Cu.import('resource://xmpp4moz/test.jsm');

    function Cache() { cache.init.call(this); }
    for(var name in cache) {
        Cache.prototype[name] = cache[name];
    }

    var presenceTests = {
        'contact sends user available presence, cache is empty: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>);
        },

        'contact sends available presence, presence from contact not in cache: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      </presence>));
            cache.receive(
                asDOM(<presence from="marvin@spaceship.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence from="marvin@spaceship.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>);
        },

        'contact sends available presence, presence from contact is already in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <show>away</show>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                    <show>away</show>
                    </presence>);
        },

        'contact sends available presence to user-without resource; presence from contact is already in cache: replace': function() {
            // Like previous test, but covering the case where
            // presence is sent to our bare jid

            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="arthur@server.org/Test" to="ford@betelgeuse.org" id="1003" xmlns:x4m={ns_x4m_in} x4m:account="ford@betelgeuse/firefox" x4m:direction="in">
                      <status>test</status>
                      </presence>));
            cache.receive(
                asDOM(<presence from="arthur@server.org/Test" to="ford@betelgeuse.org" id="1004" xmlns:x4m={ns_x4m_in} x4m:account="ford@betelgeuse/firefox" x4m:direction="in">
                      <show>away</show>
                      </presence>));
            cache.receive(
                asDOM(<presence from="arthur@server.org/Test" to="ford@betelgeuse.org" id="1005" xmlns:x4m={ns_x4m_in} x4m:account="ford@betelgeuse/firefox" x4m:direction="in"/>));

            var stanzas = cache.all('//presence');
            assert.equals(1, stanzas.snapshotLength);
        },

        'contact (without resource) sends available presence, presence from contact is already in cache: replace': function() {
            // Presence from entities comes from JIDs with resource,
            // but presence from components (e.g. transports) does
            // not, that's why this test is needed.
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="transport.earth.org"
                      to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));
            cache.receive(
                asDOM(<presence from="transport.earth.org" type="unavailable"
                      to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));

            var stanzas = cache.all('//presence');
            assert.equals(1, stanzas.snapshotLength);
            assert.isEquivalentXML(
                    <presence from="transport.earth.org" type="unavailable" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>,
                    asXML(stanzas.snapshotItem(0)));
        },

        'contact sends unavailable presence, presence from contact is not in cache: ignore': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));

            assert.isNull(cache.first('//presence'));
        },

        'contact sends unavailable presence, presence from contact is in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>);
        },

        // CHAT ROOM

        'occupant sends uavailable presence, presence from occupant is not in cache: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="room@server/foo" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                    <x xmlns="http://jabber.org/protocol/muc#user"/>
                    </presence>);
        },

        'occupant sends available presence, presence from occupant is in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      <show>away</show>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="room@server/foo" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                    <x xmlns="http://jabber.org/protocol/muc#user"/>
                    <show>away</show>
                    </presence>);
        },

        'occupant sends unavailable presence, presence from occupant is not in cache: ignore': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" type="unavailable" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
            assert.isNull(stanzas.snapshotItem(1));
        },

        'occupant sends unavailable presence, presence from occupant is in cache: remove': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" type="unavailable" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
            assert.isNull(stanzas.snapshotItem(1));
        },

        'user sends available presence, no user presence is in cache: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m_in} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence>
                    <meta xmlns={ns_x4m_in} account="arthur@earth.org/Test" direction="out"/>
                    </presence>);
        },

        'user sends contacts available presence, user presence is in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>));
            cache.receive(
                asDOM(<presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                      <show>away</show>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                    <show>away</show>
                    </presence>);
        },

        'user sends contacts available presences through multiple accounts: do not mix': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>));
            cache.receive(
                asDOM(<presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>);
        },

        'user sends directed presence: do not cache': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>));
            cache.receive(
                asDOM(<presence to="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>);
            assert.isNull(stanzas.snapshotItem(1));
        },

        'user receives presence subscription: do not cache': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="arthur@earth.org/Test" type="subscribe" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));

            assert.isNull(cache.first('//presence'));
        },

        'user sends presence subscription confirmation: do not cache': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="arthur@earth.org/Test" type="subscribed" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));

            assert.isNull(cache.first('//presence'));
        },

        'fetch presences from a given session and contact address': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                      <show>dnd</show>
                      </presence>));
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Toast" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));
            cache.receive(
                asDOM(<presence from="marvin@spaceship.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>));

            var stanzas = cache.all(
                q()
                .event('presence')
                .account('arthur@earth.org/Test')
                .from('ford@betelgeuse.org')
                .compile());
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
                    <show>dnd</show>
                    </presence>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence from="ford@betelgeuse.org/Toast" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in"/>);
        },

        'user sends regular presence, user sends muc presence: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>));
            cache.receive(
                asDOM(<presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out"/>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
        },

        'user sends muc presence, user sends a different muc presence: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));
            cache.receive(
                asDOM(<presence to="anotherroom@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence to="room@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence to="anotherroom@server/arthur" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="out">
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
        },

        'non-muc <x/> child elements are ignored when deciding whether later presence should replace previous one': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="alyssa@sameplace.cc/SamePlaceAgent"
                      to="alyssa@sameplace.cc/Firefox" xml:lang="*"
                      xmlns:x4m={ns_x4m_in} x4m:account="alyssa@sameplace.cc/Firefox" x4m:direction="in">
                      <status/>
                      <priority>0</priority>
                      <c node="http://www.google.com/xmpp/client/caps" ver="1.0.0.66"
                      ext="share-v1" xmlns="http://jabber.org/protocol/caps"/>
                      <x stamp="20070420T20:36:59" xmlns="jabber:x:delay"/>
                      </presence>));

            cache.receive(
                asDOM(<presence from="alyssa@sameplace.cc/SamePlaceAgent"
                      to="alyssa@sameplace.cc/Firefox" type="unavailable"
                      xmlns:x4m={ns_x4m_in} x4m:account="alyssa@sameplace.cc/Firefox" x4m:direction="in"/>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                <presence from="alyssa@sameplace.cc/SamePlaceAgent"
                to="alyssa@sameplace.cc/Firefox" type="unavailable">
                    <meta xmlns={ns_x4m_in} account="alyssa@sameplace.cc/Firefox" direction="in"/>
                    </presence>,
                asXML(stanzas.snapshotItem(0)));
            assert.isNull(stanzas.snapshotItem(1));
        }
    };

    var rosterTests = {
//         'receive iq roster': function() {
//             var cache = new Cache();
// //            cache.addRule(rosterRules);

//             cache.receive(
//                 asDOM(<iq type="result" from="arthur@earth.org/Resource"
//                       to="arthur@earth.org/Resource">
//                       <meta xmlns={ns_x4m_in} direction="in" account="arthur@earth.org/Test"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item jid="ford@betelgeuse.org"/>
//                       </query>
//                       </iq>));

//             assert.isEquivalentXML(
//                     <iq type="result" from="arthur@earth.org/Resource"
//                 to="arthur@earth.org/Resource">
//                     <meta xmlns={ns_x4m_in} direction="in" account="arthur@earth.org/Test"/>
//                     <query xmlns="jabber:iq:roster">
//                     <item jid="ford@betelgeuse.org"/>
//                     </query>
//                     </iq>,
//                 asXML(cache.first('//iq')));
//         },

//         'roster with update (addition) causes new roster to replace existing one': function() {
//             var cache = new Cache();
// //            cache.addRule(rosterRules);

//             cache.receive(
//                 asDOM(<iq type="result" from="arthur@earth.org" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                       <query xmlns="jabber:iq:roster">
//                       <item jid="ford@betelgeuse.org"/>
//                       </query>
//                       </iq>));
//             cache.receive(
//                 asDOM(<iq type="set" from="arthur@earth.org" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                       <query xmlns="jabber:iq:roster">
//                       <item jid="marvin@spaceship.org"/>
//                       </query>
//                       </iq>));

//             var stanzas = cache.all('//iq');
//             assert.equals(1, stanzas.snapshotLength);
//             assert.isEquivalentXML(
//                     <iq type="result" from="arthur@earth.org" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                     <query xmlns="jabber:iq:roster">
//                     <item jid="ford@betelgeuse.org"/>
//                     <item jid="marvin@spaceship.org"/>
//                     </query>
//                     </iq>,
//                 asXML(stanzas.snapshotItem(0)));
//         },

//         'roster with update (removal) causes new roster to replace existing one': function() {
//             var cache = new Cache();
// //            cache.addRule(rosterRules);

//             cache.receive(
//                 asDOM(<iq type="result" from="arthur@earth.org">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item jid="ford@betelgeuse.org"/>
//                       <item jid="zaphod@betelgeuse.org"/>
//                       </query>
//                       </iq>));
//             cache.receive(
//                 asDOM(<iq type="set" from="arthur@earth.org">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item jid="ford@betelgeuse.org" subscription="remove"/>
//                       </query>
//                       </iq>));

//             assert.isEquivalentXML(
//                     <iq type="result" from="arthur@earth.org">
//                     <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                     <query xmlns="jabber:iq:roster">
//                     <item jid="zaphod@betelgeuse.org"/>
//                     </query>
//                     </iq>,
//                 asXML(cache.first('//iq')));
//         },

//         'roster with update (replacement) causes new roster to replace existing one': function() {
//             var cache = new Cache();
// //            cache.addRule(rosterRules);

//             cache.receive(
//                 asDOM(<iq type="result" from="arthur@earth.org">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item jid="ford@betelgeuse.org"/>
//                       </query>
//                       </iq>));
//             cache.receive(
//                 asDOM(<iq type="set" from="arthur@earth.org">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item jid="ford@betelgeuse.org" name="Ford"/>
//                       </query>
//                       </iq>));

//             assert.isEquivalentXML(
//                     <iq type="result" from="arthur@earth.org">
//                     <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                     <query xmlns="jabber:iq:roster">
//                     <item jid="ford@betelgeuse.org" name="Ford"/>
//                     </query>
//                     </iq>,
//                 asXML(cache.first('//iq')));
//         },

//         'roster result causes replacement': function() {
//             var cache = new Cache();
// //            cache.addRule(rosterRules);

//             cache.receive(
//                 asDOM(<iq from="arthur@server.org/Test" to="arthur@server.org/Test"
//                       type="result">
//                       <query xmlns="jabber:iq:roster"/>
//                       <meta xmlns={ns_x4m_in}
//                       account="arthur@server.org/Test" direction="in"/>
//                       </iq>));
//             cache.receive(
//                 asDOM(<iq from="arthur@server.org/Test" to="arthur@server.org/Test"
//                       id="1001" type="result">
//                       <query xmlns="jabber:iq:roster">
//                       <item subscription="both" jid="marvin@spaceship.org"/>
//                       <item subscription="both" jid="ford@betelgeuse.org"/>
//                       </query>
//                       <meta xmlns={ns_x4m_in}
//                       account="arthur@server.org/Test" direction="in"/>
//                       </iq>));

//             assert.isEquivalentXML(
//                     <iq from="arthur@server.org/Test" to="arthur@server.org/Test"
//                 id="1001" type="result">
//                     <query xmlns="jabber:iq:roster">
//                     <item subscription="both" jid="marvin@spaceship.org"/>
//                     <item subscription="both" jid="ford@betelgeuse.org"/>
//                     </query>
//                     <meta xmlns={ns_x4m_in}
//                 account="arthur@server.org/Test" direction="in"/>
//                     </iq>,
//                 asXML(cache.first('//iq')));
//         },

//         'cached roster stanzas remain unchanged': function() {
//             var cache = new Cache();
// //            cache.addRule(rosterRules);

//             cache.receive(
//                 asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item subscription="both" jid="marvin@earth.org"/>
//                       </query>
//                       </iq>));

//             var rosterPush =
//                 asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" id="push" type="set">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item subscription="both" name="Marvin" jid="marvin@earth.org"/>
//                       </query>
//                       </iq>);

//             cache.receive(rosterPush);

//             assert.isEquivalentXML(
//                     <iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" id="push" type="set">
//                     <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                     <query xmlns="jabber:iq:roster">
//                     <item subscription="both" name="Marvin" jid="marvin@earth.org"/>
//                     </query>
//                     </iq>,
//                 asXML(rosterPush));
//         },

//         'empty roster result does not modify cache': function() {
//             var cache = new Cache();
// //            cache.addRule(rosterRules);

//             cache.receive(
//                 asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster"/>
//                       </iq>));
//             cache.receive(
//                 asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster">
//                       <item subscription="both" jid="marvin@earth.org"/>
//                       </query>
//                       </iq>));;
//             cache.receive(
//                 asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
//                       <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                       <query xmlns="jabber:iq:roster"/>
//                       </iq>));

//             assert.isEquivalentXML(
//                     <iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
//                     <meta xmlns={ns_x4m_in} account="arthur@earth.org" direction="in"/>
//                     <query xmlns="jabber:iq:roster">
//                     <item subscription="both" jid="marvin@earth.org"/>
//                     </query>
//                     </iq>,
//                 asXML(cache.first('//iq')));
//         }
    };

    var vCardTests = {
//         'vcards are cached': function() {
//             var cache = new Cache();
// //            cache.addRule(vcardRules);

//             cache.receive(
//                     asDOM(<iq type="result" from="ford@betelgeuse.org">
//                           <vCard xmlns="vcard-temp">
//                           <FN>Ford Prefect</FN>
//                           </vCard>
//                           <meta xmlns={ns_x4m_in} account="alyssa@sameplace.cc/Firefox" direction="in"/>
//                           </iq>));

//             assert.isEquivalentXML(
//                     <iq type="result" from="ford@betelgeuse.org">
//                     <vCard xmlns="vcard-temp">
//                     <FN>Ford Prefect</FN>
//                     </vCard>
//                     <meta xmlns={ns_x4m_in} account="alyssa@sameplace.cc/Firefox" direction="in"/>
//                     </iq>,
//                 asXML(cache.first('//iq')));
//         }
    };

    var bookmarkTests = {
//         'bookmarks are cached': function() {
//             var cache = new Cache();
// //             cache.addRule(bookmarkRules);

//             cache.receive(
//                 asDOM(<iq type="result">
//                       <query xmlns="jabber:iq:private">
//                       <storage xmlns="storage:bookmarks">
//                       <conference jid="users@places.sameplace.cc" autojoin="true" nick="alyssa"/>
//                       </storage>
//                       </query>
//                       <meta xmlns={ns_x4m_in} account="alyssa@sameplace.cc/Firefox" direction="in"/>
//                       </iq>));

//             assert.isEquivalentXML(
//                     <iq type="result">
//                     <query xmlns="jabber:iq:private">
//                     <storage xmlns="storage:bookmarks">
//                     <conference jid="users@places.sameplace.cc" autojoin="true" nick="alyssa"/>
//                     </storage>
//                     </query>
//                     <meta xmlns={ns_x4m_in} account="alyssa@sameplace.cc/Firefox" direction="in"/>
//                     </iq>,
//                 asXML(cache.first('//iq')));
//         }
    };


//     // Compatibility layer no longer here.  Leaving these for
//     // documentation (for now).

    var compatibilityTests = {
//         'return wrapped objects': function() {
//             var cache = new Cache();
// //            cache.addRule(presenceRules);
//             cache.receive(
//                 asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                       </presence>));

//             var results = cache.fetch({
//                 event     : 'presence',
//                 direction : 'in',
//                 account   : 'arthur@earth.org/Test',
//                 stanza    : function(s) {
//                     return s.getAttribute('from') == 'ford@betelgeuse.org/Test';
//                 }
//             });

//             assert.equals(1, results.length);
//             assert.isEquivalentXML(
//                     <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                     </presence>,
//                 asXML(results[0].stanza));
//         },

//         'handle nested patterns': function() {
//             var cache = new Cache();
// //            cache.addRule(presenceRules);
//             cache.receive(
//                 asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                       </presence>));

//             var results = cache.fetch({
//                 event     : 'presence',
//                 direction : 'in',
//                 session   : { name: 'arthur@earth.org/Test' }
//             });

//             assert.equals(1, results.length);
//             assert.isEquivalentXML(
//                     <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                     </presence>,
//                 asXML(results[0].stanza));
//         },

//         'handle nested patterns 2': function() {
//             var cache = new Cache();
// //            cache.addRule(presenceRules);
//             cache.receive(
//                 asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                       </presence>));

//             var results = cache.fetch({
//                 event     : 'presence',
//                 direction : 'in',
//                 from: { address: 'ford@betelgeuse.org/Test' },
//             });

//             assert.equals(1, results.length);
//             assert.isEquivalentXML(
//                     <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                     </presence>,
//                 asXML(results[0].stanza));
//         },

//         'handle nested patterns 3': function() {
//             var cache = new Cache();
// //            cache.addRule(presenceRules);
//             cache.receive(
//                 asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                       </presence>));

//             var results = cache.fetch({
//                 event     : 'presence',
//                 direction : 'in',
//                 session   : function(s) { return s.name == 'arthur@earth.org/Test'; }
//             });

//             assert.equals(1, results.length);
//             assert.isEquivalentXML(
//                     <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                     </presence>,
//                 asXML(results[0].stanza));
//         },

//         'handle nested patterns 3': function() {
//             var cache = new Cache();
// //            cache.addRule(presenceRules);
//             cache.receive(
//                 asDOM(<presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                       </presence>));

//             var results = cache.fetch({
//                 event     : 'presence',
//                 direction : 'in',
//             });

//             assert.equals(1, results.length);
//             assert.isEquivalentXML(
//                     <presence from="ford@betelgeuse.org/Test" xmlns:x4m={ns_x4m_in} x4m:account="arthur@earth.org/Test" x4m:direction="in">
//                     </presence>,
//                 asXML(results[0].stanza));
//         }

    };

    return [
        presenceTests,
        rosterTests,
        bookmarkTests,
        vCardTests
    ].map(runTests).join('\n');
}


function profile() {
    function createDataset(n) {
        function makeRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        }

        function makeRandomCharacter() {
            return String.fromCharCode(makeRandomInt(97, 122));
        }

        function makeRandomString(length) {
            var chars = [];
            for(var i=0; i<length; i++)
                chars.push(makeRandomCharacter());
            return chars.join('');
        }

        function makeRandomJid() {
            return makeRandomString(7) + '@' + makeRandomString(7) +
                '.' + makeRandomString(3) + '/' + makeRandomString(8);
        }

        function makeRandomPresence() {
            return (<presence from={makeRandomJid()}>
                    <meta xmlns={ns_x4m_in} account="arthur@server.org"/>
                    </presence>);
        }

        var presences = [];
        for(var i=0; i<n; i++)
            presences.push(makeRandomPresence);

        return presences;
    }

    function benchmark(operation, times) {
        times = times || 1;

        var start = new Date();
        for(var i=0; i<times; i++)
            operation();

        repl.print('\n' +
                   ' ________________________________________\n' +
                   '/                                         ' + times + ' TIMES\n' +
                   operation.toString().replace(/^/mg, '| ') + '\n' +
                   '\\________________________________________ TOOK: ' + (new Date() - start));
    }

    var dataset = createDataset(100);
    var cache = new Cache();

    benchmark(function() {
        dataset.forEach(function(presence) { cache.receive(presence); });
    });

    var query = q().account('foo@bar.org/Test').from(dataset[5].@from).compile();
    benchmark(function() {
        cache.all(query);
    }, 4000);
}


function profileCompatibility() {
    function createDataset(n) {
        function makeRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        }

        function makeRandomCharacter() {
            return String.fromCharCode(makeRandomInt(97, 122));
        }

        function makeRandomString(length) {
            var chars = [];
            for(var i=0; i<length; i++)
                chars.push(makeRandomCharacter());
            return chars.join('');
        }

        function makeRandomJid() {
            return makeRandomString(7) + '@' + makeRandomString(7) +
                '.' + makeRandomString(3) + '/' + makeRandomString(8);
        }

        function makeRandomPresence() {
            return <presence from={makeRandomJid()}/>;
        }

        var presences = [];
        for(var i=0; i<n; i++)
            presences.push({
                session : { name: 'foo@bar.org/Test' },
                stanza  : asDOM(makeRandomPresence()),
                opaque  : makeRandomString(10)
                });
        return presences;
    }

    function benchmark(operation, times) {
        times = times || 1;

        var start = new Date();
        for(var i=0; i<times; i++)
            operation();

        repl.print('\n' +
                   ' ________________________________________\n' +
                   '/                                         ' + times + ' TIMES\n' +
                   operation.toString().replace(/^/mg, '| ') + '\n' +
                   '\\________________________________________ TOOK: ' + (new Date() - start));
    }

    var dataset = createDataset(100);
    var cache = new Cache();

    benchmark(
        function() {
            dataset.forEach(function(presence) { cache.receive(presence); });
        });

    benchmark(
        function() {
            cache.fetch({
                account : 'foo@bar.org/Test',
                from: { full: dataset[5].stanza.getAttribute('from') }
                })
        }, 500);
}

//verify()