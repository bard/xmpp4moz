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


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc          = Components.classes;
var Ci          = Components.interfaces;
var Cu          = Components.utils;
var loader      = Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader);
var DB          =
    (function() {
        var pkg = {};
        loader.loadSubScript('chrome://xmpp4moz/content/lib/db.js', pkg);
        return pkg.DB;
    })();

var ns_roster   = 'jabber:iq:roster';
var ns_muc      = 'http://jabber.org/protocol/muc';
var ns_muc_user = 'http://jabber.org/protocol/muc#user';


// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

function Cache() {
    this._db = new DB({indices: ['from.full', 'from.address', 'account', 'event']});

    var presence = {
        manages: function(object) {
            if(object.event != 'presence')
                return false;

            // Directed presence of a type other than the one used to join a room?

            if(object.stanza.hasAttribute('to') &&
               !object.stanza.hasAttribute('from') &&
               object.stanza.getElementsByTagNameNS(ns_muc, 'x').length == 0)
                return false;

            if(object.stanza.hasAttribute('type') &&
               object.stanza.getAttribute('type') != 'unavailable')
                return false;

            return true;
        },

        apply: function(db, object) {
            var previous = db.get({
                event   : 'presence',
                session : object.session,
                from    : { full: object.from.full }
                });

            if(object.stanza.getAttribute('type') == 'unavailable') {
                if(previous && previous[0])
                    if(isMUCUserPresence(previous[0].stanza))
                        db.put(null, previous[0].id);
                    else
                        db.put(object, previous[0].id);
            } else {
                if(previous && previous[0])
                    db.put(object, previous[0].id);
                else
                    db.put(object);
            }
        }
    };

    var roster = {
        manages: function(object) {
            return (object.event == 'iq' &&
                    object.stanza.getElementsByTagNameNS(ns_roster, 'query').length > 0);
        },

        apply: function(db, object) {
            function getItem(query, jid) {
                var items = query.getElementsByTagName('item');
                for(var i=0; i<items.length; i++)
                    if(items[i].getAttribute('jid') == jid)
                        return items[i];

                return null;
            }

            var previous = db.get({
                event   : 'iq',
                session : object.session,
                stanza  : function(s) {
                        return (s.getElementsByTagNameNS(ns_roster, 'query').length > 0);
                    }
                });

            if(!previous[0])
                db.put(object);
            else if(previous[0].stanza.getElementsByTagNameNS(ns_roster, 'query')[0].childNodes.length == 0)
                previous[0].stanza = object.stanza;
            else {
                var pushedItem = object.stanza
                    .getElementsByTagNameNS(ns_roster, 'query')[0]
                    .getElementsByTagName('item')[0];
                
                if(pushedItem)
                    pushedItem = pushedItem.cloneNode(true);
                else
                    return;

                var updatedIq = previous[0].stanza.cloneNode(true);
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

                previous[0].stanza = updatedIq;
            }
        }
    }

    this._policies = [ presence, roster ];
}

Cache.prototype = {
    fetch: function(pattern) {
        return this._db.get(pattern);
    },
    
    receive: function(object) {
        function enrich(object) {
            object.__defineGetter__(
                'event', function() {
                    return this.stanza.nodeName;
                });
            
            object.__defineGetter__(
                'account', function() {
                    return this.session.name;
                });

            object.__defineGetter__(
                'direction', function() {
                    // XXX won't return correct result for roster
                    return (this.stanza.hasAttribute('from') ?
                            'in' : 'out');
                });
            
            object.__defineGetter__(
                'from', function() {
                    return this.stanza.hasAttribute('from') ?
                        JID(this.stanza.getAttribute('from')) :
                        { full: undefined, username: undefined, hostname: undefined}
                });
            return object;
        }

        enrich(object);

        for each(var policy in this._policies) {
            if(policy.manages(object))
                policy.apply(this._db, object)
        }
    }
};


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

function isMUCUserPresence(presenceStanza) {
    var x = presenceStanza.getElementsByTagName('x')[0];
    return (x && x.getAttribute('xmlns') == ns_muc_user);
}

