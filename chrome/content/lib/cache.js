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

var ns_x4m       = 'http://hyperstruct.net/xmpp4moz';
var ns_roster    = 'jabber:iq:roster';
var ns_muc       = 'http://jabber.org/protocol/muc';
var ns_muc_user  = 'http://jabber.org/protocol/muc#user';
var ns_bookmarks = 'storage:bookmarks';
var ns_roster    = 'jabber:iq:roster';

var [Query] = load('chrome://xmpp4moz/content/lib/query.js', 'Query');


// UTILITIES
// ----------------------------------------------------------------------

function JID(string) {
    var memo = arguments.callee.memo || (arguments.callee.memo = {});
    if(string in memo)
        return memo[string];
    var m = string.match(/^(.+?@)?(.+?)(?:\/|$)(.*$)/);

    var jid = {};

    if(m[1])
        jid.username = m[1].slice(0, -1);

    jid.hostname = m[2];
    jid.resource = m[3];
    jid.nick     = m[3];
    jid.full     = m[3] ? string : null;
    jid.address  = jid.username ?
        jid.username + '@' + jid.hostname :
        jid.hostname;

    memo[string] = jid;
    return jid;
}

function q() {
    return new Query();
}

function resolver(prefix) {
    switch(prefix) {
    case 'x4m':
        return ns_x4m;
        break;
    case 'roster':
        return ns_roster;
        break;
    case 'bookmarks':
        return ns_bookmarks;
        break;
    }
    return undefined;
}

