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

var Cc = Components.classes;
var Ci = Components.interfaces;


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

function tryQuery(textbox) {
    var q = textbox.value;
    var results;
    try {
        switch(q[0]) {
        case '/':
            results = XMPP.service.wrappedJSObject.cache.all(q);
            break;
        case '{':
            results = XMPP.service.wrappedJSObject.cache.fetch(eval('(' + q + ')'));
            break;
        default:
            results = XMPP.service.wrappedJSObject.cache.all(
                eval('(new Query()).' + q + '.compile()'));
        }
        textbox.style.color = '';
    } catch(e) {
        textbox.style.color = 'red';
    }

    if(results) {
        var entries;
        if('length' in results) {
            entries = results.map(function(result) {
                return new XML(serialize(result.stanza)).toXMLString();
            });
        } else {
            entries = [];
            for(var i=0; i<results.snapshotLength; i++)
                entries.push((new XML(serialize(results.snapshotItem(i)))).toXMLString());
        }

        _('query-results').value = entries.join('\n\n');
    }
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


// UTILITIES
// ----------------------------------------------------------------------

function serialize(node) {
    return (Cc['@mozilla.org/xmlextras/xmlserializer;1']
            .getService(Ci.nsIDOMSerializer)
            .serializeToString(node));
}
