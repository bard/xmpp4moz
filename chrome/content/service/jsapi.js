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


// DEVELOPER INTERFACE
// ----------------------------------------------------------------------

var cache = {
    _enumToArray: function(enumeration) {
        var objects = [];
        while(enumeration.hasMoreElements()) {
            var cachedObject = enumeration
                .getNext()
                .QueryInterface(Ci.nsIDictionary);

            var object = {
                session: cachedObject.getValue('session').QueryInterface(Ci.nsIXMPPClientSession),
                stanza: new XML(serializer.serializeToString(cachedObject.getValue('stanza')))
            };

            if(cachedObject.hasKey('direction'))
                object.direction = cachedObject
                    .getValue('direction')
                    .QueryInterface(Ci.nsISupportsString).toString();

            objects.push(object);
        }
        return objects;
    },

    get roster() {
        return this._enumToArray(service.rosterCache());
    },

    get presenceIn() {
        return this._enumToArray(service.presenceInCache());
    },

    get presenceOut() {
        return this._enumToArray(service.presenceOutCache());
    }
};

function nickFor(account, address) {
    const ns_roster = new Namespace('jabber:iq:roster');

    var roster;
    for each(var r in XMPP.cache.roster) 
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

    return name || XMPP.JID(address).username || address;
}

function JID(string) {
    var m = string.match(/^(.+@)?(.+?)(?:\/|$)(.*$)/);

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

    return jid;    
}

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

function createChannel(baseFilter) {
    var channel = {
        _watchers: [],

        // unused -- will be used for things like binding a
        // channel to a specific session, even after the event
        // handlers have already been defined
            
        _baseFilter: baseFilter,

        // unused
            
        set baseFilter(val) {
            this._baseFilter = val;
        },

        // unused

        get baseFilter() {
            return this._baseFilter;
        },

        // temporarily stop the channel from forwardin events to
        // the handlers

        pause: function() {
            // stub
        },

        restart: function() {
            // stub
        },            

        on: function(pattern, handler) {
            this._watchers.push({pattern: pattern, handler: handler});
        },

        handle: function(event) {
            this._handle1(event, this._watchers, this._match1);
        },

        observe: function(subject, topic, data) {
            var match = topic.match(/^(stream|data|stanza)-(in|out)$/);
            
            var pattern = {
                event: match[1],
                direction: match[2],
                session: { name: data.toString() } // XXX hack - should get real session rather that something that looks like it
            }

            switch(pattern.event) {
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
            this.handle(pattern)
        },

        release: function() {
            XMPP.service.removeObserver(this, null, null);
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
        },

        // not relying on non-local state

        _match1: function(object, template) {
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
        },

        // not relying on non-local state

        _union: function(x, y) {
            var u = {};
            for(var name in x)
                u[name] = x[name];
            for(var name in y)
                u[name] = y[name];
            return u;    
        }
    }

    // PROVIDE TOPIC!
    service.addObserver(channel, null, null);
        
    return channel;
}

function register(jid, password, opts) {
    service.open(
        jid,
        opts.host || JID(jid).hostname,
        opts.port || 5223,
        opts.ssl == undefined ? true : opts.ssl);
    
    this.send(
        jid,
        <iq to={JID(jid).hostname} type="set">
        <query xmlns="jabber:iq:register">
        <username>{JID(jid).username}</username>
        <password>{password}</password>
        </query>
        </iq>,
        function(reply) {
            if(reply.stanza.@type == 'result') {
                opts.success();
            } else {
                opts.failure();
            }
            service.close(jid);
        });
}


// UTILITIES
// ----------------------------------------------------------------------

function presenceSummary(account, address) {
    var presences;
    if(account && address) 
        presences = XMPP.cache.presenceIn.filter(
            function(presence) {
                return (presence.session.name == account &&
                        XMPP.JID(presence.stanza.@from).address == address);
            });
    else 
        presences = XMPP.cache.presenceOut;

    function find(array, criteria) {
        for each(var item in array)
            if(criteria(item))
                return item;
    }

    var summary;
    for each(var show in [undefined, 'chat', 'away', 'xa', 'dnd']) {
        summary = find(presences, function(presence) {
                           return presence.stanza.show == show;
                       });
        if(summary)
            break;
    }

    if(summary) {
        if(summary.stanza.show == 'chat')
            delete summary.stanza.show;
        else if(summary.stanza.show == 'xa')
            summary.stanza.show = 'away';
        return summary;
    } else 
        return { stanza: <presence type="unavailable"/> };
}


// HYBRID-APP SUPPORT
// ----------------------------------------------------------------------

function enableContentDocument(panel, account, address, type) {
    if(panel.hasAttribute('address') &&
       panel.hasAttribute('account'))
        return;

    var appDoc = panel.contentDocument;
    if(!(appDoc.getElementById('input') &&
         appDoc.getElementById('output')))
        return;
    
    // BOOKKEEPING

    panel.setAttribute('account', account);
    panel.setAttribute('address', address);

    panel.addEventListener(
        'unload', function(event) {
            if(event.currentTarget != panel)
               return;

            channel.release();
            panel.removeAttribute('account');
            panel.removeAttribute('address');
        }, true);

    // CONTENT

    function gotDataFromPage(text) {
        var message = new XML(text);
        message.@to = /^\/.+$/.test(message.@to.toString()) ?
            address + message.@to : address;
        if(message.@type == undefined)
            message.@type = type;
        XMPP.send(account, message)        
    }

    appDoc.getElementById('output').addEventListener(
        'DOMNodeInserted', function(event) {
            gotDataFromPage(event.target.textContent);
        }, false);

    // NETWORK

    var channel = XMPP.createChannel();
    contentPanel.xmppChannel = channel;

    function gotDataFromXMPP(data) {
        appDoc.getElementById('input').textContent =
            data.stanza.toXMLString();
    }

    channel.on({
        direction: 'in',
        event: 'message',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return (XMPP.JID(s.@from).address == address);
            }
        }, function(message) { gotDataFromXMPP(message); });
    
    channel.on({
        event: 'presence',
        direction: 'in',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return XMPP.JID(s.@from).address == address;
            }
        }, function(presence) { gotDataFromXMPP(presence); });

    if(type != 'groupchat')
        channel.on({
            direction: 'out',
            event: 'message',
            session: function(s) {
                    return s.name == account;
                },
            stanza: function(s) {
                    return XMPP.JID(s.@to).address == address;
                }
            }, function(message) { gotDataFromXMPP(message); });

    for each(var presence in XMPP.cache.presenceIn)
        if(presence.session.name == account &&
           XMPP.JID(presence.stanza.@from).address == address)
            gotDataFromXMPP(presence);    
}

