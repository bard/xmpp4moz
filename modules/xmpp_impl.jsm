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


var EXPORTED_SYMBOLS = [
    // local
    'cache',
    'isMUC',
    'getError',
    'getStreamErrorMessage',
    'getStreamErrorCondition',
    'getStanzaErrorMessage',
    'nickFor',
    'up',
    'down',
    'isUp',
    'isDown',
    'send',
    'createChannel',
    'open',
    'close',
    'q',
    'presencesOf',
    'connectPanel',
    'account',
    'connectorTypeFor',

    // re-exported
    'accounts',
    'entity',
    'JID',
    'URI',
    'getPassword',
    'delPassword',
    'setPassword',

    // deprecated
    'presenceSummary',
    'enableContentDocument',
    'disableContentDocument',
    'getAccountByJid',
    'getAccountByKey'
]


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const srvPrompt = Cc["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Ci.nsIPromptService);
const streamErrorMessages = Components.classes["@mozilla.org/intl/stringbundle;1"]
    .getService(Components.interfaces.nsIStringBundleService)
    .createBundle("chrome://xmpp4moz/locale/streamErrors.properties");
const stanzaErrorMessages = Components.classes["@mozilla.org/intl/stringbundle;1"]
    .getService(Components.interfaces.nsIStringBundleService)
    .createBundle("chrome://xmpp4moz/locale/stanzaErrors.properties");

Cu.import('resource://xmpp4moz/client_service.jsm');
Cu.import('resource://xmpp4moz/channel.jsm');
Cu.import('resource://xmpp4moz/query.jsm');
Cu.import('resource://xmpp4moz/utils.jsm');
Cu.import('resource://xmpp4moz/accounts.jsm');
Cu.import('resource://xmpp4moz/json.jsm');
Cu.import('resource://xmpp4moz/namespaces.jsm');
Cu.import('resource://xmpp4moz/log.jsm');
Cu.import('resource://xmpp4moz/connector-xmpp_tcp.jsm');


// DEVELOPER INTERFACE
// ----------------------------------------------------------------------

var cache = {
    find: function(pattern) {
        return this.fetch(pattern)[0];
    },

    first: function(query) {
        var result = service.cache.first(
            (typeof(query.compile) == 'function') ? query.compile() : query)
        if(result)
            return this._wrapResult(result);
    },

    all: function(query) {
        var stanzas = service.cache.all(
            (typeof(query.compile) == 'function') ? query.compile() : query);
        var results = [];
        for(var i=0; i<stanzas.snapshotLength; i++)
            results.push(this._wrapResult(stanzas.snapshotItem(i)));
        return results;
    },

    fetch: function(pattern) {
        var remotePattern = {}, localPattern = {};
        for(var member in pattern)
            if(typeof(pattern[member]) == 'function') {
                localPattern[member] = pattern[member];
            } else {
                remotePattern[member] = pattern[member];
            }

        var stanzas = service.cache.all(
            this._patternToQuery(remotePattern).compile());

        var wrappedPartialResults = [];
        for(var i=0; i<stanzas.snapshotLength; i++) {
            var stanza = stanzas.snapshotItem(i);

            wrappedPartialResults.push(this._wrapResult(stanza));
        }

        return wrappedPartialResults.filter(function(event) { return match(event, localPattern); });
    },

    _wrapResult: function(stanza) {
        var meta = stanza.getElementsByTagNameNS(ns_x4m_in, 'meta')[0];
        return {
            stanza    : dom2xml(stanza),
            direction : meta.getAttribute('direction'),
            account   : meta.getAttribute('account'),
            session   : { name: meta.getAttribute('account')}
        };
    },

    _patternToQuery: function(pattern) {
        var query = q();
        for(var ruleName in pattern) {
            switch(typeof(pattern[ruleName])) {
            case 'string':
                query = query[ruleName](pattern[ruleName]);
                break;
            case 'object':
                if(ruleName == 'session' && pattern[ruleName].name)
                    query = query.account(pattern[ruleName].name);
                else if(ruleName == 'from' && pattern[ruleName].address)
                    query = query.from(pattern[ruleName].address)
                else if(ruleName == 'from' && pattern[ruleName].full)
                    query = query.from(pattern[ruleName].address)
                else
                    throw new Error('Unhandled case when converting pattern to query. (' +
                                    ruleName + ': ' + pattern[ruleName].toSource() + ')');
                break;
            default:
                throw new Error('Unhandled type when converting pattern to query. (' +
                                typeof(pattern[ruleName]) + ')');
            }
        }
        return query;
    }
};

function isMUC(account, address) {
    return cache.fetch({ // XXX use optimized query here
        event     : 'presence',
        direction : 'out',
        account   : account,
        stanza    : function(s) {
            return (s.@to != undefined &&
                    JID(s.@to).address == address &&
                    s.ns_muc::x != undefined);
        }
    }).length > 0 || cache.fetch({
        event     : 'iq',
        direction : 'in',
        account   : account,
        stanza    : function(s) {
            return (s.ns_private::query
                    .ns_bookmarks::storage
                    .ns_bookmarks::conference
                    .(@jid == address) != undefined);
        }
    }).length > 0;
}

function getError(stanza) {
    const ns_stanzas = 'urn:ietf:params:xml:ns:xmpp-stanzas';

    const mappings = {
        302: ['redirect', 'modify'],
        400: ['bad-request', 'modify'],
        401: ['not-authorized', 'auth'],
        402: ['payment-required', 'auth'],
        403: ['forbidden', 'auth'],
        404: ['item-not-found', 'cancel'],
        405: ['not-allowed', 'cancel'],
        406: ['not-acceptable', 'modify'],
        407: ['registration-required', 'auth'],
        408: ['remote-server-timeout', 'wait'],
        409: ['conflict', 'cancel'],
        500: ['internal-server-error', 'wait'],
        501: ['feature-not-implemented', 'cancel'],
        502: ['service-unavailable', 'wait'],
        503: ['service-unavailable', 'cancel'],
        504: ['remote-server-timeout', 'wait'],
        510: ['service-unavailable', 'cancel']
    };

    var xmppErrorCondition = stanza.error..ns_stanzas::*;

    if(xmppErrorCondition == undefined)
        return mappings[stanza.error.@code];
    else
        return [xmppErrorCondition[0].localName(), stanza.error.@type.toString()];
}

function getStanzaErrorMessage(condition) {
    return stanzaErrorMessages.GetStringFromName(condition);
}

function getStreamErrorMessage(condition) {
    return streamErrorMessages.GetStringFromName(condition);
}

function getStreamErrorCondition(error) {
    return error.ns_stream::*[0].localName();
}

function nickFor(account, address) {
//     const ns_vcard_update = 'vcard-temp:x:update';

//     var presence = cache.first(
//         q().event('presence')
//             .direction('in')
//             .account(account)
//             .from(address)
//             .desc(ns_vcard_update, 'nickname'));

//     if(presence)
//         return presence.stanza..ns_vcard_update::nickname.toString()

    var roster = cache.first(
        q().event('iq')
            .direction('in')
            .account(account)
            .child('jabber:iq:roster', 'query'));

    var name;
    if(roster) {
        var item = roster.stanza..ns_roster::item
            .(@jid == address);
        name = item.@name.toString();
    }

    return name || JID(address).username || address;
}

function account(thing) {
    if(typeof(thing) == 'string')
        return accounts.get({jid: thing});
    else if(!('jid' in thing))
        throw new Error('Not an account object. (' + thing + ')');
    else
        return thing;
}

function up(account, onSessionActive) {
    if(!account)
        account = {};
    else if(typeof(account) == 'string')
        let(a = accounts.get({jid: account})) {
            if(!a)
                throw new Error('No such account. ("' + account + '")');
            else
                account = a;
        }

    onSessionActive = onSessionActive || function() {};

    if(account.jid)
        _up(account, onSessionActive);
    else
        _up(null, function(jid) {
            account.jid = jid; // TODO: why this?
            onSessionActive(jid);
        });
}

function down(account) {
    if(isDown(account))
        return;

    var jid =
        (typeof(account) == 'object' && account.jid) ?
        account.jid : account;

    send(jid, <presence type="unavailable"/>);
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
    if(isUp(account))
        _send(account.jid || account, stanza, handler);
    else if(stanza.name() == 'message' &&
            (stanza.ns_event::x != undefined || stanza.ns_chatstates::* != undefined))
        ;
    else if(stanza.name() == 'presence' &&
            stanza.@type == 'unavailable')
        ;
    else
        up(account, function(jid) { _send(jid, stanza, handler); });
}

function createChannel(features) {
    var channel = new Channel();

    channel.onRelease = function() {
        service.removeObserver(this, null);
        if(features)
            for each(var feature in features.ns_disco_info::feature) {
                service.removeFeature(feature.attribute('var'));
            }
    }

    if(features)
        for each(var feature in features.ns_disco_info::feature) {
            service.addFeature(feature.attribute('var'));
        }

    service.addObserver(channel, null, false);
    return channel;
}

function open(opts, continuation) {
    var conf = {
        node     : opts.node,
        domain   : opts.domain,
        resource : opts.resource,
        password : opts.password,
        host     : opts.host || domain,
        // ultimately will need to default to 5222+StartTLS. keeping to
        // 5223 for now until 5222+StartTLS is well tested.
        port     : opts.port || 5223,
        security : opts.security == undefined ? 1 : opts.security
    };

    // XXX restore multiple-connector support
    var connector = new XMPPTCPConnector(conf);

    connector.addObserver({
        observe: function(subject, topic, data) {
            switch(topic) {
            case 'active':
                if(continuation)
                    continuation();
                break;
            case 'error':
                if(subject instanceof Ci.nsIDOMElement) {
                    switch(subject.namespaceURI) {
                    case ns_sasl:
                        srvPrompt.alert(null, 'SASL Error', subject.firstChild.localName);
                        break;
                    case ns_stream:
                        srvPrompt.alert(null, 'Stream Error', subject.firstChild.localName);
                        break;
                    case ns_tls:
                        srvPrompt.alert(null, 'TLS Error', subject.firstChild.localName);
                        break;
                    case ns_stanzas:
                        srvPrompt.alert(null, 'Stanza Error', subject.firstChild.localName);
                        break;
                    default:
                        srvPrompt.alert(null, 'Unrecognized XMPP Error', serialize(subject));
                    }
                }
                else if(subject == 'bad-certificate') {
                    var addException = srvPrompt.confirm(
                        null, 'Bad certificate for Jabber server',
                        'Jabber server "' + conf.host + '" is presenting an invalid SSL certificate.\n' +
                            'To connect to it, you need to add an exception.  Do you want to proceed?');
                    if(!addException)
                        break;

                    var params = {
                        exceptionAdded : false,
                        location       : 'https://' + conf.host + ':' + conf.port,
                        prefetchCert   : true
                    };

                    setTimeout(function() {
                        openDialog(null,
                                   'chrome://pippki/content/exceptionDialog.xul',
                                   '',
                                   'chrome,centerscreen,modal',
                                   params);

                        if(params.exceptionAdded)
                            open(opts, continuation);
                    });
                } else {
                    Cu.reportError('Error during XMPP connection. (' + subject + ')');
                }

                break;
            }
        }
    });

    service.open(opts.node + '@' + opts.domain, connector);
}

function close(jid) {
    service.close(jid);
}


// UTILITIES
// ----------------------------------------------------------------------

function presenceWeight(presenceStanza) {
    if(presenceStanza.@type == 'unavailable')
        return 4;
    else
        switch(presenceStanza.show.toString()) {
        case 'chat':
        case '':
            return 0;
        case 'away':
            return 1;
        case 'xa':
            return 2;
        case 'dnd':
            return 3;
        default:
            dump('Warning: unknown <show/> value: ' +
                 presenceStanza.show.toString() + ' ' +
                 (new Error().stack) + '\n');
            return 4;
        }
}

function comparePresences(p1, p2) {
    if(p1.stanza.@type == p2.stanza.@type)
        return (parseInt(p2.stanza.priority.toString() || '0') -
                parseInt(p1.stanza.priority.toString() || '0') ||
                presenceWeight(p1.stanza) - presenceWeight(p2.stanza));
    else
        return (presenceWeight(p1.stanza) - presenceWeight(p2.stanza));
}

function connectorTypeFor(jid) {
    var m = JID(jid).hostname.match(/^(.+)\.x4m\.localhost$/);
    return m ? m[1] : 'tcp';
}

function q() {
    return new Query();
}


/**
 * Pattern matcher as used in channel.on().
 *
 */

function match(object, template) {
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
}

/**
 * Convert a DOM element to an E4X XML object.
 *
 * Assign converted object to DOM element behind the scenes, so that
 * if it requested to be converted again, there is no need to go
 * through serialization/deserialization again.
 *
 * (This assumes that the element is immutable.)
 *
 */

function dom2xml(element) {
    if(!element.__dom2xml_memo)
        element.__dom2xml_memo = new XML(serialize(element)).normalize();

    return element.__dom2xml_memo;
}

function uniq(array) {
    var encountered = [];

    return array.filter(
        function(item) {
            if(encountered.indexOf(item) == -1) {
                encountered.push(item);
                return true;
            } else
                return false;
        });
}

// The roster segment is a roster where the only entry is the
// contact we are connecting to (if in roster, otherwise it's
// empty).

function rosterSegment(account, address) {
    var roster = cache.first(q()
                             .event('iq')
                             .direction('in')
                             .account(account)
                             .child('jabber:iq:roster', 'query'));
    var segment =
        <iq type="result" from={account} to={account}>
        <query xmlns={ns_roster}/>
        </iq>;

    var item = roster.stanza..ns_roster::item.(@jid == address);
    if(item != undefined)
        segment.ns_roster::query.ns_roster::item = item;
    else
        segment.ns_roster::query.ns_roster::item = <item jid={address} subscription="none"/>

    return segment;
}

function presencesOf(account, address) {
    return cache
        .all(q()
             .event('presence')
             .account(account)
             .from(address))
        .sort(comparePresences);
};

function presenceSummary(account, address) {
    if(account && address)
        return presencesOf(account, address)[0] || {
            account   : account,
            direction : 'in',
            stanza    : <presence from={address} type='unavailable'/>
        }
    else {
        var presences = cache
            .all(q().event('presence').direction('out'))
            .filter(function(p) {
                return p.stanza.ns_muc::x == undefined && p.stanza.@to == undefined;
            })
            .sort(comparePresences);

        return presences[0] || {
            account   : account,
            direction : 'out',
            stanza    : <presence type='unavailable'/>
        }
    }
}

function setTimeout(action, delay) {
    if(typeof(delay) == 'undefined')
        delay = 0;

    return Cc['@mozilla.org/timer;1']
        .createInstance(Ci.nsITimer)
        .initWithCallback({ notify: action }, delay, Ci.nsITimer.TYPE_ONE_SHOT);
}

function clearTimeout(timer) {
    timeout.cancel();
}

function openDialog(parentWindow, url, windowName, features) {
    var array = Cc['@mozilla.org/array;1']
        .createInstance(Ci.nsIMutableArray);
    for(var i=4; i<arguments.length; i++) {
        var variant = Cc['@mozilla.org/variant;1']
            .createInstance(Ci.nsIWritableVariant);
        variant.setFromVariant(arguments[i]);
        array.appendElement(variant, false);
    }

    return Cc['@mozilla.org/embedcomp/window-watcher;1']
        .getService(Ci.nsIWindowWatcher)
        .openWindow(parentWindow, url, windowName, features, array);
}

// HYBRID-APP SUPPORT
// ----------------------------------------------------------------------

function enableContentDocument(panel, account, address, type, createSocket) {
    deprecation('use connectPanel() instead of enableContentDocument()');
    connectPanel(panel, account, address, createSocket);
}

function connectPanel(panel, account, address, createSocket) {
    if(panel.hasAttribute('account') &&
       panel.getAttribute('account') != account)
        throw new Error('Content panel already attached to different account. (' + account + ')');

    if(panel.hasAttribute('address') &&
       panel.getAttribute('address') != address)
        throw new Error('Contact panel already attached to different address. (' + address + ')');

    if(panel.xmppChannel) {
        log('Content panel already connected.');
        return;
    }

    var type = isMUC(account, address) ? 'groupchat' : 'chat';

    var appDoc = panel.contentDocument;
    if(createSocket)
        for each(var socketPartId in ['xmpp-incoming', 'xmpp-outgoing'])
            if(!appDoc.getElementById(socketPartId)) {
                var socketPart = appDoc.createElement('div');
                socketPart.setAttribute('style', 'display: none;');
                socketPart.setAttribute('id', socketPartId);
                appDoc.documentElement.appendChild(socketPart);
            }

    if(!(appDoc.getElementById('xmpp-incoming') &&
         appDoc.getElementById('xmpp-outgoing'))) {
        log('Missing xmpp sockets in shared application.');
        return;
    }


    function gotDataFromPage(stanza) {
        var caps = {
            set_type     : true,
            set_resource : true,
            set_address  : /^(file|chrome):\/\//.test(panel.currentURI.spec),
            track_iq     : /^(file|chrome):\/\//.test(panel.currentURI.spec)
        }

        if(stanza.@type == undefined && stanza.name() == 'message')
            stanza.@type = type;
        else if(caps.set_type)
            ;
        else
            throw new Error('Shared application tried to set message type.');

        if(stanza.@to == undefined)
            stanza.@to = address;
        else if(/^\/.+$/.test(stanza.@to.toString()) && caps.set_resource)
            stanza.@to = address + stanza.@to;
        else if(caps.set_address)
            ;
        else
            throw new Error('Shared application does not have enough privileges for requested operation');

        if(stanza.@from != undefined)
            throw new Error('Shared application tried to set @from attribute in outgoing stanza.');

        var replyHandler;
        if(stanza.localName() == 'iq' &&
           JID(stanza.@to).address != address &&
           caps.track_iq) {
            // When tracking IQs, remove id as set by remote
            // application by remember it, so that it can be set again
            // on the response.

            var requestId = stanza.@id.toString();
            delete stanza.@id;

            replyHandler = function(reply) {
                var s = reply.stanza.copy();

                if(requestId)
                    s.@id = requestid;
                else
                    delete s.@id;

                gotDataFromXMPP(s);
            };
        }

        send(account, stanza, replyHandler);
    }

    function gotDataFromXMPP(stanza) {
        appDoc.getElementById('xmpp-incoming').textContent =
            stanza.toXMLString();
    }

    // Assign the panel to the {account, address} pair.

    panel.setAttribute('account', account);
    panel.setAttribute('address', address);
    panel.contentWindow.addEventListener('unload', function(event) {
        if(event.target == panel.contentDocument)
            disableContentDocument(panel);
    }, true);

    // Presence from contact

    var contactPresence = presenceSummary(account, address);

    // MUC presence is the presence stanza we used to join the room
    // (if we are joining a room).

    var mucPresences;
    if(type == 'groupchat') {
        var mucPresencesOut =
            cache.all(q()
                      .event('presence')
                      .direction('out')
                      .account(account)
                      .to(address));
       var mucPresencesIn =
            cache.all(q()
                      .event('presence')
                      .direction('in')
                      .account(account)
                      .from(address));
        mucPresences = mucPresencesIn.concat(mucPresencesOut);
    }

    // Wire data coming from application to XMPP

    appDoc.getElementById('xmpp-outgoing').addEventListener(
        'DOMNodeInserted', function(event) {
            XML.prettyPrinting = false;
            XML.ignoreWhitespace = false;
            gotDataFromPage(new XML(event.target.textContent));
        }, false);

    // Select subset of XMPP traffic to listen to

    var channel = createChannel();
    panel.xmppChannel = channel;

    channel.on({
        direction : 'in',
        account   : account,
        stanza    : function(s) { return s != undefined && (JID(s.@from).address == address); }
    }, function(event) { gotDataFromXMPP(event.stanza); });

    channel.on({
        direction : 'out',
        event     : 'message',
        account   : account,
        stanza    : function(s) { return JID(s.@to).address == address; }
    }, function(message) {
        // Only echo messages to chat app if they're not groupchat.
        // groupchat ones will be echoed back to us by the server.
        if(message.stanza.@type != 'groupchat')
            gotDataFromXMPP(message.stanza);
    });


    gotDataFromXMPP(rosterSegment(account, address));

    if(contactPresence)
        gotDataFromXMPP(contactPresence.stanza);
    else
        gotDataFromXMPP(<presence from={address} type="unavailable"/>)
    if(mucPresences)
        mucPresences.forEach(
            function(mucPresence) { gotDataFromXMPP(mucPresence.stanza); });
}

function disableContentDocument(panel) {
    panel.removeAttribute('address');
    panel.removeAttribute('account');
    panel.xmppChannel.release();
    delete panel.xmppChannel;
}


// INTERNALS
// ----------------------------------------------------------------------

function _promptAccount(jid) {
    var params = {
        confirm: false,
        jid: jid,
        password: undefined
    };
    openDialog(null,
               'chrome://xmpp4moz/content/ui/signon.xul',
               'xmpp-signon', 'modal,centerscreen',
               params);
    return params;
}

function _up(account, onSessionActive) {
    var password, userInput;

    if(account) {
        if(account.password)
            password = account.password;
        else {
            userInput = _promptAccount(account.jid);
            if(userInput.confirm)
                password = userInput.password;
        }
    } else {
        userInput = _promptAccount();
        if(userInput.confirm) {
            account = accounts.get({jid: userInput.jid});
            password = userInput.password;
        }
    }

    if(!account)
        return;

    if(!(account.jid && password))
        return;

    if(isUp(account.jid)) { // remove in case of strange loops
        onSessionActive(account.jid);
        return;
    }


    var defaultInitialPresenceStanza = <presence/>;

    var j = JID(account.address);
    open({
        node: j.username,
        domain: j.hostname,
        resource: account.resource,
        password: password,
        host: account.connectionHost,
        port: account.connectionPort,
        security: account.connectionSecurity,
    }, function() {
        var presenceHistory = JSON.parse(account.presenceHistory || '[]');
        var newPresenceStanza;

        if(presenceHistory.length < 1)
            newPresenceStanza = defaultInitialPresenceStanza;

        else if(connectorTypeFor(account.jid) != 'tcp')
            // Play it safe: just plain presence for non-XMPP+TCP
            // accounts now, to avoid getting in the way of the
            // Twitter connector.
            newPresenceStanza = defaultInitialPresenceStanza;

        else if(presenceHistory.length >= 1)
            // Skip sequences of recent unavailable presences (there
            // should be only one, but you never know...)
            newPresenceStanza = presenceHistory.reduceRight(function(p1, p2) {
                var xmlP1 = new XML(p1);
                var xmlP2 = new XML(p2);

                return xmlP1.@type == undefined ? xmlP1 : xmlP2;
            }) || defaultInitialPresenceStanza;

        var caps = <c xmlns={ns_caps} hash='sha-1' node='http://hyperstruct.net/xmpp4moz' ver={service.getCapsHash()}/>;
        delete newPresenceStanza.ns_caps::*;
        newPresenceStanza.appendChild(caps);

        send(account.jid,
             <iq type='get'>
             <query xmlns='jabber:iq:roster'/>
             </iq>,
             function() {
                 send(account, newPresenceStanza);
                 if(onSessionActive)
                     onSessionActive(account.jid)
             });
    });
}

function _send(jid, stanza, handler) {
    var replyObserver;
    if(handler)
        replyObserver = {
            observe: function(replyStanza, topic, sessionName) {
                handler({
                    account: sessionName,
                    session: { name: sessionName }, // XXX hack
                    stanza: dom2xml(replyStanza)
                    });
            }
        };

    service.send(jid, asDOM(stanza), replyObserver);
}

function changedPresence(presence) {
    var account = accounts.get({jid: presence.account});
    if(!account)
        return;
    var stanza = presence.stanza.copy();
    delete stanza.@id;
    delete stanza.ns_x4m_in::meta;

    var history = JSON.parse(account.presenceHistory || '[]');

    if(history.length >= 5)
        history.splice(0, 4);

    history.push(stanza.toXMLString());
    account.presenceHistory = JSON.stringify(history);
}

function getAccountByJid(jid) {
    deprecation('XMPP.getAccountByJid');
    return accounts.get({jid: jid});
}

function getAccountByKey(key) {
    deprecation('XMPP.getAccountByKey');
    return accounts.get({key: key});
}


// DEVELOPER UTILITIES
// ----------------------------------------------------------------------

function deprecation(msg) {
    var frame = Components.stack.caller;

    var s = 'xmpp4moz :: DEPRECATION NOTICE :: "' + msg + '" in: \n';
    while(frame) {
        s += '  ' + frame + '\n';
        frame = frame.caller
    }
    Cu.reportError(s);
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
    var console = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService);
    log = function(msg) {
        console.logStringMessage('xmpp4moz: ' + msg);
    }
    log(msg);
}


// INITIALIZATION
// ----------------------------------------------------------------------

let(channel = createChannel()) {
    channel.on({
        // TODO for some reason, this does not catch <presence
        // type="unavailable"/> when synthesized, only when sent to the
        // network, which at the moment means "only when user
        // disconnects account explicitly".  This does what we want,
        // but it's not future-proof: if we decide that xmpp4moz will
        // need to behave nicely and send a <presence
        // type="unavailable"/> before closing the stream, we will
        // always record that, thus breaking the restore-presence
        // functionality.

        event     : 'presence',
        direction : 'out',
        stanza    : function(s) {
            return ((s.@type == undefined || s.@type == 'unavailable') &&
                    (s.@to == undefined));
        }
    }, function(presence) changedPresence(presence));
}

