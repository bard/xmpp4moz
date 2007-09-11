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
const pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.');

const ns_disco_info = 'http://jabber.org/protocol/disco#info';    


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [], features = [], cache;

var sessions = {
    _list: {},

    activated: function(session) {
        var existingSession;
        
        for(var i=0, l=this._list.length; i<l; i++) 
            if(this._list[i].name == session.name) {
                existingSession = this._list[i];
                break;
            }

        if(this._list[session.name] &&
           this._list[session.name].isOpen())
            this._list[session.name].close();
            
        this._list[session.name] = session;
    },

    closed: function(thing) {
        var session = (typeof(thing) == 'string' ?
                       this.get(thing) : thing);

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
                log('{' + session.name + ',transport-out}    start');
                service.notifyObservers(xpcomize('start'), 'transport-out', session.name);
                session.open(JID(jid).hostname);
                break;
                case 'stop':
                log('{' + session.name + ',transport-out}    stop');
                service.notifyObservers(xpcomize('stop'), 'transport-out', session.name);

                // For unexpected disconnections, we still need to
                // reflect the fact that we are no longer available.
                //
                // This has drawbacks: first, only those who listen to
                // transport events and then poll the cache will know,
                // because there is no corresponding event sent on the
                // bus; second, it will override the regular
                // unavailable presence sent before an intentional
                // disconnection.

                cache.receive(asDOM(<presence type="unavailable">
                                    <meta xmlns="http://hyperstruct.net/xmpp4moz"
                                    account={session.name} direction="out"/>
                                    </presence>));
                 
                if(session.isOpen()) 
                    session.close();

                sessions.closed(session);
                break;
            }
        }
    };

    var service = this;
    var sessionObserver = {
        observe: function(subject, topic, data) {
            if(topic == 'data-in' || topic == 'data-out' ||
               topic == 'stream-in' || topic == 'stream-out')
                log('{' + session.name + ',' + topic + '}    ' + asString(subject));

            if(topic == 'data-out' && transport.isConnected())
                transport.write(asString(subject));

            if(topic == 'stream-in' && asString(subject) == 'open' && streamObserver)
                streamObserver.observe(subject, topic, data);
            
            if(topic == 'stream-in' && asString(subject) == 'close') 
                if(session.isOpen()) 
                    session.close();

            if(topic == 'stanza-in' && subject.nodeName == 'presence')
                cache.receive(subject);

            if(topic == 'stanza-out' && subject.nodeName == 'presence' &&
               (subject.getAttribute('type') == undefined ||
                subject.getAttribute('type') == 'unavailable'))
                cache.receive(subject);

            if(topic == 'stanza-in' &&
               subject.nodeName == 'iq' &&
               subject.getElementsByTagName('query').length > 0)
                cache.receive(subject);

            service.notifyObservers(subject, topic, data);

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
               cache.fetch({
                   event     : 'presence',
                   direction : 'out',
                   session   : { name: data },
                   stanza    : function(s) {
                           return s.getAttribute('to') == subject.getAttribute('from');
                       }}).length > 0)
                cache.fetch({
                    event: 'presence',
                    account: data,
                    from: { address: JID(subject.getAttribute('from')).address },
                    direction: 'in',
                    }).forEach(
                        function(presence) {
                            var inverse = syntheticClone(presence.stanza);
                            inverse.setAttribute('type', 'unavailable');
                            session.receive(inverse);
                        });
                
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

            
            if(topic == 'stream-out' && asString(subject) == 'close') {
                cache.fetch({
                    event     : 'presence',
                    session   : { name: data },
                    direction : 'in',
                    }).forEach(
                        function(presence) {
                            var inverse = syntheticClone(presence.stanza);
                            inverse.setAttribute('type', 'unavailable');
                            session.receive(inverse);
                        });

                cache.fetch({
                    event     : 'presence',
                    direction : 'out',
                    session   : { name: data },                    
                    }).forEach(
                        function(presence) {
                            var inverse = syntheticClone(presence.stanza);
                            inverse.setAttribute('type', 'unavailable');
                            cache.receive(inverse);
                        });

                transport.disconnect();
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

    if(transport.isConnected()) 
        session.open(JID(jid).hostname);
    else {
        transport.connect();
        transport.asyncRead(session);
    }

    return session;
}

function close(jid) {
    sessions.get(jid).close();
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
    for each(var target in pref.getCharPref('logTargets').split(',')) {
        switch(target) {
        case 'console':
            Cc[ "@mozilla.org/consoleservice;1" ]
                .getService(Ci.nsIConsoleService)
                .logStringMessage('XMPP ' + msg);
            break;
        case 'sysconsole':
            dump('XMPP ' + msg + '\n');
            break;
        }
    }
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
