// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader);
const serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Ci.nsIDOMSerializer);

loader.loadSubScript('chrome://xmpp4moz/content/lib/module_manager.js');
const module = new ModuleManager(['chrome://xmpp4moz/content']);

const Transport = module.require('class', 'lib/socket');
const Cache = module.require('package', 'lib/cache').Cache;


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [], cache;

var sessions = {
    _list: [],

    created: function(session) {
        var existingSession;
        
        for(var i=0, l=this._list.length; i<l; i++) 
            if(this._list[i].name == session.name) {
                existingSession = this._list[i];
                break;
            }

        if(existingSession) {
            if(existingSession.isOpen())
                existingSession.close();
            
            this._list[i] = session;
        } else
            this._list.push(session);
    },

    closed: function(thing) {
        var session = (typeof(thing) == 'string' ?
                       this.get(thing) : thing);

        this._list.splice(
            this._list.indexOf(session), 1);
    },

    get: function(jid) {
        for each(var session in this._list) {
            if(session.name == jid)
                return session;
        }
    }
};


// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

function isUp(jid) {
    var session = sessions.get(jid);
    return (session && session.isOpen());
}

function open(jid, server, port, ssl, streamObserver) {
    server = server || jid.match(/@([^\/]+)/)[1];
    port = port || 5223;
    if(ssl == undefined)
        ssl = true;


    var transport = new Transport(server, port, { ssl: ssl });
    var session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);
    session.setName(jid);


    sessions.created(session);
    

    transport.on('data',  function(data) { session.receive(data); });
    transport.on(
        'start', function() {
            log('Xmpp E: Transport for ' + session.name + ' opening');
        });
    transport.on(
        'stop',  function() {
            log('Xmpp E: Transport for ' + session.name + ' closing');
            if(session.isOpen()) 
                session.close();
        });


    var client = this;
    var sessionObserver = {
        observe: function(subject, topic, data) {
            log('Xmpp E: ' + topic);

            if(topic == 'data-in' || topic == 'data-out')
                log('Xmpp ' + (topic == 'data-in' ? 'S' : 'C') + ': ' + asString(subject));

            if(topic == 'data-out' && transport.isConnected())
                transport.write(asString(subject));

            if(topic == 'stream-in' && asString(subject) == 'open' && streamObserver)
                streamObserver.observe(subject, topic, data);
            
            if(topic == 'stream-in' && asString(subject) == 'close') {
                if(session.isOpen()) 
                    session.close();
                transport.disconnect();
            }

            if(topic == 'stanza-out' && subject.nodeName == 'presence' &&
               subject.hasAttribute('to') && 
               subject.getAttribute('type') == 'unavailable') {
                
                for each(var presence in cache.presenceIn.copy()) {
                    if(JID(subject.getAttribute('to')).address ==
                       JID(presence.stanza.getAttribute('from')).address) {
                        var syntheticPresence = presence.stanza.cloneNode(true);
                        syntheticPresence.setAttribute('type', 'unavailable');
                        session.receive(serializer.serializeToString(syntheticPresence));
                    }
                }
            }

            if(topic == 'stream-out' && asString(subject) == 'close') {
                for each(var presence in cache.presenceIn.copy()) {
                    var syntheticPresence = presence.stanza.cloneNode(true);
                    syntheticPresence.removeAttribute('id');
                    syntheticPresence.setAttribute('type', 'unavailable');
                    session.receive(serializer.serializeToString(syntheticPresence));
                }
                transport.disconnect();
                sessions.closed(session);
            }

            if(topic == 'stanza-in' && subject.nodeName == 'presence')
                cache.presenceIn.receive({session: sessions.get(data),
                                         stanza: subject});

            if(topic == 'stanza-out' && subject.
               nodeName == 'presence' &&
               (subject.getAttribute('type') == undefined ||
                subject.getAttribute('type') == 'unavailable') &&
               !subject.hasAttribute('to'))
                cache.presenceOut.receive({session: sessions.get(data), 
                                          stanza: subject});

            if(topic == 'stanza-in' && subject.nodeName == 'iq') {
                var query = subject.getElementsByTagName('query')[0];
                if(query && query.getAttribute('xmlns') == 'jabber:iq:roster') 
                    cache.roster.receive({session: sessions.get(data), stanza: subject});
            }

            client.notifyObservers(subject, topic, data);

            if(topic == 'stanza-in') {
                var query = subject.getElementsByTagName('query')[0];
                if(query && query.getAttribute('xmlns') == 'http://jabber.org/protocol/disco#info') {
                    var stanza =
                        <iq type="result" to={subject.getAttribute('from')}>
                        <query xmlns="http://jabber.org/protocol/disco#info">
                             <identity category="client" type="pc" name="xmpp4moz"/>
                             </query>
                             </iq>;
                    session.send(stanza.toXMLString(), null);
                }
            }
        }
    }

    session.addObserver(sessionObserver, null, false);


    transport.connect();
    session.open(JID(jid).hostname);
    return session;
}

