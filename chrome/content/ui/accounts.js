// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};


// GUI REACTIONS
// ----------------------------------------------------------------------

window.addEventListener(
    'load', function(event) {
        xmpp.ui.refreshAccounts(
            document.getElementById('xmpp-menu-accounts'));
        if(typeof(xmpp.ui.loadedAccounts) == 'function')
            xmpp.ui.loadedAccounts();
    }, false);


// GUI ACTIONS
// ----------------------------------------------------------------------

xmpp.ui.refreshAccounts = function(menuPopup) {
    while(menuPopup.firstChild &&
          menuPopup.firstChild.nodeName != 'menuseparator')
        menuPopup.removeChild(menuPopup.firstChild);
    
    for each(var account in XMPP.accounts) {
        var menuItem = document.createElement('menuitem');
        menuItem.setAttribute('label', account.jid);
        menuItem.setAttribute('value', account.jid);
        menuItem.setAttribute('class', 'menuitem-iconic');

        var accountPresence = { stanza: <presence type="unavailable"/> };
        for each(var presence in XMPP.cache.presenceOut) 
            if(presence.session.name == account.jid) {
                accountPresence = presence;
                break;
            }

        menuItem.setAttribute('availability',
                              accountPresence.stanza.@type == undefined ?
                              'available' : 'unavailable')

        menuItem.setAttribute('show',
                              accountPresence.stanza.show.toString());

        menuPopup.insertBefore(menuItem, menuPopup.firstChild);
    }
}

