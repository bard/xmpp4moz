/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is xmpp4moz.
 *
 * The Initial Developer of the Original Code is
 * Massimiliano Mirra <bard [at] hyperstruct [dot] net>.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var xmpp = xmpp || {};
xmpp.ui = xmpp.ui || {};

const ns_roster = new Namespace('jabber:iq:roster');

const stanzaTemplates = {
    message: {
        'Plain':     <message type="normal" to=""/>,

        'Groupchat': <message type="groupchat" to=""/>
    },

    iq: {
        'Plain': <iq/>,

        'Disco/Info': 
        <iq type="get" to="">
        <query xmlns="http://jabber.org/protocol/disco#info"/>
        </iq>,

        'Disco/Items': 
        <iq type="get" to="">
        <query xmlns="http://jabber.org/protocol/disco#items"/>
        </iq>,

        'vCard': <iq to="" type="get"><vCard xmlns="vcard-temp"/></iq>,

        'Roster': <iq type="get"><query xmlns="jabber:iq:roster"/></iq>,

        'Password Change':
        <iq type="set">
        <query xmlns="jabber:iq:register">
        <username>USERNAME</username>
        <password>NEW PASSWORD</password>
        </query>
        </iq>,

        'Time':
        <iq type="get" to=""><query xmlns="jabber:iq:time"/></iq>,

        'Set Bookmarks':
        <iq type="set">
        <query xmlns="jabber:iq:private">
        <storage xmlns="storage:bookmarks">
        <conference name="ROOM NAME" autojoin="true OR false" jid="ROOM JID">
        <nick>NICK TO USE IN ROOM (OPTIONAL)</nick>
        <password>PASSWORD (OPTIONAL)</password>
        </conference>
        </storage>
        </query>
        </iq>,

        'Get Bookmarks':
        <iq type="get">
        <query xmlns="jabber:iq:private">
        <storage xmlns="storage:bookmarks"/>
        </query>
        </iq>,

        'PEP/Create Collection Node':
        <iq type="set">
        <pubsub xmlns="http://jabber.org/protocol/pubsub">
        <create node="NODE NAME"/>
        <configure>
        <x type="submit" xmlns="jabber:x:data">
        <field var="FORM_TYPE" type="hidden">
        <value>http://jabber.org/protocol/pubsub#node_config</value>
        </field>
        <field var="pubsub#node_type">
        <value>collection</value>
        </field>
        </x>
        </configure>
        </pubsub>
        </iq>,

        'PEP/Delete Node':
        <iq type="set">
        <pubsub xmlns="http://jabber.org/protocol/pubsub#owner">
        <delete node="NODE NAME"/>
        </pubsub>
        </iq>,

        'Get room configuration':
        <iq type="get" to="ROOM ID">
        <query xmlns="http://jabber.org/protocol/muc#owner"/>
        </iq>
    },

    presence: {
        'Plain': <presence/>
    }
};


// GLOBAL STATE
// ----------------------------------------------------------------------

var channel;
var inputHistory = [];
var inputHistoryCursor;


// GUI INITIALIZATION/FINALIZATION
// ----------------------------------------------------------------------

function init(event) {
    channel = XMPP.createChannel();

    function logEvent(event) { display(event.account, event.direction, event.stanza.toXMLString());}
    channel.on({event: 'message'}, logEvent);
    channel.on({event: 'iq'}, logEvent)
    channel.on({event: 'presence'}, logEvent)    

    channel.on(
        {event: 'presence', direction: 'in'}, function(presence) {
            refreshPresenceInCache();
        });

    channel.on(
        {event: 'presence', direction: 'out'}, function(presence) {
            refreshPresenceOutCache();
        });

    channel.on(
        {event: 'iq', direction: 'in', stanza: function(s) {
                return s.ns_roster::query.length() > 0;
            }},
        function(iq) {
            refreshRosterCache();
        });

    refreshPresenceInCache();
    refreshPresenceOutCache();
    refreshRosterCache();

    fillTemplateMenu();

    xmpp.ui.refreshAccounts(_('xmpp-popup-accounts'));

    var result;
    XMPP.accounts.forEach(
        function(account) {
            if(result)
                return;
            if(XMPP.isUp(account.jid))
                result = account;
        });
    if(result)
        _('accounts').value = result.jid;


    _('input').focus();
}

function finish() {
    channel.release();
}


// GUI UTILITIES (GENERIC)
// ----------------------------------------------------------------------

function scrollingOnlyIfAtBottom(window, action) {
    var shouldScroll = ((window.scrollMaxY - window.pageYOffset) < 24);
    action();
    if(shouldScroll)
        window.scrollTo(0, window.scrollMaxY);
}

function _(id) {
    return document.getElementById(id);
}