function asXML(dom) {
    return new XML(Cc['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Ci.nsIDOMSerializer)
    .serializeToString(dom));
}

function asDOM(object) {
    var _ = arguments.callee;
    _.parser = _.parser ||
        Cc['@mozilla.org/xmlextras/domparser;1'].getService(Ci.nsIDOMParser);

    var element;
    switch(typeof(object)) {
    case 'xml':
        element = _.parser
        .parseFromString(object.toXMLString(), 'text/xml')
        .documentElement;
        break;
    case 'string':
        element = _.parser
        .parseFromString(object, 'text/xml')
        .documentElement;
        break;
    default:
        // XXX use xpcom exception
        throw new Error('Argument error. (' + typeof(object) + ')');
    }

    return element;
}

function compareXML(tree1, tree2) {
    if(tree1.nodeKind() != tree2.nodeKind())
        throw new Error('Different node kinds. (' +
                        tree1.nodeKind() + ',' + tree2.nodeKind() + ')');

    switch(tree1.nodeKind()) {
    case 'element':
        if(tree1.name() != tree2.name())
            throw new Error('Different tag names. (' +
                            '<' + tree1.name() + '>, ' + '<' + tree2.name() + '>)');
        break;
    case 'text':
        if(tree1.valueOf() != tree2.valueOf())
            throw new Error('Different text values. (' +
                            '<' + tree1.valueOf() + '>, ' + '<' + tree2.valueOf() + '>)');

        break;
    default:
        throw new Error('Unhandled node kind. (' + tree1.nodeKind() + ')');
    }

    var attrList1 = tree1.@*;
    var attrList2 = tree2.@*;
    if(attrList1.length() != attrList2.length())
        throw new Error('Different attribute count for <' + tree1.name() + '>. (' +
                        attrList1.length() + ', ' + attrList2.length() + ')');

    var childList1 = tree1.*;
    var childList2 = tree2.*;
    if(childList1.length() != childList2.length())
        throw new Error('Different child count for <' + tree1.name() + '>. (' +
                        childList1.length() + ', ' + childList2.length() + ')');

    for each(var attr in attrList1) {
        if(tree1['@' + attr.name()] != tree2['@' + attr.name()])
            throw new Error('Different values for attribute @' + attr.name() + '. (' +
                            tree1['@' + attr.name()] + ', ' + tree2['@' + attr.name()] + ')');
    }

    for(var i=0; i<childList1.length(); i++)
        compareXML(childList1[i], childList2[i])

    return true;
}

function parse(string) {
    return (Cc['@mozilla.org/xmlextras/domparser;1']
            .getService(Ci.nsIDOMParser)
            .parseFromString(string, 'text/xml')
            .documentElement);
}

function serialize(node) {
    return (Cc['@mozilla.org/xmlextras/xmlserializer;1']
            .getService(Ci.nsIDOMSerializer)
            .serializeToString(node));
}


// OBJECTS
// ----------------------------------------------------------------------

function Cache() {
    this._doc = Cc['@mozilla.org/xml/xml-document;1']
    .createInstance(Ci.nsIDOMXMLDocument);
    this._doc.QueryInterface(Ci.nsIDOMXPathEvaluator);
    this._doc.appendChild(
        this._doc.importNode(
            asDOM(<x4m:cache xmlns:x4m={ns_x4m} xmlns="jabber:client"/>),
            true));
    this._rules = [];
}

Cache.prototype.first = function(query) {
    return this._doc.evaluate(query,
                              this._doc,
                              resolver,
                              Ci.nsIDOMXPathResult.ANY_UNORDERED_NODE_TYPE,
                              null).singleNodeValue;
};

Cache.prototype.all = function(query) {
    return this._doc.evaluate(query,
                              this._doc,
                              resolver,
                              Ci.nsIDOMXPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                              null);
};

Cache.prototype.receive = function(element) {
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

Cache.prototype.dump = function() {
    return (Cc['@mozilla.org/xmlextras/xmlserializer;1']
            .getService(Ci.nsIDOMSerializer)
            .serializeToString(this._doc));
};

Cache.prototype.addRule = function(rule) {
    this._rules.push(rule);
}

Cache.prototype.insert = function(element) {
    this._doc.documentElement.appendChild(element);
}

Cache.prototype.replace = function(newElement, oldElement) {
    this._doc.documentElement.replaceChild(newElement, oldElement);
}

Cache.prototype.remove = function(element) {
    this._doc.documentElement.removeChild(element);
}


// BUSINESS RULES
// ----------------------------------------------------------------------

var bookmarkRules = {
    appliesTo: function(element) {
        return (element.nodeName == 'iq' &&
                element.getElementsByTagNameNS(ns_bookmarks, 'storage').length > 0);
    },

    doApply: function(stanza, cache) {
        var previous = cache.first(
            q()
            .event('iq')
            .account(stanza.getElementsByTagNameNS(ns_x4m, 'meta')[0].getAttribute('account'))
            .xpath('//bookmarks:storage')
            .compile());

        if(!previous)
            cache.insert(stanza);
        else
            cache.replace(stanza, previous);
    }
};

var rosterRules = {
    appliesTo: function(element) {
        return (element.nodeName == 'iq' &&
                element.getElementsByTagNameNS(ns_roster, 'query').length > 0);
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
            .account(stanza.getElementsByTagNameNS(ns_x4m, 'meta')[0].getAttribute('account'))
            .query('roster')
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
            throw new Error('Unhandled case.');
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
        var meta = stanza.getElementsByTagNameNS(ns_x4m, 'meta')[0];

        //        if(this.isMUCPresence(stanza))
        // should also add check on whether target presence is a muc presence
        //            query = query.to(stanza.getAttribute('to'));

        var previous = cache.first(
            q()
            .event     ('presence')
            .direction (meta.getAttribute('direction'))
            .account   (meta.getAttribute('account'))
            .from      (stanza.getAttribute('from'))
            .to        (stanza.getAttribute('to'))
            .compile());

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

function load(url) {
    var loader = (Cc['@mozilla.org/moz/jssubscript-loader;1']
                  .getService(Ci.mozIJSSubScriptLoader));

    var context = {};
    loader.loadSubScript(url, context);
    
    var names = Array.slice(arguments, 1);
    return names.map(function(name) { return context[name]; });
}


// DEVELOPER UTILITIES
// ----------------------------------------------------------------------

function log(msg) {
    Cc['@mozilla.org/consoleservice;1']
        .getService(Ci.nsIConsoleService)
        .logStringMessage('XMPP Cache ' + msg);
}


// TESTS
// ----------------------------------------------------------------------

function verify() {
    var assert = {
        isNull: function(thing) {
            if(thing != null)
                throw new Error('Not a null-equivalent. (' + thing + ')');
        },

        isEquivalentXML: function(a, b) {
            compareXML(a, b);
        },

        equals: function(a, b) {
            if(a != b)
                throw new Error('Not equal. (' + a + ',' + b + ')');
        }
    };

    var presenceTests = {
        'contact sends user available presence, cache is empty: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>);
        },

        'contact sends available presence, presence from contact not in cache: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="marvin@spaceship.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence from="marvin@spaceship.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>);
        },

        'contact sends available presence, presence from contact is already in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <show>away</show>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    <show>away</show>
                    </presence>);
        },

        'contact sends available presence to user-without resource; presence from contact is already in cache: replace': function() {
            // Like previous test, but covering the case where
            // presence is sent to our bare jid

            var cache = new Cache();
            cache.addRule(presenceRules);
            
            cache.receive(
                asDOM(<presence from="arthur@server.org/Test" to="ford@betelgeuse.org" id="1003">
                      <status>test</status>
                      <meta account="ford@betelgeuse.org/Firefox" direction="in" xmlns="http://hyperstruct.net/xmpp4moz"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="arthur@server.org/Test" to="ford@betelgeuse.org" id="1004">
                      <show>away</show>
                      <meta account="ford@betelgeuse.org/Firefox" direction="in" xmlns="http://hyperstruct.net/xmpp4moz"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="arthur@server.org/Test" to="ford@betelgeuse.org" id="1005">
                      <meta account="ford@betelgeuse.org/Firefox" direction="in" xmlns="http://hyperstruct.net/xmpp4moz"/>
                      </presence>));
            
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
                      to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                     </presence>));
            cache.receive(
                asDOM(<presence from="transport.earth.org" type="unavailable"
                      to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.equals(1, stanzas.snapshotLength);
            assert.isEquivalentXML(
                    <presence from="transport.earth.org" type="unavailable" to="arthur@earth.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>,
                    asXML(stanzas.snapshotItem(0)));
        },

        'contact sends unavailable presence, presence from contact is not in cache: ignore': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            assert.isNull(cache.first('//presence'));
        },

        'contact sends unavailable presence, presence from contact is in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>);
        },

        // CHAT ROOM

        'occupant sends uavailable presence, presence from occupant is not in cache: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="room@server/foo" to="arthur@earth.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    <x xmlns="http://jabber.org/protocol/muc#user"/>
                    </presence>);
        },

        'occupant sends available presence, presence from occupant is in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      <show>away</show>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence from="room@server/foo" to="arthur@earth.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    <x xmlns="http://jabber.org/protocol/muc#user"/>
                    <show>away</show>
                    </presence>);
        },

        'occupant sends unavailable presence, presence from occupant is not in cache: ignore': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="room@server/arthur">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" type="unavailable">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence to="room@server/arthur">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
            assert.isNull(stanzas.snapshotItem(1));
        },

        'occupant sends unavailable presence, presence from occupant is in cache: remove': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="room@server/arthur">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" type="unavailable">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <x xmlns="http://jabber.org/protocol/muc#user"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence to="room@server/arthur">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
            assert.isNull(stanzas.snapshotItem(1));
        },

        'user sends available presence, no user presence is in cache: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence>
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    </presence>);
        },

        'user sends contacts available presence, user presence is in cache: replace': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));
            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      <show>away</show>
                      </presence>));

            assert.isEquivalentXML(
                asXML(cache.first('//presence')),
                    <presence>
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    <show>away</show>
                    </presence>);
        },

        'user sends contacts available presences through multiple accounts: do not mix': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));
            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m} account="marvin@spaceship.org/Test" direction="out"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence>
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    </presence>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence>
                    <meta xmlns={ns_x4m} account="marvin@spaceship.org/Test" direction="out"/>
                    </presence>);
        },

        'user sends directed presence: do not cache': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));
            cache.receive(
                asDOM(<presence to="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence>
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    </presence>);
            assert.isNull(stanzas.snapshotItem(1));
        },

        'user receives presence subscription: do not cache': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="arthur@earth.org/Test" type="subscribe">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            assert.isNull(cache.first('//presence'));
        },

        'user sends presence subscription confirmation: do not cache': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="arthur@earth.org/Test" type="subscribed">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));

            assert.isNull(cache.first('//presence'));
        },

        'fetch presences from a given session and contact address': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <show>dnd</show>
                      </presence>));
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Toast">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));
            cache.receive(
                asDOM(<presence from="marvin@spaceship.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var stanzas = cache.all(
                q()
                .event('presence')
                .account('arthur@earth.org/Test')
                .from('ford@betelgeuse.org')
                .compile());
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    <show>dnd</show>
                    </presence>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence from="ford@betelgeuse.org/Toast">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>);
        },

        'user sends regular presence, user sends muc presence: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence>
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      </presence>));
            cache.receive(
                asDOM(<presence to="room@server/arthur">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence>
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    </presence>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence to="room@server/arthur">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
        },

        'user sends muc presence, user sends a different muc presence: add': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence to="room@server/arthur">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));
            cache.receive(
                asDOM(<presence to="anotherroom@server/arthur">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                      <x xmlns="http://jabber.org/protocol/muc"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(0)),
                    <presence to="room@server/arthur">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
            assert.isEquivalentXML(
                asXML(stanzas.snapshotItem(1)),
                    <presence to="anotherroom@server/arthur">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="out"/>
                    <x xmlns="http://jabber.org/protocol/muc"/>
                    </presence>);
        },

        'non-muc <x/> child elements are ignored when deciding whether later presence should replace previous one': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);

            cache.receive(
                asDOM(<presence from="alyssa@sameplace.cc/SamePlaceAgent"
                      to="alyssa@sameplace.cc/Firefox" xml:lang="*">
                      <meta xmlns={ns_x4m} account="alyssa@sameplace.cc/Firefox" direction="in"/>
                      <status/>
                      <priority>0</priority>
                      <c node="http://www.google.com/xmpp/client/caps" ver="1.0.0.66"
                      ext="share-v1" xmlns="http://jabber.org/protocol/caps"/>
                      <x stamp="20070420T20:36:59" xmlns="jabber:x:delay"/>
                      </presence>));

            cache.receive(
                asDOM(<presence from="alyssa@sameplace.cc/SamePlaceAgent"
                      to="alyssa@sameplace.cc/Firefox" type="unavailable">
                      <meta xmlns={ns_x4m} account="alyssa@sameplace.cc/Firefox" direction="in"/>
                      </presence>));

            var stanzas = cache.all('//presence');
            assert.isEquivalentXML(
                <presence from="alyssa@sameplace.cc/SamePlaceAgent"
                to="alyssa@sameplace.cc/Firefox" type="unavailable">
                    <meta xmlns={ns_x4m} account="alyssa@sameplace.cc/Firefox" direction="in"/>
                    </presence>,
                asXML(stanzas.snapshotItem(0)));
            assert.isNull(stanzas.snapshotItem(1));
        }
    };

    var rosterTests = {
        'receive iq roster': function() {
            var cache = new Cache();
            cache.addRule(rosterRules);

            cache.receive(
                asDOM(<iq type="result" from="arthur@earth.org/Resource"
                      to="arthur@earth.org/Resource">
                      <meta xmlns={ns_x4m} direction="in" account="arthur@earth.org/Test"/>
                      <query xmlns="jabber:iq:roster">
                      <item jid="ford@betelgeuse.org"/>
                      </query>
                      </iq>));

            assert.isEquivalentXML(
                    <iq type="result" from="arthur@earth.org/Resource"
                to="arthur@earth.org/Resource">
                    <meta xmlns={ns_x4m} direction="in" account="arthur@earth.org/Test"/>
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org"/>
                    </query>
                    </iq>,
                asXML(cache.first('//iq')));
        },

        'roster with update (addition) causes new roster to replace existing one': function() {
            var cache = new Cache();
            cache.addRule(rosterRules);

            cache.receive(
                asDOM(<iq type="result" from="arthur@earth.org">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item jid="ford@betelgeuse.org"/>
                      </query>
                      </iq>));
            cache.receive(
                asDOM(<iq type="set" from="arthur@earth.org">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item jid="marvin@spaceship.org"/>
                      </query>
                      </iq>));

            var stanzas = cache.all('//iq');
            assert.equals(1, stanzas.snapshotLength);
            assert.isEquivalentXML(
                    <iq type="result" from="arthur@earth.org">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org"/>
                    <item jid="marvin@spaceship.org"/>
                    </query>
                    </iq>,
                asXML(stanzas.snapshotItem(0)));
        },

        'roster with update (removal) causes new roster to replace existing one': function() {
            var cache = new Cache();
            cache.addRule(rosterRules);

            cache.receive(
                asDOM(<iq type="result" from="arthur@earth.org">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item jid="ford@betelgeuse.org"/>
                      <item jid="zaphod@betelgeuse.org"/>
                      </query>
                      </iq>));
            cache.receive(
                asDOM(<iq type="set" from="arthur@earth.org">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item jid="ford@betelgeuse.org" subscription="remove"/>
                      </query>
                      </iq>));

            assert.isEquivalentXML(
                    <iq type="result" from="arthur@earth.org">
                    <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                    <query xmlns="jabber:iq:roster">
                    <item jid="zaphod@betelgeuse.org"/>
                    </query>
                    </iq>,
                asXML(cache.first('//iq')));
        },

        'roster with update (replacement) causes new roster to replace existing one': function() {
            var cache = new Cache();
            cache.addRule(rosterRules);

            cache.receive(
                asDOM(<iq type="result" from="arthur@earth.org">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item jid="ford@betelgeuse.org"/>
                      </query>
                      </iq>));
            cache.receive(
                asDOM(<iq type="set" from="arthur@earth.org">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item jid="ford@betelgeuse.org" name="Ford"/>
                      </query>
                      </iq>));

            assert.isEquivalentXML(
                    <iq type="result" from="arthur@earth.org">
                    <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org" name="Ford"/>
                    </query>
                    </iq>,
                asXML(cache.first('//iq')));
        },

        'roster result causes replacement': function() {
            var cache = new Cache();
            cache.addRule(rosterRules);

            cache.receive(
                asDOM(<iq from="arthur@server.org/Test" to="arthur@server.org/Test"
                      type="result">
                      <query xmlns="jabber:iq:roster"/>
                      <meta xmlns="http://hyperstruct.net/xmpp4moz"
                      account="arthur@server.org/Test" direction="in"/>
                      </iq>));
            cache.receive(
                asDOM(<iq from="arthur@server.org/Test" to="arthur@server.org/Test"
                      id="1001" type="result">
                      <query xmlns="jabber:iq:roster">
                      <item subscription="both" jid="marvin@spaceship.org"/>
                      <item subscription="both" jid="ford@betelgeuse.org"/>
                      </query>
                      <meta xmlns="http://hyperstruct.net/xmpp4moz"
                      account="arthur@server.org/Test" direction="in"/>
                      </iq>));

            assert.isEquivalentXML(
                    <iq from="arthur@server.org/Test" to="arthur@server.org/Test"
                id="1001" type="result">
                    <query xmlns="jabber:iq:roster">
                    <item subscription="both" jid="marvin@spaceship.org"/>
                    <item subscription="both" jid="ford@betelgeuse.org"/>
                    </query>
                    <meta xmlns="http://hyperstruct.net/xmpp4moz"
                account="arthur@server.org/Test" direction="in"/>
                    </iq>,
                asXML(cache.first('//iq')));
        },

        'cached roster stanzas remain unchanged': function() {
            var cache = new Cache();
            cache.addRule(rosterRules);

            cache.receive(
                asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item subscription="both" jid="marvin@earth.org"/>
                      </query>
                      </iq>));

            var rosterPush =
                asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" id="push" type="set">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item subscription="both" name="Marvin" jid="marvin@earth.org"/>
                      </query>
                      </iq>);

            cache.receive(rosterPush);

            assert.isEquivalentXML(
                    <iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" id="push" type="set">
                    <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                    <query xmlns="jabber:iq:roster">
                    <item subscription="both" name="Marvin" jid="marvin@earth.org"/>
                    </query>
                    </iq>,
                asXML(rosterPush));
        },

        'empty roster result does not modify cache': function() {
            var cache = new Cache();
            cache.addRule(rosterRules);

            cache.receive(
                asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster"/>
                      </iq>));
            cache.receive(
                asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster">
                      <item subscription="both" jid="marvin@earth.org"/>
                      </query>
                      </iq>));;
            cache.receive(
                asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:roster"/>
                      </iq>));

            assert.isEquivalentXML(
                    <iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                    <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                    <query xmlns="jabber:iq:roster">
                    <item subscription="both" jid="marvin@earth.org"/>
                    </query>
                    </iq>,
                asXML(cache.first('//iq')));
        }
    };

    var bookmarkTests = {
        'bookmarks are cached': function() {
            var cache = new Cache();
            cache.addRule(bookmarkRules);

            cache.receive(
                asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:private">
                      <storage xmlns="storage:bookmarks">
                      <conference jid="test@places.earth.org"/>
                      </storage>
                      </query>
                      </iq>));

            cache.receive(
                asDOM(<iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                      <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                      <query xmlns="jabber:iq:private">
                      <storage xmlns="storage:bookmarks">
                      <conference jid="test@places.earth.org"/>
                      <conference jid="seaside@places.earth.org"/>
                      </storage>
                      </query>
                      </iq>));

            assert.isEquivalentXML(
                    <iq from="arthur@earth.org/Firefox" to="arthur@earth.org/Firefox" type="result">
                    <meta xmlns={ns_x4m} account="arthur@earth.org" direction="in"/>
                    <query xmlns="jabber:iq:private">
                    <storage xmlns="storage:bookmarks">
                    <conference jid="test@places.earth.org"/>
                    <conference jid="seaside@places.earth.org"/>
                    </storage>
                    </query>
                    </iq>,
                asXML(cache.first('//iq')));
        }
    };

    // Compatibility layer no longer here.  Leaving these for
    // documentation (for now).

    var compatibilityTests = {
        'return wrapped objects': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var results = cache.fetch({
                event     : 'presence',
                direction : 'in',
                account   : 'arthur@earth.org/Test',
                stanza    : function(s) {
                    return s.getAttribute('from') == 'ford@betelgeuse.org/Test';
                }
            });

            assert.equals(1, results.length);
            assert.isEquivalentXML(
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>,
                asXML(results[0].stanza));
        },

        'handle nested patterns': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var results = cache.fetch({
                event     : 'presence',
                direction : 'in',
                session   : { name: 'arthur@earth.org/Test' }
            });

            assert.equals(1, results.length);
            assert.isEquivalentXML(
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>,
                asXML(results[0].stanza));
        },

        'handle nested patterns 2': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var results = cache.fetch({
                event     : 'presence',
                direction : 'in',
                from: { address: 'ford@betelgeuse.org/Test' },
            });

            assert.equals(1, results.length);
            assert.isEquivalentXML(
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>,
                asXML(results[0].stanza));
        },

        'handle nested patterns 3': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var results = cache.fetch({
                event     : 'presence',
                direction : 'in',
                session   : function(s) { return s.name == 'arthur@earth.org/Test'; }
            });

            assert.equals(1, results.length);
            assert.isEquivalentXML(
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>,
                asXML(results[0].stanza));
        },

        'handle nested patterns 3': function() {
            var cache = new Cache();
            cache.addRule(presenceRules);
            cache.receive(
                asDOM(<presence from="ford@betelgeuse.org/Test">
                      <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                      </presence>));

            var results = cache.fetch({
                event     : 'presence',
                direction : 'in',
            });

            assert.equals(1, results.length);
            assert.isEquivalentXML(
                    <presence from="ford@betelgeuse.org/Test">
                    <meta xmlns={ns_x4m} account="arthur@earth.org/Test" direction="in"/>
                    </presence>,
                asXML(results[0].stanza));
        }
        
    };

   function runTests(tests) {
        var report = [];
        for(var testName in tests)
            try {
                tests[testName].call();
            } catch(e) {
                report.push('**********************************************************************');
                report.push('FAILURE: ' + testName + '\n' + e.message);
                report.push(e.stack);
            }
        report.push('\nTests completed.');
        return report.join('\n');
    }

    return [
        presenceTests,
        rosterTests,
        bookmarkTests
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
                    <meta xmlns={ns_x4m} account="arthur@server.org"/>
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

