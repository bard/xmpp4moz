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

// XXX remove from global namespace or rename
function JID(string) {
    var m = string.match(/^(.+?)@(.+?)(?:\/|$)(.*$)/);
    var jid = {
        username: m[1],
        hostname: m[2],
        resource: m[3],
        nick: m[3],
        address: m[1] + '@' + m[2],
        full: m[3] ? string : null
    }

    return jid;
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
        var indicator = document.getElementById('xmpp-button');
        if(presence.stanza.@type == undefined)
            indicator.setAttribute('availability', 'available');
        else if(presence.stanza.@type == 'unavailable')
            if(XMPP.accounts.every(XMPP.isDown))
                indicator.setAttribute('availability', 'unavailable');
    });


// GUI ACTIONS
// ----------------------------------------------------------------------

function xmppEnableContent(account, address, type) {
    var uri = stripUriFragment(content.document.location.href);
    var appNS = new Namespace(uri);
    
    // BOOKKEEPING

    xmppEnabledLocations.add(uri, account, address, type);
    
    content.addEventListener(
        'unload', function() {
            channel.release();
            xmppEnabledLocations.remove(uri);
        }, false);

    xmppRefreshContent();

    // CONTENT

    function receivedContentInput(text) {
        var message = <message to={address} type={type}/>;
        message.text = new XML(text);             
        XMPP.send(account, message)        
    }
    
    content.document.getElementById('output').addEventListener(
        'DOMNodeInserted', function(event) {
            receivedContentInput(event.target.textContent);
        }, false);

    // NETWORK

    var channel = XMPP.createChannel();

    function receivedNetworkInput(message) {
        if(message.stanza.appNS::x.length() > 0) {
            var payload = message.stanza.appNS::x.*[0].toXMLString();
            content.document.getElementById('input').textContent = payload;
        }
    }

    channel.on({
        event: 'message',
        direction: 'in',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return (s.@type == type &&
                        JID(s.@from).address == address &&
                        s.appNS::x.length() > 0);
            }},
        function(message) { receivedNetworkInput(message); });
}

// XXX remove parameter, it will always work on current browser

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

function xmppToggleLivebar() {
    var sidebar = document.getElementById('livebar');
    var splitter = document.getElementById('livebar-splitter');

    if(sidebar.collapsed) {
        sidebar.collapsed = false;
        splitter.hidden = false;
    } else {
        sidebar.collapsed = true;
        splitter.hidden = true;
    }
}

function xmppShowLivebar() {
    document.getElementById('livebar').collapsed = false;
    document.getElementById('livebar-splitter').hidden = false;
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
        gBrowser.addProgressListener(xmppLocationChangeListener);
    }, false);


// HOOKS
// ----------------------------------------------------------------------

function xmppSelectedAccount(accountJid) {
    if(XMPP.isUp(accountJid))
        XMPP.down(accountJid);
    else
        XMPP.up(accountJid);
}

