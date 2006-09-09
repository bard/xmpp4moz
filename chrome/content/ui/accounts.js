window.addEventListener(
    'load', function(event) {
        xmppRefreshAccounts(
            document.getElementById('xmpp-menu-accounts'));
        if(typeof(xmppLoadedAccounts) == 'function')
            xmppLoadedAccounts();
    }, false);

function xmppRefreshAccounts(menuPopup) {
    while(menuPopup.firstChild &&
          menuPopup.firstChild.nodeName != 'menuseparator')
        menuPopup.removeChild(menuPopup.firstChild);
    
    for each(var account in XMPP.accounts) {
        var menuItem = document.createElement('menuitem');
        menuItem.setAttribute('label', account.jid);
        menuItem.setAttribute('value', account.jid);
        menuItem.setAttribute('class', 'menuitem-iconic');
        menuItem.setAttribute(
            'availability', XMPP.isUp(account.jid) ? 'available' : 'unavailable');

        for each(var presence in XMPP.cache.presenceOut) 
            if(presence.session.name == account.jid && 
               presence.stanza.show != undefined) {
                menuItem.setAttribute('show', presence.stanza.show);
                break;
            }

        menuPopup.insertBefore(menuItem, menuPopup.firstChild);
    }
}