function verify() {
    function asDOM(xml) {
        return Cc['@mozilla.org/xmlextras/domparser;1']
            .getService(Ci.nsIDOMParser)
            .parseFromString(xml.toXMLString(), 'text/xml')
            .documentElement;
    }

    function asStanzas(presences) {
        return presences.map(function(presence) { return asXML(presence.stanza); });
    }

    function asXML(dom) {
        return new XML(Cc['@mozilla.org/xmlextras/xmlserializer;1']
                       .getService(Ci.nsIDOMSerializer)
                       .serializeToString(dom));
    }

    var assert = {
        equals: function(array1, array2) {
            if(typeof(array1) != typeof(array2)) {
                throw new Error('FAIL: different object types - ' + Components.stack.caller.lineNumber);
            }
            else if(typeof(array1) == 'xml') {
                if(array1 != array2)
                    throw new Error('FAIL: ' + Components.stack.caller.lineNumber);
            }
            else if('length' in array1) {
                if(array1.length != array2.length) {
                    throw new Error('FAIL: different array lengths - ' + Components.stack.caller.lineNumber);
                    return;
                } else {
                    for(var i=0; i<array1.length; i++)
                        if(array1[i] != array2[i])
                            throw new Error('FAIL: ' + Components.stack.caller.lineNumber +
                                            ' (' + array1[i] + ' vs ' + array2[i] + ')');
                    
                }
            }
        }
    };

    var tests = {
        'start: cache is empty': function() {
            var cache = new Cache();
            assert.equals([], cache._db._store);
        },

        'contact sends user available presence, cache is empty: add': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test"/>)
                });

            assert.equals([<presence from="ford@betelgeuse.org/Test"/>],
                          asStanzas(cache._db._store));
        },

        'contact sends user available presence, presence from contact is not in cache: add': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test"/>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="marvin@spaceship.org/Test"/>)
                });

            assert.equals([<presence from="ford@betelgeuse.org/Test"/>,
                           <presence from="marvin@spaceship.org/Test"/>],
                          asStanzas(cache._db._store));
        },

        'contact sends user available presence, presence from contact is already in cache: replace': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test"/>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test">
                              <show>away</show>
                              </presence>)
                });

            assert.equals([<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test">
                           <show>away</show>
                           </presence>],
                          asStanzas(cache._db._store));
        },

        'contact sends user unavailable presence, presence from contact is not in cache: ignore': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable"/>)
                });

            assert.equals([], asStanzas(cache._db._store));
        },
        
        'contact sends user unavailable presence, presence from contact is in cache: replace': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test"/>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable"/>)
                });

            assert.equals([<presence from="ford@betelgeuse.org/Test" to="arthur@earth.org/Test" type="unavailable"/>],
                          asStanzas(cache._db._store));
        },

        'occupant sends user available presence, presence from occupant is not in cache: add': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                              <x xmlns="http://jabber.org/protocol/muc#user"/>
                              </presence>)
                });

            assert.equals([<presence from="room@server/foo" to="arthur@earth.org/Test">
                           <x xmlns="http://jabber.org/protocol/muc#user"/>
                           </presence>],
                          asStanzas(cache._db._store));
        },

        'occupant sends user available presence, presence from occupant is in cache: replace': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                              <x xmlns="http://jabber.org/protocol/muc#user"/>
                              </presence>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                              <x xmlns="http://jabber.org/protocol/muc#user"/>
                              <show>away</show>
                              </presence>)
                });

            assert.equals([<presence from="room@server/foo" to="arthur@earth.org/Test">
                           <x xmlns="http://jabber.org/protocol/muc#user"/>
                           <show>away</show>
                           </presence>],
                          asStanzas(cache._db._store));
        },
        
        'occupant sends user unavailable presence, presence from occupant is not in cache: ignore': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence to="room@server/arthur">
                              <x xmlns="http://jabber.org/protocol/muc"/>
                              </presence>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" type="unavailable">
                              <x xmlns="http://jabber.org/protocol/muc#user"/>
                              </presence>)
                });

            assert.equals([<presence to="room@server/arthur">
                           <x xmlns="http://jabber.org/protocol/muc"/>
                           </presence>],
                          asStanzas(cache._db._store));
        },

        'occupant sends user unavailable presence, presence from occupant is in cache: remove': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence to="room@server/arthur">
                              <x xmlns="http://jabber.org/protocol/muc"/>
                              </presence>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test">
                              <x xmlns="http://jabber.org/protocol/muc#user"/>
                              </presence>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="room@server/foo" to="arthur@earth.org/Test" type="unavailable">
                              <x xmlns="http://jabber.org/protocol/muc#user"/>
                              </presence>)
                });

            assert.equals([<presence to="room@server/arthur">
                           <x xmlns="http://jabber.org/protocol/muc"/>
                           </presence>, undefined],
                          asStanzas(cache._db._store));
        },

        'user sends contacts available presence, no user presence is in cache: add': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence/>)
                });

            assert.equals([<presence/>], asStanzas(cache._db._store));
        },

        'user sends contacts available presence, user presence is in cache: replace': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence/>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence><show>away</show></presence>)
                });

            assert.equals([<presence><show>away</show></presence>],
                          asStanzas(cache._db._store));
        },

        'user sends contacts available presences through multiple accounts: do not mix': function() {
            var cache = new Cache();

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence/>)
                });

            cache.receive({
                session: { name: 'marvin@spaceship.org/Test' },
                stanza: asDOM(<presence/>)
                });

            assert.equals([<presence/>, <presence/>],
                          asStanzas(cache._db._store));
        },

        'user sends contact directed presence: do not cache': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence/>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence to="ford@betelgeuse.org/Test"/>)
                });

            assert.equals([<presence/>], asStanzas(cache._db._store));
        },

        'user receives presence subscription: do not cache': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="arthur@earth.org/Test" type="subscribe"/>)
                });

            assert.equals([], asStanzas(cache._db._store));
        },

        'user sends presence subscription confirmation: do not cache': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence to="arthur@earth.org/Test" type="subscribed"/>)
                });

            assert.equals([], asStanzas(cache._db._store));
        },

        'fetch presences from a given session and contact address': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Test"><show>dnd</show></presence>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="ford@betelgeuse.org/Toast"/>)
                });

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(<presence from="marvin@spaceship.org/Test"/>)
                });

            assert.equals(
                [<presence from="ford@betelgeuse.org/Test"><show>dnd</show></presence>,
                 <presence from="ford@betelgeuse.org/Toast"/>],
                asStanzas(cache.fetch({
                              session: { name: 'arthur@earth.org/Test' },
                              from: { address: 'ford@betelgeuse.org' }})));
        },

        'receive iq roster': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(
                    <iq type="result" from="arthur@earth.org/Resource" to="arthur@earth.org/Resource">
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org"/>
                    </query>
                    </iq>)});

            assert.equals(
                [<iq type="result" from="arthur@earth.org/Resource" to="arthur@earth.org/Resource">
                 <query xmlns="jabber:iq:roster">
                 <item jid="ford@betelgeuse.org"/>
                 </query>
                 </iq>], asStanzas(cache.fetch({})));
        },

        'roster with update (addition) causes new roster to replace existing one': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(
                    <iq type="result" from="arthur@earth.org">
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org"/>
                    </query>
                    </iq>)});

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(
                    <iq type="set" from="arthur@earth.org">
                    <query xmlns="jabber:iq:roster">
                    <item jid="marvin@spaceship.org"/>
                    </query>
                    </iq>)});

            assert.equals(
                [<iq type="result" from="arthur@earth.org">
                 <query xmlns="jabber:iq:roster">
                 <item jid="ford@betelgeuse.org"/>
                 <item jid="marvin@spaceship.org"/>
                 </query>
                 </iq>], asStanzas(cache.fetch({})));
        },

        'roster with update (removal) causes new roster to replace existing one': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(
                    <iq type="result" from="arthur@earth.org">
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org"/>
                    <item jid="zaphod@betelgeuse.org"/>
                    </query>
                    </iq>)});

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(
                    <iq type="set" from="arthur@earth.org">
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org" subscription="remove"/>
                    </query>
                    </iq>)});

            assert.equals(
                [<iq type="result" from="arthur@earth.org">
                 <query xmlns="jabber:iq:roster">
                 <item jid="zaphod@betelgeuse.org"/>
                 </query>
                 </iq>], asStanzas(cache.fetch({})));
        },

        'roster with update (replacement) causes new roster to replace existing one': function() {
            var cache = new Cache();
            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(
                    <iq type="result" from="arthur@earth.org">
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org"/>
                    </query>
                    </iq>)});

            cache.receive({
                session: { name: 'arthur@earth.org/Test' },
                stanza: asDOM(
                    <iq type="set" from="arthur@earth.org">
                    <query xmlns="jabber:iq:roster">
                    <item jid="ford@betelgeuse.org" name="Ford"/>
                    </query>
                    </iq>)});

            assert.equals(
                [<iq type="result" from="arthur@earth.org">
                 <query xmlns="jabber:iq:roster">
                 <item jid="ford@betelgeuse.org" name="Ford"/>
                 </query>
                 </iq>], asStanzas(cache.fetch({})));
        },

        'cached roster stanzas remain unchanged': function() {
            var cache = new Cache();

            cache.receive({
                session: { name: 'arthur@sameplace.cc/Firefox' },
                stanza: asDOM(
                    <iq from="arthur@sameplace.cc/Firefox" to="arthur@sameplace.cc/Firefox" type="result">
                    <query xmlns="jabber:iq:roster">
                    <item subscription="both" jid="marvin@sameplace.cc"/>
                    </query>
                    </iq>)
                });

            var rosterPush = asDOM(
                <iq from="arthur@sameplace.cc/Firefox" to="arthur@sameplace.cc/Firefox" id="push" type="set">
                <query xmlns="jabber:iq:roster">
                <item subscription="both" name="Marvin" jid="marvin@sameplace.cc"/>
                </query>
                </iq>);

            cache.receive({
                session: { name: 'arthur@sameplace.cc/Firefox' },
                stanza: rosterPush
                });

            assert.equals(
                <iq from="arthur@sameplace.cc/Firefox" to="arthur@sameplace.cc/Firefox" id="push" type="set">
                <query xmlns="jabber:iq:roster">
                <item subscription="both" name="Marvin" jid="marvin@sameplace.cc"/>
                </query>
                </iq>,
                asXML(rosterPush));
        },

        'empty roster result does not modify cache': function() {
            var cache = new Cache();

            cache.receive({
                session: { name: 'arthur@sameplace.cc/Firefox' },
                stanza: asDOM(
                    <iq from="arthur@sameplace.cc/Firefox" to="arthur@sameplace.cc/Firefox" type="result">
                    <query xmlns="jabber:iq:roster"/>
                    </iq>)
                });

            cache.receive({
                session: { name: 'arthur@sameplace.cc/Firefox' },
                stanza: asDOM(
                    <iq from="arthur@sameplace.cc/Firefox" to="arthur@sameplace.cc/Firefox" type="result">
                    <query xmlns="jabber:iq:roster">
                    <item subscription="both" jid="marvin@sameplace.cc"/>
                    </query>
                    </iq>)
                });

            cache.receive({
                session: { name: 'arthur@sameplace.cc/Firefox' },
                stanza: asDOM(
                    <iq from="arthur@sameplace.cc/Firefox" to="arthur@sameplace.cc/Firefox" type="result">
                    <query xmlns="jabber:iq:roster"/>
                    </iq>)
                });

            assert.equals(
                [<iq from="arthur@sameplace.cc/Firefox" to="arthur@sameplace.cc/Firefox" type="result">
                 <query xmlns="jabber:iq:roster">
                 <item subscription="both" jid="marvin@sameplace.cc"/>
                 </query>
                 </iq>],
                asStanzas(cache.fetch({})));
        }
    };

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

function profile() {
    function createDataset(n) {
        function asDOM(xml) {
            return Cc['@mozilla.org/xmlextras/domparser;1']
                .getService(Ci.nsIDOMParser)
                .parseFromString(xml.toXMLString(), 'text/xml')
                .documentElement;
        }

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
