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

const PresenceCache = module.require('class', 'lib/presence_cache');
const RosterCache = module.require('class', 'lib/roster_cache');

const ns_disco_info = 'http://jabber.org/protocol/disco#info';    


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [], cache, features = [];

var sessions = {
    _list: [],

    activated: function(session) {
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

function open(jid, transport, streamObserver) {
    var session;
    // if(requestedStartTLS)
    //     _openSecuringSession(
    //         jid, transport, function(transport) {
    //             session = _openUserSession(jid, transport, streamObserver);
    //             sessions.activated(session);
    //         });
    // else {
    session = _openUserSession(jid, transport, streamObserver);
    sessions.activated(session);
    // }
}

function _openSecuringSession(jid, transport, continuation) {
    var session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);

    var sessionObserver = {};
    var transportObserver = {};

    session.addObserver(sessionObserver, null, false);
    transport.addObserver(transportObserver, null, false);

    session.removeObserver(sessionObserver, null);
    transport.removeObserver(transportObserver, null);
    continuation(transport);
}

function _openUserSession(jid, transport, streamObserver) {
    var session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);
    session.setName(jid);

    var transportObserver = {
        observe: function(subject, topic, data) {
            switch(topic) {
                case 'start':
                log('Xmpp E: Transport for ' + session.name + ' opening');
                service.notifyObservers(xpcomize('start'), 'transport-out', session.name);
                session.open(JID(jid).hostname);
                break;
                case 'stop':
                log('Xmpp E: Transport for ' + session.name + ' closing');
                service.notifyObservers(xpcomize('stop'), 'transport-out', session.name);
                if(session.isOpen()) 
                    session.close();
                break;
                case 'data':
                session.receive(data);
                break;
            }
        }
    };

    var service = this;
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

            if(topic == 'stanza-in' && subject.nodeName == 'presence')
                cache.presenceIn.receive({session: sessions.get(data),
                                         stanza: subject});

            if(topic == 'stanza-out' && subject.
               nodeName == 'presence' &&
               (subject.getAttribute('type') == undefined ||
                subject.getAttribute('type') == 'unavailable'))
                cache.presenceOut.receive({session: sessions.get(data), 
                                          stanza: subject});

            if(topic == 'stanza-in' && subject.nodeName == 'iq') {
                var query = subject.getElementsByTagName('query')[0];
                if(query && query.getAttribute('xmlns') == 'jabber:iq:roster') 
                    cache.roster.receive({session: sessions.get(data), stanza: subject});
            }

            service.notifyObservers(subject, topic, data);

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

                    session.send(stanza.toXMLString(), null);
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
        }
    }

    session.addObserver(sessionObserver, null, false);
    transport.addObserver(transportObserver, null, false);

    if(transport.isConnected()) 
        session.open(JID(jid).hostname);
    else
        transport.connect();

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

function presenceInCache() {
    return arrayOfObjectsToEnumerator(cache.presenceIn.copy());
}

function presenceOutCache() {
    return arrayOfObjectsToEnumerator(cache.presenceOut.copy());
}

function rosterCache() {
    return arrayOfObjectsToEnumerator(cache.roster.copy());
}

function getSession(jid) {
    return sessions.get(jid);
}

function addFeature(discoInfoFeature) {
    features.push(discoInfoFeature);
}

function removeFeature(discoInfoFeature) {
    features.splice(features.indexOf(discoInfoFeature), 1);
}


// INTERNALS
// ----------------------------------------------------------------------

function arrayOfObjectsToEnumerator(array) {
    var i=0;

    var enumerator = {
        getNext: function() {
            var object = array[i++];
            var prop = Cc['@mozilla.org/properties;1'].createInstance(Ci.nsIProperties);
            for(var name in object) 
                prop.set(name, xpcomize(object[name]))
            return prop
        },

        hasMoreElements: function() {
            return i < array.length;
        }
    }
    return enumerator;
}

cache = {
    presenceIn: new PresenceCache(),

    presenceOut: new PresenceCache(),

    roster: new RosterCache(),
};


// UTILITIES
// ----------------------------------------------------------------------

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
