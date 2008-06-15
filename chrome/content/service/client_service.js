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


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.')
    .QueryInterface(Ci.nsIPrefBranch2);

const ns_disco_info = 'http://jabber.org/protocol/disco#info';    
const ns_x4m_in = 'http://hyperstruct.net/xmpp4moz/protocol/internal';

loader.loadSubScript('chrome://xmpp4moz/content/lib/misc.js');
load('chrome://xmpp4moz/content/lib/query.js', ['Query']);


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [], features = [], cache;

var sessions = {
    _list: {},

    pending: function(session) {
        this._pending[session.name] = session;
    },

    created: function(session) {
        if(this._list[session.name])
            throw new Error('Session already in session list. (' + session.name + ')');
        this._list[session.name] = session;
    },

    closed: function(thing) {
        var session = (typeof(thing) == 'string' ? this.get(thing) : thing);
        delete this._list[session.name];
    },

    get: function(jid) {
        return this._list[jid];
    },

    forEach: function(action) {
        for each(var session in this._list) {
            action(session);
        }
    }
};


// INITIALIZATION
// ----------------------------------------------------------------------

function init() {
    cache = Cc['@hyperstruct.net/xmpp4moz/xmppcache;1']
        .getService(Ci.nsIXMPPCacheService);

    pref.addObserver('', {
        observe: function(subject, topic, data) {
            if(topic != 'nsPref:changed')
                return;

            switch(data) {
            case 'logTarget':
                defineLogger(pref.getCharPref('logTarget'));
                break;
            default:
            }
         }
    }, false);

    defineLogger(pref.getCharPref('logTarget'));
}


// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

function isUp(jid) {
    var session = sessions.get(jid);
    return (session && session.wrappedJSObject.connector.isConnected());
}

function open(jid, connector, connectionProgressObserver) {
    var session = sessions.get(jid);
    if(session)
        return session;
    
    session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);
    session.init(jid);
    sessions.created(session);

    var connectorObserver = { observe: function(subject, topic, data) {
        LOG('{', session.name, ',connector}    ', topic);

        switch(topic) {
        case 'active':
            break;
        case 'error':
            sessions.closed(session);
            break;
        case 'disconnected':
            // Synthesize events
            
            var stanzas = cache.all(q()
                                    .event('presence')
                                    .account(session.name)
                                    .compile());
            for(var i=0; i<stanzas.snapshotLength; i++) {
                var inverse = syntheticClone(stanzas.snapshotItem(i));
                inverse.setAttribute('type', 'unavailable');
                
                if(inverse.getElementsByTagNameNS(ns_x4m_in, 'meta')[0].getAttribute('direction') == 'in')
                    session.receive(inverse);
                else
                    cache.receive(inverse);
            }

            sessions.closed(session);
            break;
        }

        if(connectionProgressObserver)
            connectionProgressObserver.observe(xpcomize(topic), 'connector', data);

        service.notifyObservers(xpcomize(topic), 'connector', session.name);
    } };
    
    var service = this;
    var sessionObserver = {
        observe: function(subject, topic, data) {

            // Log

            if(topic == 'stanza-out' || topic == 'stanza-in')
                LOG('{', session.name, ',', topic, '}    ', subject);

            // Submit data to cache (which will decide what to keep
            // and what to throw away)
            
            if(topic == 'stanza-in' || topic == 'stanza-out')
                cache.receive(subject);

            service.notifyObservers(subject, topic, data);

            if(topic == 'stanza-out' && connector.isConnected())
                connector.send(stripInternal(subject));
            
            // Synthesize some events for consistency

            // When an unavailable presence with a muc#user payload
            // comes in, that might be due to us exiting a room.  So
            // we check if there is a corresponding outgoing presence
            // that means that we joined the room.
            //
            // Since the server will not send unavailable presences
            // from all room occupants, we need to synthesize them in
            // order to keep the cache clean.
            //
            // S: <presence from="room@conference.server.org/ournick" type="unavailable"/>

            if(topic == 'stanza-in' && subject.nodeName == 'presence' &&
               subject.hasAttribute('to') && 
               subject.getAttribute('type') == 'unavailable' &&
               isMUCUserPresence(subject) &&
               cache.first(q()
                           .event('presence')
                           .direction('out')
                           .account(data)
                           .to(subject.getAttribute('from'))
                           .compile())) {

                let(stanzas = cache.all(q()
                                        .event('presence')
                                        .direction('in')
                                        .account(data)
                                        .from(JID(subject.getAttribute('from')).address)
                                        .compile())) {
                    for(var i=0; i<stanzas.snapshotLength; i++) {
                        var inverse = syntheticClone(stanzas.snapshotItem(i));
                        inverse.setAttribute('type', 'unavailable');
                        session.receive(inverse);
                    }
                }
            }
            
            if(topic == 'stanza-in' && subject.nodeName == 'iq' &&
               subject.getAttribute('type') == 'get') {
                if(subject.getElementsByTagNameNS(ns_disco_info, 'query')[0]) {
                    var stanza =
                        <iq type="result" to={subject.getAttribute('from')}
                    id={subject.getAttribute('id')}>
                        <query xmlns="http://jabber.org/protocol/disco#info">
                        <identity category="client" type="pc" name="xmpp4moz"/>
                        <feature var="http://jabber.org/protocol/disco#info"/>
                        </query>
                        </iq>;
                    for each(var feature in features) {
                        // XXX should make sure that every feature is reported just once...
                        stanza.ns_disco_info::query.appendChild(new XML(feature));
                    }

                    session.send(asDOM(stanza), null);
                }
            }
        }
    }

    // Initializing roster cache for session, so that it will be
    // available for hybrid applications even before we receive the
    // roster (or if we don't receive it at all).

    cache.receive(
        asDOM(<iq from={jid} to={jid} type="result">
              <query xmlns="jabber:iq:roster"/>
              <meta xmlns={ns_x4m_in} account={jid} direction="in"/>
              </iq>));

    session.addObserver(sessionObserver, null, false);

    connector.addObserver(connectorObserver, null, false);
    session.wrappedJSObject.connector = connector;

    connector.setSession(session);
    connector.connect();

    return session;
}

