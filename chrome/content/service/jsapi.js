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


/**
 * This is a convenience stateless wrapper to the bare XPCOM service,
 * to allow using it more comfortably from javascript.
 *
 * Creating a channel that filters incoming events:
 *
 *     var channel = XMPP.createChannel();
 *     channel.on(
 *         {event: 'message', direction: 'in'},
 *         function(message) { alert(message.stanza); } );
 *
 * Bringing up a session: 
 *     
 *     XMPP.up(
 *         'user@server.org/Resource',
 *         {password: 'secret'});
 *
 * Sending a stanza:
 *
 *     XMPP.send(
 *         'user@server.org/Resource',
 *         <message to="contact@server.org">
 *         <body>hello</body>
 *         </message>);
 *     
 */

// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const service = Cc['@hyperstruct.net/xmpp4moz/xmppservice;1']
    .getService(Ci.nsIXMPPClientService);
    
const pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.');

const serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Ci.nsIDOMSerializer);

const srvPrompt = Cc["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Ci.nsIPromptService);

const ns_muc        = 'http://jabber.org/protocol/muc';
const ns_roster     = 'jabber:iq:roster';
const ns_disco_info = 'http://jabber.org/protocol/disco#info';    


// DEVELOPER INTERFACE
// ----------------------------------------------------------------------

var cache = {
    get roster() {
        return this.fetch({
            event  : 'iq',
            stanza : function(s) {
                    return s.ns_roster::query != undefined;
                }});
    },

    get presenceIn() {
        return this.fetch({ event: 'presence', direction: 'in' });
    },

    get presenceOut() {
        return this.fetch({ event: 'presence', direction: 'out' });
    },

    fetch: function(pattern) {
        // parts of the pattern may have to be evaluated locally
        // (e.g. those that reason in E4X instead of DOM).  A better
        // strategy has to be found for this.

        var remotePattern = {}, localPattern = {};
        for(var member in pattern)
            if(typeof(pattern[member]) == 'function')
                localPattern[member] = pattern[member];
            else
                remotePattern[member] = pattern[member];
        
        return service.wrappedJSObject.cache
        .fetch(remotePattern)
        .map(function(internalObject) {
                 return wrapEvent({
                     stanza: dom2xml(internalObject.stanza),
                     session: internalObject.session,
                     direction: internalObject.direction 
                     });
             })
        .filter(function(event) {
                    return match(event, localPattern);
                });
    },

    find: function(pattern) {
        return this.fetch(pattern)[0];
    }
};

function nickFor(account, address) {
    var roster = cache.find({
        event     : 'iq',
        direction : 'in',
        account   : account,
        stanza    : function(s) { return s.ns_roster::query != undefined; }});
        
    var name;
    if(roster) {
        var item = roster.stanza..ns_roster::item
            .(@jid == address);
        name = item.@name.toString();
    }

    return name || JID(address).username || address;
}

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

/**
 * Establishes a client session with an XMPP server.
 *
 * _account_ can be null, a string, or an object.
 *
 * Scenarios:
 *
 * _account_ is a null-equivalent.  User will be prompted to select an
 * account.  Accounts come through the in-scope "accounts" object.
 *
 *     XMPP.up();
 *     XMPP.up(null);
 *
 * _account_ is a string.  The corresponding account object is looked
 * up in the in-scope "accounts" object.
 *
 *     XMPP.up('arthur@earth.org/Guide');
 *     XMPP.up('ford@betelgeuse.org/Towel');
 *
 * _account_ is an empty object.  User will be prompted to select an
 * account like when _account_ is a null-equivalent, but in this case
 * _account_ will retain the JID selected by the user:
 *
 *     var account = {};
 *     XMPP.up(account);
 *     alert(account.jid); // will display "arthur@earth.org/Guide"
 *
 * _account_ is an object containing an account definition.
 *
 *     var account = {
 *         jid                : 'arthur@earth.org/Guide',
 *         password           : '42',
 *         connectionSecurity : 1
 *     }
 *     XMPP.up(account);
 *
 * Following fields are available for the account object:
 *
 *     jid                : full JID, including resource
 *     password           : password
 *     connectionHost     : host, if different from the domain part of the JID
 *     connectionPort     : port, if different from 5223
 *     connectionSecurity : 0 = no SSL, 1 = SSL (default)
 *
 *
 * The second parameter, _opts_, is deprecated.  Don't use it.
 *
 * (*) This will be soon deprecated in favour of the in-scope
 * "accounts" object.
 *
 */

function up(account, extra) {
    // Normalize arguments (including deprecated ones) so that _up()
    // can concentrate on the real job.

    var continuation;
    if(typeof(extra) == 'function')
        continuation = extra;
    else if(typeof(extra) == 'object') {
        deprecation(
            'opts parameter will be removed, use account instead.');
        if(extra.ssl)
            account.connectionSecurity = 1;
        if(extra.host)
            account.connectionHost = extra.host;
        if(extra.port)
            account.connectionPort = extra.port;
        if(extra.continuation)
            continuation = extra.continuation;
    }
    
    if(!account)
        account = {};
    else if(typeof(account) == 'string')
        account = this.getAccountByJid(account);
    
    if(account.jid)
        this._up(account, continuation);
    else
        this._up(null, function(jid) {
                     account.jid = jid;
                     if(continuation)
                         continuation(jid);
                 });
}

function down(account) {
    var jid = 
        (typeof(account) == 'object' && account.jid) ?
        account.jid : account;

    this.send(jid, <presence type="unavailable"/>);
    service.close(jid);
}

function isUp(account) {
    return service.isUp(
        typeof(account) == 'object' ? account.jid : account);
}

function isDown(account) {
    return !isUp(account);
}

function send(account, stanza, handler) {
    var _this = this;
    if(this.isUp(account))
        this._send(account.jid || account, stanza, handler);
    else
        // TODO will multiple send cause multiple signon dialogs?
        this.up(account, function(jid) {
                    _this._send(jid, stanza, handler);
                });
}

function createChannel(features) {
    var _this = this;

    var channel = {
        _watchers: [],

        on: function(pattern, handler) {
            var reaction = {pattern: pattern, handler: handler};
            this._watchers.push(reaction);
            return reaction;
        },

        forget: function(watcher) {
            var index = this._watchers.indexOf(watcher);
            if(index != -1) 
                this._watchers.splice(index, 1);
        },

        receive: function(event) {
            this._handle1(event, this._watchers, match);
        },

        observe: function(subject, topic, data) {
            var match = topic.match(/^(stream|data|stanza|transport)-(in|out)$/);

            var eventObject = {
                event: match[1],
                direction: match[2],
                session: _this.service.getSession(data.toString()) || { name: data.toString() },
            };

            switch(eventObject.event) {
                case 'transport':
                subject.QueryInterface(Ci.nsISupportsString).toString();
                eventObject.state = subject.toString();
                break;
                case 'stream':
                subject.QueryInterface(Ci.nsISupportsString).toString();
                eventObject.state = subject.toString();
                break;
                case 'data':
                subject.QueryInterface(Ci.nsISupportsString).toString();
                eventObject.content = subject.toString();
                break;
                case 'stanza':
                subject.QueryInterface(Ci.nsIDOMElement);
                var stanza = dom2xml(subject);
                eventObject.event = stanza.name();
                eventObject.stanza = stanza;
                break;
            }
            this.receive(wrapEvent(eventObject));
        },

        release: function() {
            _this.service.removeObserver(this, null, null);
            if(features)
                for each(var feature in features.ns_disco_info::feature) {
                    _this.service.removeFeature(feature.toXMLString()); }
        },

        // not relying on non-local state

        _handle1: function(object, watches, matcher) {
            for each(var watch in watches)
                try {
                    if(matcher(object, watch.pattern))
                        watch.handler(object);
                } catch(e) {
                    Cu.reportError(e);
                }
        }
    };

    // PROVIDE TOPIC!
    service.addObserver(channel, null, null);

    if(features)
        for each(var feature in features.ns_disco_info::feature) 
            service.addFeature(feature.toXMLString());
        
    return channel;
}

function open(jid, opts, continuation) {
    var connectionHost = opts.host || JID(jid).hostname;
    var connectionPort = opts.port || 5223;
    var ssl = (opts.ssl == undefined ? true : opts.ssl);

    var streamReplyObserver = {
        observe: function(subject, topic, data) {
            continuation();
        }
    };

    var transport = Cc['@hyperstruct.net/xmpp4moz/xmpptransport;1?type=tcp']
        .createInstance(Ci.nsIXMPPTransport);
    transport.init(connectionHost, connectionPort, ssl);

    service.open(jid, transport, streamReplyObserver);
}

function close(jid) {
    service.close(jid);
}


// UTILITIES
// ----------------------------------------------------------------------

/**
 * Pattern matcher as used in channel.on().
 *
 */

function match(object, template) {
    var pattern, value;
    for(var member in template) {
        value = object[member];
        pattern = template[member];
        
        if(pattern === undefined)
            ;
        else if(pattern && typeof(pattern) == 'function') {
            if(!pattern(value))
                return false;
        }
        else if(pattern && typeof(pattern.test) == 'function') {
            if(!pattern.test(value))
                return false;
        }
        else if(pattern && pattern.id) {
            if(pattern.id != value.id)
                return false;
        }
        else if(pattern != value)
            return false;
    } 

    return true;
}

/**
 * Add convenience methods to an event object.  Fill in direction if
 * necessary (and possible).
 *
 */

function wrapEvent(eventObject) {
    eventObject.__defineGetter__(
        'account', function() {
            return this.session.name;
        });

    if(!eventObject.event)
        eventObject.__defineGetter__(
            'event', function() {
                if(this.stanza)
                    return this.stanza.localName();
            });

    if(!eventObject.direction)
        eventObject.__defineGetter__(
            'direction', function() {
                if(this.stanza && stanza.localName() == 'presence')
                    return (this.stanza.@from == undefined ?
                            'out' : 'in')
            });

    return eventObject;
}

/**
 * Convert a DOM element to an E4X XML object.
 *
 * Assign converted object to DOM element behind the scenes, so that
 * if it requested to be converted again, there is no need to go
 * through serialization/deserialization again.
 *
 * (This assumes that the element is immutable.)
 *
 */

function dom2xml(element) {
    if(!element.__dom2xml_memo)
        element.__dom2xml_memo = new XML(serializer.serializeToString(element));
    
    return element.__dom2xml_memo;
}

function uniq(array) {
    var encountered = [];

    return array.filter(
        function(item) {
            if(encountered.indexOf(item) == -1) {
                encountered.push(item);
                return true;
            }
        });
}

function extractSubRoster(roster, jid) {
    var subRoster = <iq type="result"><query xmlns="jabber:iq:roster"></query></iq>;
    subRoster.@to = roster.@to;
    subRoster.@from = roster.@from;
    subRoster.ns_roster::query.item = roster..ns_roster::item.(@jid == jid);
    return subRoster;
}

function presenceSummary(account, address) {
    function presenceDegree(stanza) {
        if(stanza.@type == undefined && stanza.show == undefined)
            return 4;
        else if(stanza.@type == 'unavailable')
            return 0;
        else
            switch(stanza.show.toString()) {
            case 'chat': return 5; break;
            case 'dnd':  return 3; break;
            case 'away': return 2; break;
            case 'xa':   return 1; break;
            default:
                throw new Error('Unexpected. (' + stanza.toXMLString() + ')');
            }
    }

    var presences;
    if(account && address)
        presences = cache.fetch({
            event     : 'presence',
            direction : 'in',
            session   : { name: account },
            stanza    : function(s) { return JID(s.@from).address == address; }
            });
    else 
        presences = cache.fetch({
            event     : 'presence',
            direction : 'out',
            stanza    : function(s) { return s.ns_muc::x == undefined && s.@to == undefined; }
            });

    presences.sort(
        function(a, b) {
            return presenceDegree(b.stanza) - presenceDegree(a.stanza);
        });

    return presences[0] || { stanza: <presence type="unavailable"/> };
}


// HYBRID-APP SUPPORT
// ----------------------------------------------------------------------

function enableContentDocument(panel, account, address, type, createSocket) {
    if(panel.hasAttribute('account') &&
       panel.getAttribute('account') != account)
        throw new Error('Content panel already attached to different account. (' + account + ')');

    if(panel.hasAttribute('address') &&
       panel.getAttribute('address') != address)
        throw new Error('Contact panel already attached to different address. (' + address + ')');

    if(panel.xmppChannel)
        return;

    var appDoc = panel.contentDocument;
    if(createSocket) 
        for each(var socketPartId in ['xmpp-incoming', 'xmpp-outgoing'])
            if(!appDoc.getElementById(socketPartId)) {
                var socketPart = appDoc.createElement('div');
                socketPart.setAttribute('style', 'display: none;');
                socketPart.setAttribute('id', socketPartId);
                appDoc.documentElement.appendChild(socketPart);
            }
    
    if(!(appDoc.getElementById('xmpp-incoming') &&
         appDoc.getElementById('xmpp-outgoing')))
        return;

    function gotDataFromPage(text) {
        XML.prettyPrinting = false;
        XML.ignoreWhitespace = false;
        var stanza = new XML(text);

        // Fill in defaults and enforce security policy.  Rules are:
        //
        // - If stanza contains no "type" attribute, use the one
        //   provided at connection time (this allows some apps to
        //   work both 1-1 and in muc with minimal fuss).
        //
        // - If app is remote, remove "from" attribute (if provided).
        //
        // - If app is remote and "to" looks like "/Resource", set
        //   address part of "to" attribute to address provided at
        //   connection time plus "/Resource", otherwise just replace
        //   it with the address provided at connection. (In other
        //   words, hybrid app can at most decide what resource of the
        //   connected contact to send a stanza to.)
        //
        // - If app is local and "to" is set, don't touch it,
        //   otherwise fill it in as for remote apps.

        if(stanza.@type == undefined)
            stanza.@type = type;

        if(/^(file|chrome):\/\//.test(panel.currentURI.spec)) {
            if(/^\/.+$/.test(stanza.@to.toString()))
                stanza.@to = address + stanza.@to;
            else if(stanza.@to == undefined)
                stanza.@to = address;

            if(stanza.localName() == 'iq') {
                // iq's are traced for unrestricted applications, so that
                // they can find their way back to the application.
                    
                // Allow XMPP bus to take care of id, but remember of
                // the one set by the application, so that it can be
                // set on the response.

                var requestId = stanza.@id.toString();
                delete stanza.@id;
                
                send(account, stanza, function(reply) {
                         var s = reply.stanza.copy();

                         if(requestid)
                             s.@id = requestid;
                         else
                             delete s.@id;

                         gotDataFromXMPP(s);
                     });
            } else
                send(account, stanza);
        } else {
            delete stanza.@from;
            if(/^\/.+$/.test(stanza.@to.toString()))
                stanza.@to = address + stanza.@to;
            else
                stanza.@to = address;

            send(account, stanza);
        }
    }

    function gotDataFromXMPP(stanza) {
        appDoc.getElementById('xmpp-incoming').textContent =
            stanza.toXMLString();
    }

    // Assign the panel to the {account, address} pair.

    panel.setAttribute('account', account);
    panel.setAttribute('address', address);
    panel.contentWindow.addEventListener(
        'unload', function(event) {
            if(event.target == panel.contentDocument) 
                disableContentDocument(panel);
        }, true);

    // The contact sub-roster is a roster where the only entry is the
    // contact we are connecting to (if in roster, otherwise it's
    // empty).

    var roster = cache.find({
        event     : 'iq',
        direction : 'in',
        account   : account,
        stanza    : function(s) { return s.ns_roster::query != undefined; }});
    var contactSubRoster = extractSubRoster(roster.stanza, address);

    // Latest presence seen from contact.

    var contactPresence = cache.find({
        event     : 'presence',
        direction : 'in',
        session   : function(s) { return s.name == account; },
        stanza    : function(s) { return JID(s.@from).address == address; }});

    // MUC presence is the presence stanza we used to join the room
    // (if we are joining a room).

    var mucPresences;
    if(type == 'groupchat') {
        var mucPresencesOut = 
            cache.fetch({
                event     : 'presence',
                direction : 'out',
                session   : function(s) { return s.name == account; },
                stanza    : function(s) { return s.@to != undefined && JID(s.@to).address == address; }});
        var mucPresencesIn = 
            cache.fetch({
                event     : 'presence',
                direction : 'in',
                session   : function(s) { return s.name == account; },
                stanza    : function(s) { return JID(s.@from).address == address; }});
        mucPresences = mucPresencesIn.concat(mucPresencesOut);
    }

    // Wire data coming from application to XMPP

    appDoc.getElementById('xmpp-outgoing').addEventListener(
        'DOMNodeInserted', function(event) {
            gotDataFromPage(event.target.textContent);
        }, false);

    // Select subset of XMPP traffic to listen to
    
    var channel = createChannel();
    panel.xmppChannel = channel;

    channel.on({
        event     : 'message',
        direction : 'in',
        session   : function(s) { return s.name == account; },
        stanza    : function(s) { return (JID(s.@from).address == address); }
        }, function(message) { gotDataFromXMPP(message.stanza); });
    
    channel.on({
        event     : 'presence',
        direction : 'in',
        session   : function(s) { return s.name == account; },
        stanza    : function(s) { return JID(s.@from).address == address; }
        }, function(presence) { gotDataFromXMPP(presence.stanza); });

    if(type != 'groupchat')
        channel.on({
            direction : 'out',
            event     : 'message',
            session   : function(s) { return s.name == account; },
            stanza    : function(s) { return JID(s.@to).address == address; }
            }, function(message) { gotDataFromXMPP(message.stanza); });

    gotDataFromXMPP(contactSubRoster);

    if(contactPresence)
        gotDataFromXMPP(contactPresence.stanza);
    else
        gotDataFromXMPP(<presence from={address} type="unavailable"/>)
    if(mucPresences)
        mucPresences.forEach(
            function(mucPresence) { gotDataFromXMPP(mucPresence.stanza); });
}

function disableContentDocument(panel) {
    panel.removeAttribute('address');
    panel.removeAttribute('account');
    panel.xmppChannel.release();
    delete panel.xmppChannel;
}


// INTERNALS
// ----------------------------------------------------------------------

function _promptAccount(jid) {        
    var params = {
        confirm: false,
        jid: jid,
        password: undefined
    };
    window.openDialog(
        'chrome://xmpp4moz/content/ui/signon.xul',
        'xmpp-signon', 'modal,centerscreen',
        params);
    return params;
}

function _up(account, continuation) {
    var jid, password, host, port, ssl;
    if(account) {
        jid = account.jid;
        password = account.password;
        host = account.connectionHost;
        port = account.connectionPort;
        ssl = (account.connectionSecurity == undefined ||
               account.connectionSecurity == 1);
    }

    if(!((jid && password) || (jid && this.isUp(jid)))) {
        var userInput = this._promptAccount(jid);

        if(userInput.confirm) {
            password = userInput.password;
            jid = userInput.jid;
        }
    }

    if(this.isUp(jid) && continuation)
        continuation(jid);
    else if(jid && password) {
        var XMPP = this;

        open(jid, {host: host, port: port, ssl: ssl},
             function() {
                 send(
                     jid,
                     <iq to={JID(jid).hostname} type="set">
                     <query xmlns="jabber:iq:auth">
                     <username>{JID(jid).username}</username>
                     <password>{password}</password>
                     <resource>{JID(jid).resource}</resource>
                     </query></iq>,
                     function(reply) {
                         if(reply.stanza.@type == 'result') {
                             send(jid,
                                  <iq type="get">
                                  <query xmlns="jabber:iq:roster"/>
                                  </iq>, function() {
                                      send(jid, <presence/>);
                                      if(continuation)
                                          continuation(jid);
                                  })
                         }
                     });
             });        
    }
}

function _send(jid, stanza, handler) {
    var replyObserver;
    if(handler)
        replyObserver = {
            observe: function(replyStanza, topic, sessionName) {
                handler({
                    session: { name: sessionName }, // XXX hack
                    stanza: dom2xml(replyStanza)
                    });
            }
        };

    var settings = XML.settings();
    XML.prettyPrinting = false;
    XML.ignoreWhitespace = false;
    service.send(
        jid,
        typeof(stanza) == 'xml' ? stanza.toXMLString() : stanza.toString(),
        replyObserver);
    XML.setSettings(settings);
}

function AccountWrapper(key) {
    this.key = key;
}

AccountWrapper.prototype = {
    _read: function(preference) {
        var prefReaders = ['getCharPref', 'getIntPref', 'getBoolPref'];
        for each(var reader in prefReaders) {
            try {
                return pref[reader]('account.' + this.key + '.' + preference);
            } catch(e) {}
        }
    },

    get jid() {
        return this.address + '/' + this.resource;
    }
};

['address', 'password', 'resource',
 'autoLogin', 'connectionHost', 'connectionPort', 'connectionSecurity'
    ].forEach(function(property) {
                  AccountWrapper.prototype.__defineGetter__(
                      property, function() {
                          return this._read(property);
                      });
              });

this.__defineGetter__(
    'accounts', function() {
        var keys = uniq(
            pref
            .getChildList('account.', {})
            .map(
                function(item) {
                    try {
                        return item.split('.')[1];
                    } catch(e) {
                        // Cases where item.split() would result in
                        // an error and prevent accounts from being
                        // read were reported.  No additional
                        // information is available, though, so we
                        // just catch the exception and report the
                        // error to the console.
                        Cu.reportError(e);
                    }})
            .filter(
                function(key) {
                    return key != undefined;
                }));

        return keys.map(
            function(key) {
                return new AccountWrapper(key);
            });
    });

function getAccountByJid(jid) {
    var result;
    accounts.forEach(
        function(account) {
            if(result)
                return;
            if(account.jid == jid)
                result = account;
        });
    return result;
}

function getAccountByKey(key) {
    var result;
    accounts.forEach(
        function(account) {
            if(result)
                return;
            if(account.key == key)
                result = account;
        });
    return result;
}


// DEVELOPER UTILITIES
// ----------------------------------------------------------------------

function deprecation(msg) {
    var frame = Components.stack.caller;
    
    dump('xmpp4moz :: DEPRECATION NOTICE :: "' + msg + '" in: \n');
    while(frame) {
        dump('  ' + frame + '\n');
        frame = frame.caller
    }
}

function getStackTrace() {
    var frame = Components.stack.caller;
    var str = "<top>";

    while (frame) {
        str += '\n' + frame;
        frame = frame.caller;
    }

    return str;
}

function log(msg) {
    Cc[ "@mozilla.org/consoleservice;1" ]
        .getService(Ci.nsIConsoleService)
        .logStringMessage(msg);
}
