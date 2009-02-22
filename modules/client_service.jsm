/*
 * Copyright 2006-2009 by Massimiliano Mirra
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

// EXPORTS
// ----------------------------------------------------------------------

var EXPORTED_SYMBOLS = [
    'service'
];


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.')
    .QueryInterface(Ci.nsIPrefBranch2);

Cu.import('resource://xmpp4moz/cache_service.jsm');
Cu.import('resource://xmpp4moz/client_session.jsm');
Cu.import('resource://xmpp4moz/namespaces.jsm');
Cu.import('resource://xmpp4moz/utils.jsm');
Cu.import('resource://xmpp4moz/query.jsm');
Cu.import('resource://xmpp4moz/log.jsm');


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [];
var features = {
    'http://jabber.org/protocol/disco#info': 1
};

var sessions = {
    _list: {},

    created: function(name, session, connector) {
        if(this._list[name])
            throw new Error('Session already in session list. (' + name + ')');
        this._list[name] = [session, connector];
    },

    closed: function(name) {
        if(!this.get(name))
            throw new Error('No such session. (' + name + ')');

        delete this._list[name];
    },

    exists: function(name) {
        return this._list[name] != null;
    },

    get: function(name) {
        return this._list[name] || [];
    },

    forEach: function(action) {
        for each(var item in this._list) {
            action(item);
        }
    }
};


// API
// ----------------------------------------------------------------------

var service = {};

service.cache = cache;

service.init = function() {
    this._log = new Log.Source('service');

    Cc['@mozilla.org/observer-service;1']
        .getService(Ci.nsIObserverService)
        .addObserver({
            observe: function(subject, topic, data) {
                sessions.forEach(function([session, connector]) {
                    connector.disconnect();
                });
            }
        }, 'quit-application', false);
}

service.isUp = function(jid) {
    var [session, connector] = sessions.get(jid);
    return (connector && connector.isConnected());
}

service.open = function(jid, connector) {
    if(sessions.exists(jid))
        throw new Error('Session already exists. (' + jid + ')');

    var service = this;

    var connectorObserver = {
        observe: function(subject, topic, data) {
            service._log.send({account: session.name, event: 'connector', data: topic });

            switch(topic) {
            case 'active':
                break;
            case 'accept-stanza':
                session.receive(subject);
                break;
            case 'error':
                sessions.closed(jid);
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

                sessions.closed(jid);
                break;
            }

            service.notifyObservers(subject, 'connector-' + topic, session.name);
        }
    };

    var sessionObserver = {
        observe: function(subject, topic, data) {

            // Log

            if(topic == 'stanza-out' || topic == 'stanza-in')
                service._log.send({account: session.name, event: topic, data: subject});

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

            if(topic == 'stanza-in' &&
               subject.nodeName == 'iq' &&
               subject.getAttribute('type') == 'get' &&
               subject.getElementsByTagNameNS(ns_disco_info, 'query')[0]) {
                var response =
                    <iq type="result" to={subject.getAttribute('from')} id={subject.getAttribute('id')}>
                    <query xmlns={ns_disco_info} node={'http://hyperstruct.net/xmpp4moz#' + service.getCapsHash()}>
                    <identity category="client" type="pc" name="xmpp4moz"/>
                    </query>
                    </iq>;
                for (var featureURI in features)
                    if(features[featureURI] > 0)
                        response.ns_disco_info::query.appendChild(<feature var={featureURI}/>)

                session.send(asDOM(response), null);
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


    session = new Session(jid);
    sessions.created(jid, session, connector);

    session.setObserver(sessionObserver, null, false);
    connector.addObserver(connectorObserver, null, false);
    connector.connect();

    return session;
}

service.close = function(jid) {
    var [session, connector] = sessions.get(jid);
    connector.disconnect();
}

service.getCapsHash = function() {
    function sha1(s) {
        var stream = Cc['@mozilla.org/io/string-input-stream;1']
            .createInstance(Ci.nsIStringInputStream);
        stream.setData(s, s.length);

        var ch = Cc['@mozilla.org/security/hash;1']
            .createInstance(Ci.nsICryptoHash);
        ch.init(ch.SHA1);
        const PR_UINT32_MAX = 0xffffffff;
        ch.updateFromStream(stream, PR_UINT32_MAX);
        return ch.finish(false);
    }

    var identity = <identity category='client' type='pc' name='xmpp4moz'/>;

    var featureURIs = [];
    for (var featureURI in features)
        if(features[featureURI] > 0)
            featureURIs.push(featureURI);

    var ns_xml = 'http://www.w3.org/XML/1998/namespace';

    var s = '';
    s += identity.@category + '/';
    s += identity.@type + '/';
    s += identity.@ns_xml::lang + '/';
    s += identity.@name + '<';
    s += featureURIs.sort().join('<');
    s += '<';

    return btoa(sha1(s));
}

service.send = function(sessionName, element, observer) {
    var cachedReply = null;

    if(element.nodeName == 'iq' &&
       element.getAttribute('type') == 'get' &&
       element.getElementsByTagNameNS(ns_x4m_in, 'cache-control').length > 0) {

        var iqChild = stripInternal(element).firstChild;

        var cachedReply = cache.first(q()
                                      .event('iq')
                                      .account(sessionName)
                                      .from(element.getAttribute('to'))
                                      .type('result')
                                      .direction('in')
                                      .child(iqChild.namespaceURI, iqChild.nodeName)
                                      .compile());
    }

    var [session, connector] = sessions.get(sessionName);
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

service.addObserver = function(observer, topic, ownsWeak) {
    // topic and ownsWeak are not used
    observers.push(observer);
}

service.notifyObservers = function(subject, topic, data) {
    for each(var observer in observers)
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Cu.reportError(e);
            //Cu.reportError('HERERERERERERERERERE')
            Cu.reportError('Channel raised exception: unregistered.');
            this.removeObserver(observer, null);
        }
}

service.removeObserver = function(observer, topic, ownsWeak) {
    // topic and ownsWeak are not used
    var index = observers.indexOf(observer);
    if(index != -1)
        observers.splice(index, 1);
}

service.addFeature = function(discoInfoFeature) {
    if(discoInfoFeature.match(/^</)) {
        discoInfoFeature = new XML(discoInfoFeature).attribute('var');
        Components.utils.reportError('Deprecation notice: someone is registering feature using XML string.');
    }

    if(!(discoInfoFeature in features))
        features[discoInfoFeature] = 0;

    features[discoInfoFeature]++;
}

service.removeFeature = function(discoInfoFeature) {
    if(discoInfoFeature.match(/^</)) {
        discoInfoFeature = new XML(discoInfoFeature).attribute('var');
        Components.utils.reportError('Deprecation notice: someone is registering feature using XML string.');
    }

    if(!discoInfoFeature in features)
        throw new Error('Attempted to remove a feature that hasn\'t been added. ("' + discoInfoFeature + '")');

    features[discoInfoFeature]--;
}


// INITIALIZATION
// ----------------------------------------------------------------------

service.init();


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

function isMUCPresence(domStanza) {
    if(domStanza.nodeName == 'presence' &&
       domStanza.hasAttribute('to')) {
        var x = domStanza.getElementsByTagName('x')[0];
        return (x && x.getAttribute('xmlns') == 'http://jabber.org/protocol/muc');
    } else {
        return false;
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

