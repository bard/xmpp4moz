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

    // Accesses cache via XPCOM, as usual.
    
    _cleanRead: function(cacheName) {
        var enumeration = service[cacheName + 'Cache']();
        var objects = [];
        var cachedObject, outputObject;
        
        while(enumeration.hasMoreElements()) {
            cachedObject = enumeration.getNext().QueryInterface(Ci.nsIProperties);

            outputObject = {
                session: cachedObject.get('session', Ci.nsIXMPPClientSession),
                stanza: new XML(serializer.serializeToString(
                                    cachedObject.get('stanza', Ci.nsIDOMElement))),
                direction: (cachedObject.has('direction') ?
                            cachedObject.get('direction', Ci.nsISupportsString).toString() :
                            undefined)
            };

            objects.push(outputObject);
        }
        return objects;
    },

    // Accesses cache via wrappedJSObject, bypassing XPCOM. Will only
    // work as long as nsIXMPPClientService is implemented in
    // Javascript, revert to _cleanRead if/when it is implemented in
    // C++.

    _directRead: function(cacheName) {
        var internalCache = service.wrappedJSObject.cache[cacheName].copy();
        return internalCache.map(
            function(internalObject) {
                var object = {
                    stanza: new XML(serializer.serializeToString(internalObject.stanza)),
                    session: internalObject.session,
                    direction: internalObject.direction 
                };
                if(!object.direction) {
                    if(object.stanza.@from == undefined)
                        object.direction = 'out';
                    else
                        object.direction = 'in';
                }
                return object;
            });
    },
    
    get roster() {
        return this._directRead('roster');
    },

    get presenceIn() {
        return this._directRead('presenceIn');
    },

    get presenceOut() {
        return this._directRead('presenceOut');
    },

    get presence() {
        var _this = this;
        function presenceCache(direction) {
            return direction == 'in' ? _this.presenceIn : _this.presenceOut;
        }
        
        var wrapper = {
            find: function(pattern) {
                for each(var presence in presenceCache(pattern.direction)) {
                    if(match(presence, pattern))
                        return presence;
                }
            },            

            filter: function(pattern) {
                return presenceCache(pattern.direction).filter(
                    function(presence) {
                        return match(presence, pattern);
                    });
            },

            forEach: function(action) {
                presenceCache(pattern.direction).forEach(
                    function(presence) {
                        action(presence);
                    });
            }
        };
        return wrapper;
    }
};

function nickFor(account, address) {
    var roster;
    for each(var r in cache.roster) 
        if(r.session.name == account) {
            roster = r;
            break;
        }

    var name;
    if(roster) {
        var item = roster.stanza..ns_roster::item
            .(@jid == address);
        name = item.@name.toString();
    }

    return name || JID(address).username || address;
}

function JID(string) {
    if(string in arguments.callee.memo)
        return arguments.callee.memo[string];
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

    arguments.callee.memo[string] = jid;
    return jid;    
}
JID.memo = {};

