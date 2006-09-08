// GLOBAL STATE
// ----------------------------------------------------------------------

var xmppChannel = XMPP.createChannel();

var xmppEnabledLocations = {
    add: function(uri, account, address, type) {
        uri = stripUriFragment(uri);
        
        var location = {
            account: account,
            address: address,
            type: type,
            channel: undefined,
            active: false
        }
        
        this._locations[uri] = location;
        return location;
    },

    remove: function(uri) {
        uri = stripUriFragment(uri);
        
        this._locations[uri] = undefined;
        delete this._locations[uri];
    },

    get: function(uri) {
        uri = stripUriFragment(uri);
        
        return this._locations[uri];
    },

    has: function(uri) {
        uri = stripUriFragment(uri);

        if(this._locations[uri])
            return true;
    },

    // INTERNALS

    _locations: {}
};


// UTILITIES
// ----------------------------------------------------------------------

// XXX remove from global namespace or rename
function stripUriFragment(uri) {
    var hashPos = uri.lastIndexOf('#');
    return (hashPos != -1 ?
            uri.slice(0, hashPos) :
            uri);
}


// NETWORK REACTIONS
// ----------------------------------------------------------------------

// Show progress bar when waiting for connection

xmppChannel.on(
    { event: 'stream', direction: 'out', state: 'open' },
    function(stream) {
        document
            .getElementById('xmpp-connecting-account').value = stream.session.name;
        document
            .getElementById('xmpp-status').hidden = false;
    });

// Hiding progress bar when stream is closed

xmppChannel.on(
    { event: 'stream', state: 'close' },
    function(stream) {
        if(document)
            document
                .getElementById('xmpp-status').hidden = true;
    });

// Hiding progress bar when authentication is accepted

xmppChannel.on(
    { event: 'iq', direction: 'out', stanza: function(s) {
            return (s.@type == 'set' &&
                    s.*::query.length() > 0 &&
                    s.*::query.name().uri == 'jabber:iq:auth') }},
    function(iq) {
        xmppChannel.on({
            event: 'iq',  // TODO: need one-shot listeners here!
            direction: 'in',
            session: function(s) {
                    return s.name == iq.session.name;
                },
            stanza: function(s) {
                    return s.@id == iq.stanza.@id;
                }},
            function(reply) {
                document.
                    getElementById('xmpp-status').hidden = true;
            });
    });

// Changing availability attribute on toolbar button when at least one
// account is online

xmppChannel.on(
    { event: 'presence', direction: 'out' },
    function(presence) {
        if(presence.stanza.@type == undefined)
            document
                .getElementById('xmpp-button')
                .setAttribute('availability', 'available');
    });

xmppChannel.on(
    { event: 'stream', direction: 'out' },
    function(stream) {
        if(stream.state == 'close')
            if(XMPP.accounts.every(XMPP.isDown))
                document.getElementById('xmpp-button')
                    .setAttribute('availability', 'unavailable')
    });


// GUI ACTIONS
// ----------------------------------------------------------------------

function xmppEnableContent(account, address, type) {
    var uri = stripUriFragment(content.document.location.href);
    var appNS = new Namespace(uri);
    
    if(xmppEnabledLocations.has(uri))
        return;

    // BOOKKEEPING
    
    xmppEnabledLocations.add(uri, account, address, type);
    
    content.addEventListener(
        'unload', function() {
            channel.release();
            xmppEnabledLocations.remove(uri);
        }, false);

    xmppRefreshContent();

    // CONTENT

    function gotDataFromPage(text) {
        var message = new XML(text);
        message.@to = address;
        message.@type = type;
        XMPP.send(account, message)        
    }
    
    content.document.getElementById('output').addEventListener(
        'DOMNodeInserted', function(event) {
            gotDataFromPage(event.target.textContent);
        }, false);

    // NETWORK

    var channel = XMPP.createChannel();

    function gotDataFromXMPP(message) {
        content.document.getElementById('input').textContent = message.stanza.toXMLString();
    }

    channel.on({
            direction: 'in',
            event: 'message',
            session: function(s) {
                return s.name == account;
            },
            stanza: function(s) {
                return (s.appNS::x.length() > 0 &&
                        XMPP.JID(s.@from).address == address);
            }
        }, function(message) { gotDataFromXMPP(message); });

    if(type != 'groupchat')
        channel.on({
            direction: 'out',
            event: 'message',
            session: function(s) {
                    return s.name == account;
                },
            stanza: function(s) {
                    return (s.appNS::x.length() > 0 &&
                            XMPP.JID(s.@to).address == address);
                }
            }, function(message) { gotDataFromXMPP(message); });

}

function xmppRefreshContent() {
    var xmppLocation = xmppEnabledLocations.get(content.location.href);
    var toolbox = document.getElementById('xmpp-toolbox');

    if(xmppLocation) 
        for each(var role in ['account', 'address', 'type']) {
            toolbox.getElementsByAttribute('role', role)[0]
                .value = xmppLocation[role];
        }

    toolbox.hidden = !xmppLocation;
}

function xmppAddToolbarButton() {
    var toolbox = document.getElementById('navigator-toolbox');
    var toolbar = toolbox.getElementsByAttribute('id', 'nav-bar')[0];
        
    if(toolbar &&
       toolbar.currentSet.indexOf('xmpp-button') == -1 &&
       toolbar.getAttribute('customizable') == 'true') {

        toolbar.currentSet = toolbar.currentSet.replace(
            /urlbar-container/,
            'xmpp-button,urlbar-container');
        toolbar.setAttribute('currentset', toolbar.currentSet);
        toolbox.ownerDocument.persist(toolbar.id, 'currentset');
    }
}


// GUI REACTIONS
// ----------------------------------------------------------------------

window.addEventListener(
    'load', function(event) {
        var prefBranch = Components
            .classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefBranch);

        if(prefBranch.getBoolPref('xmpp.firstInstall')) {
            prefBranch.setBoolPref('xmpp.firstInstall', false);
            xmppAddToolbarButton();
        }
    }, false);

var xmppLocationChangeListener = {
    QueryInterface: function(aIID) {
        if(aIID.equals(Components.interfaces.nsIWebProgressListener) ||
           aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
           aIID.equals(Components.interfaces.nsISupports))
            return this;
        throw Components.results.NS_NOINTERFACE;
    },
    onLocationChange: function(aProgress, aRequest, aURI) {
        xmppRefreshContent();
    },
    onStateChange: function(aProgress, aRequest, aStateFlags, aStatus) {},
    onProgressChange: function() {},
    onStatusChange: function() {},
    onSecurityChange: function() {},
    onLinkIconAvailable: function() {}
};

window.addEventListener(
    'load', function(event) {
        getBrowser().addProgressListener(xmppLocationChangeListener);
    }, false);

function xmppChangeStatus(type) {
    for each(var account in XMPP.accounts)
        if(XMPP.isUp(account)) 
            switch(type) {
            case 'online':
                XMPP.send(account, <presence/>);
                break;
            case 'away':
                XMPP.send(account, <presence><show>away</show></presence>);
                break;
            case 'dnd':
                XMPP.send(account, <presence><show>dnd</show></presence>);
                break;
            case 'offline':
                XMPP.down(account.jid);
                break;
            }
}


// HOOKS
// ----------------------------------------------------------------------

function xmppSelectedAccount(accountJid) {
    if(XMPP.isUp(accountJid))
        XMPP.down(accountJid);
    else
        XMPP.up(accountJid);
}