function disableContentDocument(panel) {
    panel.removeAttribute('address');
    panel.removeAttribute('account');
    panel.xmppChannel.release();
}


// INTERNALS
// ----------------------------------------------------------------------

function _promptAccount(jid, requester) {        
    var params = {
        requester: requester,
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

    var password, connectionHost, connectionPort, ssl, continuation, requester;
    if(jid) {
        
        var account = this.getAccountByJid(jid);
        password = opts.password || account.password;
        connectionHost = opts.host || account.connectionHost;
        connectionPort = opts.port || account.connectionPort;
        if(opts.ssl == undefined)
            ssl = (account.connectionSecurity == 1);
        else
            ssl = opts.ssl;
    } else {
        password = opts.password;
        connectionHost = opts.host;
        connectionPort = opts.port;
        ssl = opts.ssl;
    }
    
    var continuation = opts.continuation;
    var requester = opts.requester;

    if(!((jid && password) || (jid && this.isUp(jid)))) {
        var userInput = this._promptAccount(jid, requester);

        if(userInput.confirm) {
            password = userInput.password;
            jid = userInput.jid;
        }
    }

    if(this.isUp(jid) && continuation)
        continuation(jid);
    else if(jid && password) {
        var XMPP = this;

        var streamReplyObserver = {
            observe: function(subject, topic, data) {
                XMPP.send(
                    jid,
                    <iq to={JID(jid).hostname} type="set">
                    <query xmlns="jabber:iq:auth">
                    <username>{JID(jid).username}</username>
                    <password>{password}</password>
                    <resource>{JID(jid).resource}</resource>
                    </query></iq>,
                    function(reply) {
                        if(reply.stanza.@type == 'result') {
                            XMPP.send(jid,
                                      <iq type="get">
                                      <query xmlns="jabber:iq:roster"/>
                                      </iq>);
                            XMPP.send(jid, <presence/>);
                            if(continuation)
                                continuation(jid);
                        }
                    });                
            }
        };

        service.open(jid, connectionHost, connectionPort, ssl, streamReplyObserver);
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
    
    service.send(
        jid,
        typeof(stanza) == 'xml' ? stanza.toXMLString() : stanza.toString(),
        replyObserver);
}

this.__defineGetter__(
    'accounts', function() {
        var accountTable = {};
        for each(var accountInfo in
                 pref.getChildList('account.', {})) {
            var infoParts    = accountInfo.split('.');
            var accountKey = infoParts[1];
            var propertyName = infoParts[2];
            if(!accountTable[accountKey])
                accountTable[accountKey] = {};

            var prefReaders = ['getCharPref', 'getIntPref', 'getBoolPref'];
            var propertyValue;
            for each(var reader in prefReaders) 
                try {
                    propertyValue = pref[reader](accountInfo);
                    break;
                } catch(e) {}

            accountTable[accountKey][propertyName] = propertyValue;
        }
        
        var accountList = [];
        for(var accountKey in accountTable) {
            var account = accountTable[accountKey];
            account.key = accountKey;
            account.__defineGetter__(
                'jid', function() {
                    return this.address + '/' + this.resource;
                });
            accountList.push(account);
        }
        
        return accountList;
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
