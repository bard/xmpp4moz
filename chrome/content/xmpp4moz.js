
Components
.classes['@mozilla.org/moz/jssubscript-loader;1']
.getService(Components.interfaces.mozIJSSubScriptLoader)
.loadSubScript('chrome://xmpp4moz/content/xmpp.js');

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

function xmppToggleSidebar() {
    var sidebar = document.getElementById('xmpp-sidebar');
    var splitter = document.getElementById('xmpp-splitter');

    if(sidebar.collapsed) {
        sidebar.collapsed = false;
        splitter.hidden = false;
    } else {
        sidebar.collapsed = true;
        splitter.hidden = true;
    }
}

// function xmppConnect() {
//     var connectionParams = {
//         userAddress: undefined,
//         userPassword: undefined,
//         userServerHost: undefined,
//         userServerPort: undefined,
//         confirm: false
//     };
//     window.openDialog(
//         'chrome://xmpp4moz/content/connect.xul', 'connect',
//         'chrome,modal,centerscreen', connectionParams);

//     if(!connectionParams.confirm)
//         return;

//     userJid = connectionParams.userAddress + '/Mozilla';
        
//     XMPP.up(
//         userJid, { password: connectionParams.userPassword,
//                 server: connectionParams.userServerHost,
//                 port: connectionParams.userServerPort });
// }

// function xmppDisconnect() {
//     XMPP.down(XMPP.activeSessionNames[0]);
// }

function xmppDebug() {
    window.open('chrome://xmpp4moz/content/debug.xul', 'xmpp-debug', 'chrome,alwaysRaised');
}

function xmppPopulateAccountMenu() {
    var menuPopup = document.getElementById('xmpp-accounts');

    var i = menuPopup.childNodes.length - 1;
    while(i >= 0) {
        var menuItem = menuPopup.childNodes[i];
        menuPopup.removeChild(menuItem);
        i--;
    }

    for each(var account in XMPP.accounts) {
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
    }

    menuPopup.appendChild(document.createElement('menuseparator'));
    var menuItem = document.createElement('menuitem');
    menuItem.setAttribute('label', 'Add or modify...');
    menuPopup.appendChild(menuItem);   
}