// GLOBAL STATE
// ----------------------------------------------------------------------

var xmppChannel = XMPP.createChannel();

var xmppEnabledDocuments = {
    _links: [],

    add: function(document, account, address, type) {
        if(this.has(document))
            return false;
        
        var link = {
            account: account,
            address: address,
            type: type,
            channel: undefined,
            document: document
        }

        this._links.push(link);
        return true;
    },

    remove: function(document) {
        for(var i=0, l=this._links.length; i<l; i++) 
            if(this._links[i].document == document) {
                this._links.splice(i, 1);
                return;
            }
    },

    get: function(document) {
        for(var i=0, l=this._links.length; i<l; i++) 
            if(this._links[i].document == document)
                return this._links[i];
    },

    has: function(document) {
        return this.get(document) != undefined;
    }
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

// Changing availability and show attributes on toolbar button based
// on a summary of presences of connected accounts.

xmppChannel.on(
    { event: 'presence', direction: 'out', stanza: function(s) {
            return s.@type == undefined;
        }},
    function(presence) {
        var summary = XMPP.presenceSummary();
        var button = document.getElementById('xmpp-button');
        button.setAttribute('availability', summary.stanza.@type.toString() || 'available');
        button.setAttribute('show', summary.stanza.show.toString());
    });

xmppChannel.on(
    { event: 'stream', direction: 'out', state: 'close' },
    function(stream) {
        if(XMPP.accounts.every(XMPP.isDown)) {
            var button = document.getElementById('xmpp-button');
            button.setAttribute('availability', 'unavailable');
            button.setAttribute('show', '');
        }
    });


// GUI ACTIONS
// ----------------------------------------------------------------------

function xmppDisableContent(document) {
    if(xmppEnabledDocuments.remove(document || content.document))
        xmppRefreshContent();
}

function xmppEnableContent(account, address, type) {
    var appDoc = content.document;
    
    if(xmppEnabledDocuments.has(appDoc))
        return;

    // BOOKKEEPING
    
    xmppEnabledDocuments.add(appDoc, account, address, type);

    appDoc.addEventListener(
        'unload', function() {
            channel.release();
            xmppEnabledDocuments.remove(appDoc);
        }, false);

    xmppRefreshContent();

    // CONTENT

    function gotDataFromPage(text) {
        var message = new XML(text);
        message.@to = /^\/.+$/.test(message.@to.toString()) ?
            address + message.@to : address;
        if(message.@type == undefined)
            message.@type = type;
        XMPP.send(account, message)        
    }

    appDoc.getElementById('output').addEventListener(
        'DOMNodeInserted', function(event) {
            gotDataFromPage(event.target.textContent);
        }, false);

    // NETWORK

    var channel = XMPP.createChannel();

    function gotDataFromXMPP(data) {
        appDoc.getElementById('input').textContent =
            data.stanza.toXMLString();
    }

    channel.on({
        direction: 'in',
        event: 'message',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return (XMPP.JID(s.@from).address == address);
            }
        }, function(message) { gotDataFromXMPP(message); });
    
    channel.on({
        event: 'presence',
        direction: 'in',
        session: function(s) {
                return s.name == account;
            },
        stanza: function(s) {
                return XMPP.JID(s.@from).address == address;
            }
        }, function(presence) { gotDataFromXMPP(presence); });

    if(type != 'groupchat')
        channel.on({
            direction: 'out',
            event: 'message',
            session: function(s) {
                    return s.name == account;
                },
            stanza: function(s) {
                    return XMPP.JID(s.@to).address == address;
                }
            }, function(message) { gotDataFromXMPP(message); });

    for each(var presence in XMPP.cache.presenceIn)
        if(presence.session.name == account &&
           XMPP.JID(presence.stanza.@from).address == address)
            gotDataFromXMPP(presence);
}

function xmppRefreshContent() {
    var link = xmppEnabledDocuments.get(content.document);
    var toolbox = document.getElementById('xmpp-toolbox');

    if(link) {
        for each(var role in ['account', 'address']) 
            toolbox.getElementsByAttribute('role', role)[0]
                .value = link[role];
        toolbox.hidden = false;
    } else
        toolbox.hidden = true;
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
    for each(var account in XMPP.accounts) {
        if(XMPP.isUp(account)) {
            if(type == 'unavailable')
                XMPP.down(account);
            else {
                var stanza;
                for each(var presence in XMPP.cache.presenceOut) 
                    if(presence.session.name == account.jid) {
                        stanza = presence.stanza.copy();
                        break;
                    }

                stanza = stanza || <presence/>;

                switch(type) {
                case 'available':
                    delete stanza.show;
                    break;
                case 'away':
                    stanza.show = <show>away</show>;
                    break;
                case 'dnd':
                    stanza.show = <show>dnd</show>;
                    break;
                }
                XMPP.send(account, stanza);
            }
        }
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

