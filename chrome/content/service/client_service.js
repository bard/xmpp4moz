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

    opening: function(session) {
        this._list.push(session)
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

function open(jid, server, port, ssl) {
    server = server || jid.match(/@([^\/]+)/)[1];
    port = port || 5223;
    if(ssl == undefined)
        ssl || true;
    
    var transport = new Transport(server, port, { ssl: ssl });
    var session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);
    session.setName(jid);

    transport.on(
        'data', function(data) {
            session.receive(data);
        });

    transport.on(
        'start',
        function() {});

    transport.on(
        'stop', function() {
            try {
                session.close();
            }
            catch(e) {}
        });

    var client = this;
    session.addObserver({
        observe: function(subject, topic, data) {
                if(topic == 'data-out')                     
                    transport.write(
                        subject.QueryInterface(Ci.nsISupportsString).toString());

                if(topic == 'stanza-in') 
                    if(subject.nodeName == 'presence')
                        cache.presence.receive(
                            {session: sessions.get(data), stanza: subject});
                    else if(subject.nodeName == 'iq' &&
                            subject.getElementsByTagName('query')[0] &&
                            subject.getElementsByTagName('query')[0]
                            .getAttribute('xmlns') == 'jabber:iq:roster')
                        cache.roster.receive(
                            {session: sessions.get(data), stanza: subject});

                if(topic == 'stream-out' &&
                   'close' == subject.QueryInterface(Components.interfaces.nsISupportsString).toString()) {
                    var presences = cache.presence.getEnumeration();
                    while(presences.hasMoreElements()) {
                        var presence = presences.getNext();
                        var syntheticPresence = presence.stanza.cloneNode(true);
                        syntheticPresence.removeAttribute('id');
                        syntheticPresence.setAttribute('type', 'unavailable');
                        session.receive(serializer.serializeToString(syntheticPresence));
                    }
                }

                client.notifyObservers(subject, topic, data);
            }}, null, false);

    transport.connect();
    sessions.opening(session);
    session.open(jid.match(/@([^\/]+)/)[1]);
    return session;
}

function close(jid) {
    sessions.get(jid).close();
    // TODO: actually session should be removed on close event, not on
    // signOff request
    sessions.closed(jid);
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

function presenceCache() {
    return cacheProxy('presence');
}

function rosterCache() {
    return cacheProxy('roster');
}


// INTERNALS
// ----------------------------------------------------------------------

function cacheProxy(cacheName) {
    var enumerator = cache[cacheName].getEnumeration();
    
    var proxy = {
        getNext: function() {
            var cachedObject = enumerator.getNext();
            var dict = Cc['@mozilla.org/dictionary;1'].createInstance(Ci.nsIDictionary);
            for(var name in cachedObject) 
                dict.setValue(name, cachedObject[name]);

            return dict;
        },

        hasMoreElements: function() {
            return enumerator.hasMoreElements();
        }
    }
    return proxy;    
}

cache = {
    presence: new Cache(
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
