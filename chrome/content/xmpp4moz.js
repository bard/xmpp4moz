var xmppChannel = XMPP.createChannel();

// Show most recent message in toolbar
xmppChannel.on(
    { event: 'message', direction: 'in', stanza: function(s) { return s.body && s.body.toString(); }},
    function(message) {
        document
            .getElementById('xmpp-last-speaker')
            .value = message.stanza.@from + ': ';
        document
            .getElementById('xmpp-last-message')
            .value = message.stanza.body;
    });

// Show connection status
xmppChannel.on(
    { event: 'stream', direction: 'out', state: 'open' },
    function(stream) {
        document
            .getElementById('xmpp-connecting-account').value = stream.session.name;
        document
            .getElementById('xmpp-status').hidden = false;
    });
xmppChannel.on(
    { event: 'stream', state: 'close' },
    function(stream) {
        document
            .getElementById('xmpp-status').hidden = true;
    });

xmppChannel.on(
    { event: 'iq', direction: 'out', stanza: function(s) {
            return (s.@type == 'set' &&
                    s.*::query.length() > 0 &&
                    s.*::query.name().uri == 'jabber:iq:auth') }},
    function(iq) {
        xmppChannel.on( // TODO: need one-shot listeners here!
            { event: 'iq', direction: 'in', session: iq.session, stanza: function(s) {
                    return s.@id == iq.stanza.@id;
                }},
            function(reply) {
                document.
                    getElementById('xmpp-status').hidden = true;
            });
    });



function xmppToggleLivebar() {
    var sidebar = document.getElementById('livebar');
    var splitter = document.getElementById('xmpp-splitter');

    if(sidebar.collapsed) {
        sidebar.collapsed = false;
        splitter.hidden = false;
    } else {
        sidebar.collapsed = true;
        splitter.hidden = true;
    }
}

function xmppOpenTracer() {
    window.open('chrome://xmpp4moz/content/debug.xul', 'xmpp-session-tracer', 'chrome,alwaysRaised');
}

// ----------------------------------------------------------------------
// HOOKS

function xmppSelectedAccount(accountJid) {
    XMPP.isUp(accountJid) ?
        XMPP.down(accountJid) :
        XMPP.up(accountJid);
}
