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


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};


// GUI ACTIONS
// ----------------------------------------------------------------------

xmpp.ui.refreshAccounts = function(menuPopup) {
    var ns_muc = 'http://jabber.org/protocol/muc';

    while(menuPopup.firstChild &&
          menuPopup.firstChild.nodeName != 'menuseparator')
        menuPopup.removeChild(menuPopup.firstChild);

    XMPP.accounts.forEach(
        function(account) {
            var menuItem = document.createElement('menuitem');
            menuItem.setAttribute('label', account.jid);
            menuItem.setAttribute('value', account.jid);
            menuItem.setAttribute('class', 'menuitem-iconic');

            var accountPresence =
                XMPP.cache.first(XMPP.q()
                                 .event('presence')
                                 .account(account.jid)
                                 .direction('out')) ||
                { stanza: <presence type="unavailable"/> };

            menuItem.setAttribute('availability',
                                  accountPresence.stanza.@type == undefined ?
                                  'available' : 'unavailable')

            menuItem.setAttribute('show',
                                  accountPresence.stanza.show.toString());

            menuPopup.insertBefore(menuItem, menuPopup.firstChild);
        })
};
