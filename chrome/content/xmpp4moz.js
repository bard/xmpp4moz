var xmppChannel = XMPP.createChannel();
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

function xmppPopulateAccountMenu() {
    var menuPopup = document.getElementById('xmpp-menu-accounts');

    deleteChildren(menuPopup);
    
    XMPP.accounts.forEach(
        function(account) {
            var menuItem = document.createElement('menuitem');
            menuItem.addEventListener(
                'command', function(event) {
                    var jid = account.address + '/' + account.resource;
                    XMPP.isUp(jid) ? XMPP.down(jid) : XMPP.up(jid);
                }, false);
            menuItem.setAttribute('label', account.address);
            menuItem.setAttribute('type', 'checkbox');
            if(XMPP.isUp(account.address + '/' + account.resource))
                menuItem.setAttribute('checked', 'true');
            menuPopup.appendChild(menuItem);            
        });

    menuPopup.appendChild(document.createElement('menuseparator'));
    var menuItem = document.createElement('menuitem');
    menuItem.setAttribute('label', 'Add or modify...');
    menuItem.addEventListener(
        'command', function(event) {
            window.openPreferences('xmpp-pane');
        }, false);
    menuPopup.appendChild(menuItem);   
}

// ----------------------------------------------------------------------
// UTILITIES

function deleteChildren(container) {
    var i = container.childNodes.length - 1;
    while(i >= 0) {
        var child = container.childNodes[i];
        container.removeChild(child);
        i--;
    }
}
