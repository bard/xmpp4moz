/**
 * This is a convenience stateless wrapper to the bare XPCOM service,
 * to allow using it more comfortably from javascript.
 *
 * Example of creating a channel that filters incoming events,
 * bringing a session up, and sending a message.
 *
 *     var channel = XMPP.createChannel();
 *     channel.on(
 *         {event: 'message', direction: 'in'},
 *         function(message) { alert(message.stanza); } );
 *     
 *     XMPP.up(
 *         'user@server.org/Resource',
 *         {password: 'secret'});
 *     
 *     XMPP.send(
 *         'user@server.org/Resource',
 *         <message to="contact@server.org">
 *         <body>hello</body>
 *         </message>);
 *     
 */

var XMPP = {
    _xmpp: Components
    .classes['@hyperstruct.net/xmpp4moz/xmppservice;1']
    .getService(Components.interfaces.nsIXMPPClientService)
    .wrappedJSObject,

    _serializer: Components
    .classes['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Components.interfaces.nsIDOMSerializer),

    _pref: Components
    .classes['@mozilla.org/preferences-service;1']
    .getService(Components.interfaces.nsIPrefService)
    .getBranch('xmpp.'),

    _prompter: Components
    .classes["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Components.interfaces.nsIPromptService),

    get accounts() {
        var accountTable = {};
        for each(var accountInfo in
                 this._pref.getChildList('account.', {})) {
            var infoParts    = accountInfo.split('.');
            var accountIndex = infoParts[1];
            var propertyName = infoParts[2];
            if(!accountTable[accountIndex])
                accountTable[accountIndex] = {};

            var prefReaders = ['getCharPref', 'getIntPref', 'getBoolPref'];
            var propertyValue;
            for each(var reader in prefReaders) 
                try {
                    propertyValue = this._pref[reader](accountInfo);
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
    },

    getAccountByJid: function(jid) {
        for each(var account in this.accounts) {
            if(account.jid == jid)
                return account;
        }
        return null;
    },

    // TODO: unefficient
    getAccountByKey: function(index) {
        for each(var account in this.accounts) { 
            if(account.index == index)
                return account;
        }
        return null;
    },

    isUp: function(account) {
        var jid = typeof(account) == 'object' ? account.jid : account;
        
        var session = this._xmpp.getSession(jid);
        if(session && session.isOpen())
            return true;
    },

    _promptAccount: function(jid, requester) {        
        var params = {
            requester: requester,
            confirm: false,
            jid: jid,
            password: undefined
        };
        window.openDialog(
            'chrome://xmpp4moz/content/signon.xul',
            'xmpp-signon', 'modal,centerscreen',
            params);
        return params;
    },

    up: function(account, opts) {
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
    },

    _up: function(jid, opts) {
        opts = opts || {};
        var password = opts.password;
        var server = opts.host || this.getAccountByJid(jid).connectionHost;
        var port = opts.port || this.getAccountByJid(jid).connectionPort;
        // should get security too, here...

        if(!((jid && password) ||
             (jid && this.isUp(jid)))) {

            var userInput = this._promptAccount(jid, opts.requester);

            if(userInput.confirm) {
                password = userInput.password;
                jid = userInput.jid;
            }
        }

        if(this.isUp(jid) && opts.continuation)
            opts.continuation(jid);
        else if(jid && password) 
            this._xmpp.signOn(
                jid, password, {
                server: server,
                        port: port,
                        continuation: function() {
                        if(opts.continuation)
                            opts.continuation(jid);
                    }});
    },

    // could have a reference count mechanism

    down: function(jid) {
        this._xmpp.signOff(jid);
    },

    send: function(account, stanza) {
        var _this = this;
        if(this.isUp(account))
            this._send(account.jid || account, stanza);
        else
            // TODO will multiple send cause multiple signon dialogs?
            this.up(account, {continuation: function(jid) {
                            _this._send(jid, stanza);
                        }});
    },

    _send: function(jid, stanza) {
        this._xmpp.send(jid, stanza);
    },

    createChannel: function(baseFilter) {
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
                XMPP._xmpp.removeObserver(this);
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

        this._xmpp.addObserver(channel)

        return channel;
    }
};