function up(account, opts) {
    opts = opts || {};

    if(typeof(account) == 'object') {
        if(account.jid)
            this._up(account.jid, opts);
        else {
            var userContinuation = opts.continuation;                
            opts.continuation = function(jid) {
                account.jid = jid;
                if(userContinuation)
                    userContinuation(jid);
            }

            this._up(null, opts);
        }
    } else
        this._up(account, opts);
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
        this.up(account, {continuation: function(jid) {
                        _this._send(jid, stanza, handler);
                    }});
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
            
            var pattern = {
                event: match[1],
                direction: match[2],
                account: data.toString(),
                session: _this.service.getSession(data.toString()) || { name: data.toString() }
            }

            switch(pattern.event) {
                case 'transport':
                subject.QueryInterface(Ci.nsISupportsString).toString();
                pattern.state = subject.toString();
                break;
                case 'stream':
                subject.QueryInterface(Ci.nsISupportsString).toString();
                pattern.state = subject.toString();
                break;
                case 'data':
                subject.QueryInterface(Ci.nsISupportsString).toString();
                pattern.content = subject.toString();
                break;
                case 'stanza':
                subject.QueryInterface(Ci.nsIDOMElement);
                var stanza = new XML(serializer.serializeToString(subject));
                pattern.event = stanza.name();
                pattern.stanza = stanza;
                break;
            }
            this.receive(pattern)
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
        presences = cache.presence.filter({
            direction: 'in',
            session: function(s) {
                    return s.name == account;
                },
            stanza: function(s) {
                    return JID(s.@from).address == address;
                }});
    else 
        presences = cache.presence.filter({
            direction: 'out',
            stanza: function(s) {
                    return s.ns_muc::x == undefined;
                }});

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
        var settings = XML.settings();
        XML.prettyPrinting = false;
        XML.ignoreWhitespace = false;
        var message = new XML(text);

        delete message.@from;
        message.@to = /^\/.+$/.test(message.@to.toString()) ?
            address + message.@to : address;
        if(message.@type == undefined)
            message.@type = type;
        send(account, message);

        XML.setSettings(settings);
    }

    function gotDataFromXMPP(stanza) {
        appDoc.getElementById('xmpp-incoming').textContent =
            stanza.toXMLString();
    }

    // Assign the panel to the {account, address} pair.

    panel.setAttribute('account', account);
    panel.setAttribute('address', address);
    panel.addEventListener(
        'unload', function(event) {
            if(event.target == panel.contentDocument) 
                disableContentDocument(panel);
        }, true);

    // The contact sub-roster is a roster where the only entry is the
    // contact we are connecting to.

    var contactSubRoster;
    for each(var roster in cache.roster)
        if(roster.session.name == account)
            contactSubRoster = extractSubRoster(roster.stanza, address);

    // Latest presence seen from contact.

    var contactPresence = cache.presence.find({
        direction: 'in',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return JID(s.@from).address == address;
            }});

    // MUC presence is the presence stanza we used to join the room
    // (if we are joining a room).

    var mucPresences;
    if(type == 'groupchat') {
        var mucPresencesOut = 
            cache.presence.filter({
                direction: 'out',
                session: function(s) {
                        return s.name == account;
                    },
                stanza: function(s) {
                        return s.@to != undefined && JID(s.@to).address == address;
                    }});
        var mucPresencesIn = 
            cache.presence.filter({
                direction: 'in',
                session: function(s) {
                        return s.name == account;
                    },
                stanza: function(s) {
                        return JID(s.@from).address == address;
                    }});
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
        direction: 'in',
        event: 'message',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return (JID(s.@from).address == address);
            }
        }, function(message) { gotDataFromXMPP(message.stanza); });
    
    channel.on({
        event: 'presence',
        direction: 'in',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return JID(s.@from).address == address;
            }
        }, function(presence) { gotDataFromXMPP(presence.stanza); });

    if(type != 'groupchat')
        channel.on({
            direction: 'out',
            event: 'message',
            session: function(s) {
                    return s.name == account;
                },
            stanza: function(s) {
                    return JID(s.@to).address == address;
                }
            },
            function(message) {
                gotDataFromXMPP(message.stanza);
            });

    gotDataFromXMPP(contactSubRoster);

    if(contactPresence.stanza)
        gotDataFromXMPP(contactPresence.stanza);
    if(mucPresences)
        mucPresences.forEach(
            function(mucPresence) {
                gotDataFromXMPP(mucPresence.stanza);
            });
}

function disableContentDocument(panel) {
    panel.removeAttribute('address');
    panel.removeAttribute('account');
    panel.xmppChannel.release();
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

function _up(jid, opts) {
    opts = opts || {};

    var password, continuation;
    continuation = opts.continuation;
    if(jid) {
        var account = this.getAccountByJid(jid);
        password = opts.password || account.password;
        opts.host = opts.host || account.connectionHost;
        opts.port = opts.port || account.connectionPort;
        if(opts.ssl == undefined)
            opts.ssl = (account.connectionSecurity == 1);
    } else 
        password = opts.password;

    delete opts.password;
    delete opts.continuation;

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

        open(jid, opts,
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
                    stanza: new XML(serializer.serializeToString(replyStanza))
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
    for each(var account in this.accounts) {
        if(account.jid == jid)
            return account;
    }
    return null;
}

function getAccountByKey(key) {
    for each(var account in this.accounts) {
        if(account.key == key)
            return account;
    }   
    return null;    
}


// DEVELOPER UTILITIES
// ----------------------------------------------------------------------

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