function close(jid) {
    sessions.get(jid).close();
}

function send(sessionName, stanza, observer) {
    sessions.get(sessionName).send(stanza, observer);
}

function addObserver(observer) {
    observers.push(observer);
}

function notifyObservers(subject, topic, data) {
    for each(var observer in observers) 
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Cu.reportError(e);
        }
}

// XXX add other parameters as required by IDL
function removeObserver(observer) {
    var index = observers.indexOf(observer);
    if(index != -1) 
        observers.splice(index, 1);
}

function presenceInCache() {
    return arrayOfObjectsToEnumerator(cache.presenceIn.copy());
}

function presenceOutCache() {
    return arrayOfObjectsToEnumerator(cache.presenceOut.copy());
}

function rosterCache() {
    return arrayOfObjectsToEnumerator(cache.roster.copy());
}


// INTERNALS
// ----------------------------------------------------------------------

function arrayOfObjectsToEnumerator(array) {
    var i=0;

    var enumerator = {
        getNext: function() {
            var object = array[i++];
            var dict = Cc['@mozilla.org/dictionary;1'].createInstance(Ci.nsIDictionary);            
            for(var name in object) {
                if(typeof(object[name]) == 'string') {
                    var xpcString = Cc["@mozilla.org/supports-string;1"]
                        .createInstance(Ci.nsISupportsString);
                    xpcString.data = object[name];
                    dict.setValue(name, xpcString);
                } else {
                    dict.setValue(name, object[name]);
                }
            }

            return dict;
        },

        hasMoreElements: function() {
            return i < array.length;
        }
    }
    return enumerator;
}

cache = {
    presenceIn: new Cache(
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
        }),

    presenceOut: new Cache(
        function(newObject, cachedObject) {
            if(newObject.session.name == cachedObject.session.name) {
                if(newObject.stanza.getAttribute('type') == 'unavailable') 
                    return null;
                else
                    return newObject;
            }
        },
        function(newObject) {
            return (!newObject.stanza.hasAttribute('type') ||
                    newObject.stanza.getAttribute('type') == 'unavailable');
        }),
    
    // XXX does not handle roster remove case and probably a few others
    roster: new Cache(
        function(newObject, cachedObject) {
            if(newObject.session.name != cachedObject.session.name)
                return;

            var newQuery = newObject.stanza.getElementsByTagNameNS('jabber:iq:roster', 'query')[0];
            if(!newQuery)
                return cachedQuery;
            
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
        })    
};


// UTILITIES
// ----------------------------------------------------------------------

function JID(string) {
    var m = string.match(/^(.+?)@(.+?)(?:\/|$)(.*$)/);
    var jid = {
        username: m[1],
        hostname: m[2],
        resource: m[3],
        nick:     m[3],
        address:  m[1] + '@' + m[2],
        full:     m[3] ? string : null
    }

    return jid;    
}

function asString(xpcomString) {
    return xpcomString.QueryInterface(Ci.nsISupportsString).toString();
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

function isMUCPresence(domStanza) {
    if(domStanza.nodeName == 'presence' &&
       domStanza.hasAttribute('to')) {
        var x = domStanza.getElementsByTagName('x')[0];
        return (x && x.getAttribute('xmlns') == 'http://jabber.org/protocol/muc');
    }
}
