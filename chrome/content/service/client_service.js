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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader);
const pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.')
    .QueryInterface(Ci.nsIPrefBranch2);

const ns_disco_info = 'http://jabber.org/protocol/disco#info';    

var [Query] = load('chrome://xmpp4moz/content/lib/query.js', 'Query');


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [], features = [], cache;

var sessions = {
    _list: {},

    activated: function(session) {
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

var cache;
let(module = {}) {
    loader.loadSubScript('chrome://xmpp4moz/content/lib/cache.js', module);
    cache = new module.Cache();
    cache.addRule(module.presenceRules);
    cache.addRule(module.rosterRules);
    cache.addRule(module.bookmarkRules);
}



// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

function isUp(jid) {
    var session = sessions.get(jid);
    return (session && session.wrappedJSObject.transport.isConnected());
}

function open(jid, transport, streamObserver) {
    var session = sessions.get(jid);
    if(session)
        return session;
    
    session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);
    session.setName(jid);

    var transportObserver = { observe: function(subject, topic, data) {
        switch(topic) {
        case 'start':
            log('{' + session.name + ',transport-out}    start');
            service.notifyObservers(xpcomize('start'), 'transport-out', session.name);
            service.notifyObservers(xpcomize('open'), 'stream-out', session.name);
            break;
        case 'stop':
            log('{' + session.name + ',transport-out}    stop');

            // Synthesize events

            var stanzas = cache.all(q()
                                    .event('presence')
                                    .account(session.name)
                                    .compile());
            for(var i=0; i<stanzas.snapshotLength; i++) {
                var inverse = syntheticClone(stanzas.snapshotItem(i));
                inverse.setAttribute('type', 'unavailable');
                
                if(inverse.getElementsByTagNameNS('http://hyperstruct.net/xmpp4moz', 'meta')[0].getAttribute('direction') == 'in')
                    session.receive(inverse);
                else
                    cache.receive(inverse);
            }
        
            service.notifyObservers(xpcomize('close'), 'stream-out', session.name);
            service.notifyObservers(xpcomize('stop'), 'transport-out', session.name);
            
            sessions.closed(session);
            break;
        default:
            dump('WARNING - unexpected transport event -- ' + topic + '\n');
        }
    } };
    
    var service = this;
    var sessionObserver = {
        observe: function(subject, topic, data) {

            // Log

            if(topic == 'data-in' || topic == 'data-out' ||
               topic == 'stream-in' || topic == 'stream-out')
                log('{' + session.name + ',' + topic + '}    ' + asString(subject));

            if(topic == 'stanza-out' || topic == 'stanza-in')
                log('{' + session.name + ',' + topic + '}    ' + serialize(stripMeta(subject)));

            // Deliver data to physical transport

            if(topic == 'stanza-out' && transport.isConnected())
                transport.write(serialize(stripMeta(subject)));

            // React to stream open/close
            
            if(topic == 'stream-in')
                switch(asString(subject)) {
                case 'open':
                    if(streamObserver)
                        streamObserver.observe(subject, topic, data);
                    break;
                case 'close':
                    transport.disconnect();
                    break;
                }

            // Submit data to cache (which will decide what to keep
            // and what to throw away)
            
            if(topic == 'stanza-in' || topic == 'stanza-out')
                cache.receive(subject);

            service.notifyObservers(subject, topic, data);

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
                var query = subject.getElementsByTagName('query')[0];
                if(query && query.getAttribute('xmlns') == 'http://jabber.org/protocol/disco#info') {
                    var stanza =
                        <iq type="result" to={subject.getAttribute('from')}>
                        <query xmlns="http://jabber.org/protocol/disco#info">
                             <identity category="client" type="pc" name="xmpp4moz"/>
                             </query>
                             </iq>;
                    for each(var feature in features)
                        stanza.ns_disco_info::query.appendChild(new XML(feature));

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
              <meta xmlns="http://hyperstruct.net/xmpp4moz" account={jid} direction="in"/>
              </iq>));

    session.addObserver(sessionObserver, null, false);

    transport.addObserver(transportObserver, null, false);
    session.wrappedJSObject.transport = transport;

    transport.asyncRead(session);
    transport.connect();
    sessions.activated(session);

    return session;
}

function close(jid) {
    sessions.get(jid).wrappedJSObject.transport.disconnect();
}

function send(sessionName, element, observer) {
    sessions.get(sessionName).send(element, observer);
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
            log('Observer raised exception: unregistered.');
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

function serialize(element) {
    var _ = arguments.callee;
    _.serializer = _.serializer ||
        Cc['@mozilla.org/xmlextras/xmlserializer;1'].getService(Ci.nsIDOMSerializer);
    return _.serializer.serializeToString(element);
}

function stripMeta(domStanza) {
    var outDomStanza = domStanza.cloneNode(true);
    var metas = outDomStanza.getElementsByTagNameNS('http://hyperstruct.net/xmpp4moz', 'meta');
    for(var i=0; i<metas.length; i++)
        outDomStanza.removeChild(metas[i]);
    return outDomStanza;
}

function q() {
    return new Query();
}

function load(url) {
    var loader = (Cc['@mozilla.org/moz/jssubscript-loader;1']
                  .getService(Ci.mozIJSSubScriptLoader));

    var context = {};
    loader.loadSubScript(url, context);
    
    var names = Array.slice(arguments, 1);
    return names.map(function(name) { return context[name]; });
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

function JID(string) {
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

function defineLogger(strategy) {
    const srvConsole = Cc['@mozilla.org/consoleservice;1']
        .getService(Ci.nsIConsoleService);

    switch(strategy) {
    case 'console':
        log = function(msg) { srvConsole.logStringMessage('XMPP ' + msg); }
        break;
    case 'sysconsole':
        log = function(msg) { dump('XMPP ' + msg + '\n'); }
        break;
    default:
        log = function(msg) {}
    }
}

function log(msg) {
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
    return stanza.getElementsByTagNameNS(
        'http://dev.hyperstruct.net/xmpp4moz',
        'synthetic').length > 0;
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
            clone.ownerDocument.createElementNS(
                'http://dev.hyperstruct.net/xmpp4moz',
                'synthetic'));
 
    return clone;
}

function asDOM(object) {
    var _ = arguments.callee;
    _.parser = _.parser || Cc['@mozilla.org/xmlextras/domparser;1'].getService(Ci.nsIDOMParser);

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


// SNIPPETS
// ----------------------------------------------------------------------

// function open(jid, transport, streamObserver) {
//     var session;
//     // if(requestedStartTLS)
//     //     _openSecuringSession(
//     //         jid, transport, function(transport) {
//     //             session = _openUserSession(jid, transport, streamObserver);
//     //             sessions.activated(session);
//     //         });
//     // else {
//     session = _openUserSession(jid, transport, streamObserver);
//     sessions.activated(session);
//     // }
// }

// function _openSecuringSession(jid, transport, continuation) {
//     var session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
//         .createInstance(Ci.nsIXMPPClientSession);

//     var sessionObserver = {};
//     var transportObserver = {};

//     session.addObserver(sessionObserver, null, false);
//     transport.addObserver(transportObserver, null, false);

//     session.removeObserver(sessionObserver, null);
//     transport.removeObserver(transportObserver, null);
//     continuation(transport);
// }


// INITIALIZATION
// ----------------------------------------------------------------------

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

