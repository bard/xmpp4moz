var xmppChannel = XMPP.createChannel();

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

// ----------------------------------------------------------------------
// HOOKS

function xmppSelectedAccount(accountJid) {
    XMPP.isUp(accountJid) ?
        XMPP.down(accountJid) :
        XMPP.up(accountJid);
}