function close(jid) {
    sessions.get(jid).wrappedJSObject.connector.disconnect();
}

function send(sessionName, element, observer) {
    var cachedReply = null;

    if(element.nodeName == 'iq' &&
       element.getAttribute('type') == 'get' &&
       element.getElementsByTagNameNS(ns_x4m_in, 'cache-control').length > 0) {
        
        // XXX should be made more general
        
        var query = (element.getElementsByTagName('query')[0] ||
                     element.getElementsByTagName('vCard')[0]);

        var cachedReply = cache.first(q()
                                      .event('iq')
                                      .account(sessionName)
                                      .from(element.getAttribute('to'))
                                      .type('result')
                                      .direction('in')
                                      .child(query.namespaceURI, query.nodeName)
                                      .compile());
    }

    var session = sessions.get(sessionName);
    if(cachedReply) {
        if(observer)
            observer.observe(cachedReply, 'reply-in', sessionName);
        else {
            var reply = cachedReply.cloneNode(true);
            reply.setAttribute('id', element.getAttribute('id'));
            session.receive(cachedReply);
        }
    } else
        session.send(element, observer);
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
            LOG('Observer raised exception: unregistered.');
            this.removeObserver(observer);
        }
}

// XXX add other parameters as required by IDL
function removeObserver(observer) {
    var index = observers.indexOf(observer);
    if(index != -1) 
        observers.splice(index, 1);
}

function addFeature(discoInfoFeature) {
    features.push(discoInfoFeature);
}

function removeFeature(discoInfoFeature) {
    features.splice(features.indexOf(discoInfoFeature), 1);
}


// UTILITIES
// ----------------------------------------------------------------------

function stripInternal(domStanza) {
    var outDomStanza = domStanza.cloneNode(true);
    var child = outDomStanza.lastChild;
    while(child) {
        var next = child.previousSibling;
        if(child.namespaceURI == ns_x4m_in)
            outDomStanza.removeChild(child);
        child = next;
    }
    return outDomStanza;
}

function q() {
    return new Query();
}

function xpcomize(thing) {
    if(typeof(thing) == 'string') {
        var xpcomString = Cc["@mozilla.org/supports-string;1"]
            .createInstance(Ci.nsISupportsString);
        xpcomString.data = thing;
        return xpcomString;
    } else if(thing instanceof Ci.nsISupports) {
        return thing;
    } else {
        throw new Error('Neither an XPCOM object nor a string. (' + thing + ')');
    }
}

function asString(thing) {
    switch(typeof(thing)) {
    case 'string':
        return thing;
        break;
    case 'xml':
        return thing.toXMLString();
        break;
    default:
        if(thing instanceof Ci.nsISupportsString)
            return thing.toString();
        else if(thing instanceof Ci.nsIDOMElement)
            return serialize(stripInternal(thing));
        else
            return '';
    }
}

function defineLogger(strategy) {
    const srvConsole = Cc['@mozilla.org/consoleservice;1']
        .getService(Ci.nsIConsoleService);

    function listToString(list) {
        var parts = [];
        for(var i=0,l=list.length; i<l; i++)
            parts.push(asString(list[i]));
        return parts.join('');
    }
    
    switch(strategy) {
    case 'console':
        LOG = function(msg) { srvConsole.logStringMessage('XMPP ' + listToString(arguments)); };
        break;
    case 'sysconsole':
        LOG = function(msg) { dump('XMPP ' + listToString(arguments) + '\n'); };
        break;
    default:
        LOG = function(msg) {};
    }
}

function LOG(msg) {
    // this is dynamically redefined by defineLogger(), called once
    // during initialization and then whenever the xmpp.logTarget
    // pref changes.
}

function isMUCPresence(domStanza) {
    if(domStanza.nodeName == 'presence' &&
       domStanza.hasAttribute('to')) {
        var x = domStanza.getElementsByTagName('x')[0];
        return (x && x.getAttribute('xmlns') == 'http://jabber.org/protocol/muc');
    }
}

function isMUCUserPresence(domStanza) {
    return (domStanza.nodeName == 'presence' &&
            domStanza.hasAttribute('to') &&
            domStanza.getElementsByTagNameNS('http://jabber.org/protocol/muc#user', 'x').length > 0);
}

/**
 * Checks whether _stanza_ is marked as synthetic, i.e. has a
 * <synthetic xmlns="http://dev.hyperstruct.net/xmpp4moz"/> child
 * element.
 *
 */

function isSynthetic(stanza) {
    return stanza.getElementsByTagNameNS(ns_x4m_in, 'synthetic').length > 0;
}

/**
 * Returns a synthetic clone of the given _stanza_.
 *
 */

function syntheticClone(stanza) {
    var clone = stanza.cloneNode(true);

    clone.removeAttribute('id');
    if(!isSynthetic(clone))
        clone.appendChild(
            clone.ownerDocument.createElementNS(ns_x4m_in, 'synthetic'));
 
    return clone;
}
