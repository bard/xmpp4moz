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

const service = Components
    .classes['@hyperstruct.net/xmpp4moz/xmppservice;1']
    .getService(Components.interfaces.nsIXMPPClientService)
    .wrappedJSObject;
    
const pref = Components
    .classes['@mozilla.org/preferences-service;1']
    .getService(Components.interfaces.nsIPrefService)
    .getBranch('xmpp.');


// DEVELOPER INTERFACE
// ----------------------------------------------------------------------

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

function down(jid) {
    service.close(jid);
}

function isUp(account) {
    return service.isUp(
        typeof(account) == 'object' ? account.jid : account);
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
            switch(topic) {
                case 'stream-in':
                case 'stream-out':
                this.handle({
                    event: 'stream',
                    session: subject,
                    direction: topic == 'stream-in' ? 'in' : 'out',
                    state: data
                    });
                break;
                case 'data-in':
                case 'data-out':
                this.handle({
                    event: 'data',
                    session: subject,
                    direction: topic == 'data-in' ? 'in' : 'out',
                    content: data
                    });
                break;
                case 'stanza-in':
                case 'stanza-out':
                var stanza = new XML(data);
                this.handle({
                    event: stanza.name(),
                    session: subject,
                    direction: topic == 'stanza-in' ? 'in' : 'out',
                    stanza: stanza
                    });
            }
        },

        release: function() {
            XMPP.service.removeObserver(this);
        },

        // not relying on non-local state

        _handle1: function(object, watches, matcher) {
            for each(var watch in watches) {
                if(matcher(object, watch.pattern))
                    watch.handler(object);
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

    service.addObserver(channel);
        
    return channel;
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
    var connectionHost = opts.host || this.getAccountByJid(jid).connectionHost;
    var connectionPort = opts.port || this.getAccountByJid(jid).connectionPort;
    var ssl = opts.ssl || (this.getAccountByJid(jid).connectionSecurity == 1);
    var password = opts.password || this.getAccountByJid(jid).password;
    var continuation = opts.continuation;
    var requester = opts.requester;

    if(!((jid && password) ||
         (jid && this.isUp(jid)))) {

        var userInput = this._promptAccount(jid, requester);

        if(userInput.confirm) {
            password = userInput.password;
            jid = userInput.jid;
        }
    }

    if(this.isUp(jid) && continuation)
        continuation(jid);
    else if(jid && password) {
        var xmpp = service;
        xmpp.open(jid, connectionHost, connectionPort, ssl);
        var m = jid.match(/^([^@]+)@([^\/]+)\/(.+)$/);
        var username = m[1];
        var server   = m[2];
        var resource = m[3];
        this.send(
            jid,
            <iq to={server} type="set"><query xmlns="jabber:iq:auth">
            <username>{username}</username>
            <password>{password}</password>
            <resource>{resource}</resource>
            </query></iq>,
            function(reply) {
                if(reply.stanza.@type == 'result') {
                    xmpp.send(jid, <iq type="get"><query xmlns="jabber:iq:roster"/></iq>);
                    xmpp.send(jid, <presence/>);
                    if(continuation)
                        continuation();
                }
            });
    }
}

function _send(jid, stanza, handler) {
    service.send(
        jid, typeof(stanza) == 'xml' ? stanza.toXMLString() : stanza.toString(),
        { observe: function(jid, topic, reply) {
                handler(reply);
            }});
}

this.__defineGetter__(
    'accounts', function() {
        var accountTable = {};
        for each(var accountInfo in
                 pref.getChildList('account.', {})) {
            var infoParts    = accountInfo.split('.');
            var accountIndex = infoParts[1];
            var propertyName = infoParts[2];
            if(!accountTable[accountIndex])
                accountTable[accountIndex] = {};

            var prefReaders = ['getCharPref', 'getIntPref', 'getBoolPref'];
            var propertyValue;
            for each(var reader in prefReaders) 
                try {
                    propertyValue = pref[reader](accountInfo);
                    break;
                } catch(e) {}

            accountTable[accountIndex][propertyName] = propertyValue;
        }
        
        var accountList = [];
        for(var accountIndex in accountTable) {
            var account = accountTable[accountIndex];
            account.index = accountIndex;
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

function getAccountByKey(index) {
    // XXX inefficient
    for each(var account in this.accounts) {
        if(account.index == index)
            return account;
        
        return null;
    }
}