function getDescendantByAttribute(element, attrName, attrValue) {
    for each(var child in element.childNodes) {
        if(child.nodeType == Node.ELEMENT_NODE) {
            if(child.getAttribute(attrName) == attrValue)
                return child;
            else {
                var descendant = getDescendantByAttribute(child, attrName, attrValue);
                if(descendant)
                    return descendant;                
            }
        }
    }
    return null;
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function refreshPresenceInCache() {
    _('cache-presence-in').value = '';

    var presencesByAccount = {};
    XMPP.cache.fetch({event: 'presence', direction: 'in'}).forEach(
        function(presence) {
            if(!presencesByAccount[presence.session.name])
                presencesByAccount[presence.session.name] = [];
            presencesByAccount[presence.session.name].push(presence);
        });

    var lines = [];
    for(var account in presencesByAccount) {
        lines.push('**** ACCOUNT: ' + account + ' ****');
        for each(var presence in presencesByAccount[account])
            lines.push(presence.stanza.toXMLString());
    }

    _('cache-presence-in').value = lines.join('\n');
}

function refreshPresenceOutCache() {
    _('cache-presence-out').value =
        XMPP.cache.fetch({
            event: 'presence',
            direction: 'out'})
        .map(
            function(presence) {
                return presence.stanza.toXMLString();
            })
        .join('\n');
}

function refreshRosterCache() {
    _('cache-roster').value =
        XMPP.cache.fetch({
            event: 'iq', direction: 'in',
            stanza: function(s) {
                    return s.ns_roster::query != undefined;
                }})
        .map(
            function(iq) {
                return iq.stanza.toXMLString();
            })
        .join('\n');
}

function fillTemplateMenu() {
    for(var templateType in stanzaTemplates) 
        for(var templateName in stanzaTemplates[templateType]) {
            var menuItem = document.createElement('menuitem');
            menuItem.setAttribute('label', templateName);
            _('templates-' + templateType).appendChild(menuItem);
        }    
}

function clearLog() {
    var logEntries = _('log').contentDocument.getElementById('entries');
    while(logEntries.firstChild)
        logEntries.removeChild(logEntries.firstChild);
}

function display(account, direction, content) {
    var logDoc = _('log').contentDocument;
    var logEntry = logDoc.getElementById('entry').cloneNode(true);

    getDescendantByAttribute(logEntry, 'class', 'account')
        .textContent = account;
    getDescendantByAttribute(logEntry, 'class', 'direction')
        .textContent = (direction == 'in' ? 'S' : 'C');
    getDescendantByAttribute(logEntry, 'class', 'content')
        .textContent = content;
    logEntry.style.display = null;

    scrollingOnlyIfAtBottom(
        logDoc.defaultView, function() {
            logDoc.getElementById('entries')
                .appendChild(logEntry);
        });
}


// ----------------------------------------------------------------------
// GUI REACTIONS

function requestedTemplateInsertion(templateType, event) {
    var templateName = event.target.getAttribute('label');
    _('input').value += 
        stanzaTemplates[templateType][templateName].toXMLString();
}

function gotoHistoryPrevious() {
    if(inputHistoryCursor == 0)
        inputHistoryCursor = inputHistory.length-1;
    else
        inputHistoryCursor--;
        
    _('input').value = inputHistory[inputHistoryCursor];
}

function gotoHistoryNext() {
    if(inputHistoryCursor == inputHistory.length-1)
        inputHistoryCursor = 0;
    else
        inputHistoryCursor++;
        
    _('input').value = inputHistory[inputHistoryCursor];    
}

function pressedKeyInInputArea(event) {
    var textBox = event.currentTarget;

    if(!event.ctrlKey)
        return;
    
    switch(event.keyCode) {
    case KeyEvent.DOM_VK_UP:
        event.preventDefault();
        gotoHistoryPrevious();
        break;
    case KeyEvent.DOM_VK_DOWN:
        event.preventDefault();
        gotoHistoryNext();
        break;
    case KeyEvent.DOM_VK_RETURN:
        event.preventDefault();
                
        if(textBox.value.match(/^\s*$/))
            return;

        try {
            sendStanza(_('accounts').value, new XML(textBox.value));
            textBox.value = '';
        } catch(e) {
            alert(e);
        }
        break;
    }
}

function requestedSend() {
    try {
        sendStanza(_('accounts').value, new XML(_('input').value));
        _('input').value = '';
    } catch(e) {
        alert(e)
    }
}


// ----------------------------------------------------------------------
// NETWORK ACTIONS

function sendStanza(account, xml) {
    XMPP.send(account, xml);
    inputHistoryCursor = 0;
    inputHistory.push(xml.toXMLString());
}

