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

const ns_xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const ns_xulx = 'http://hyperstruct.net/xul-extensions';
const ns_html = 'http://www.w3.org/1999/xhtml';
const ns_xmpp = 'http://hyperstruct.net/xmpp';
const ns_info = 'http://jabber.org/protocol/disco#info';
const ns_items = 'http://jabber.org/protocol/disco#items';


// GLOBAL STATE
// ----------------------------------------------------------------------

var channel;
var debugMode;


// GUI INITIALIZATION AND FINALIZATION
// ----------------------------------------------------------------------

function init(event) {
    channel = XMPP.createChannel();

    channel.on(
        {event: 'iq', direction: 'in', stanza: function(s) {
                return s.ns_info::query.length() > 0;
            }},
        function(iq) { receivedInfo(iq); });

    channel.on(
        {event: 'iq', direction: 'in', stanza: function(s) {
                return s.ns_items::query.length() > 0;
            }},
        function(iq) { receivedItems(iq); });

    if(debugMode)
        document.addEventListener(
            'mouseover', function(event) {
                if(!event.target.hasAttributeNS)
                    return;
            
                document.getElementById('status').label =
                    'JID: ' + attr(event.target, 'xmpp:jid') +
                    ', Node: ' + attr(event.target, 'xmpp:node');
            }, false);

    _('disco-target').focus();


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
}

function finish() {
    channel.release();
}


// GUI UTILITIES (GENERIC)
// ----------------------------------------------------------------------

function toggleHidden(element) {
    element.hidden = !element.hidden;
}


// GUI UTILITIES (SPECIFIC)
// ----------------------------------------------------------------------

function getInfo(jid, node) {
    return x('//*[@xulx:role="item" and @xmpp:jid="' + jid + '"' +
             (node ? ' and @xmpp:node="' + node + '"' : '') + ']' +
             '//*[@xulx:role="info"]');
}

function getItems(jid, node) {
    return x('//*[@xulx:role="item" and @xmpp:jid="' + jid + '"' +
             (node ? ' and @xmpp:node="' + node + '"' : '') + ']' +
             '//*[@xulx:role="items"]');
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function discover(jid) {
    var xulItem = cloneBlueprint('item');
    xulItem.setAttributeNS(ns_xmpp, 'jid', jid);
    _(xulItem, {'xulx:role': 'jid'}).value = jid;
    _('main').appendChild(xulItem);
    discoveryInfo(_('accounts').value, jid);
    discoveryItems(_('accounts').value, jid);
}


// GUI REACTIONS
// ----------------------------------------------------------------------

function pressedKeyInQueryTarget(event) {
    if(event.keyCode == KeyEvent.DOM_VK_RETURN) {
        event.preventDefault();
        discover(event.target.value);
        event.target.blur();
    }    
}

function requestedInfo(element) {
    var jid = attr(element, 'xmpp:jid');
    var node = attr(element, 'xmpp:node');

    var xulInfo = getInfo(jid, node);
    if(xulInfo.getAttributeNS(ns_xulx, 'loaded') == 'true') 
        toggleHidden(xulInfo);
    else
        discoveryInfo(_('accounts').value, jid, node);
}

function requestedItems(element) {
    var jid = attr(element, 'xmpp:jid');
    var node = attr(element, 'xmpp:node');

    var xulItems = getItems(jid, node);
    if(xulItems.getAttributeNS(ns_xulx, 'loaded') == 'true')
        toggleHidden(xulItems);
    else
        discoveryItems(_('accounts').value, jid, node);
}


// NETWORK ACTIONS
// ----------------------------------------------------------------------

function discoveryInfo(account, jid, node) {
    var iq = <iq to={jid} type="get">
                              <query xmlns="http://jabber.org/protocol/disco#info"/>
                              </iq>;

    if(node)
        iq.ns_info::query.@node = node;
	XMPP.send(account, iq);
}

function discoveryItems(account, jid, node) {
    var iq = <iq to={jid} type="get">
                              <query xmlns="http://jabber.org/protocol/disco#items"/>
                              </iq>;

    if(node)
        iq.ns_items::query.@node = node;
    XMPP.send(account, iq);
}


// NETWORK REACTIONS
// ----------------------------------------------------------------------

function receivedInfo(iq) {
    var jid = iq.stanza.@from;
    var node = iq.stanza.ns_info::query.@node;
    var xulInfo = getInfo(jid, node);

    if(iq.stanza.@type == 'error') {
        var xulError = _(xulInfo, {'xulx:role': 'error'});
        var xulIdentity = _(xulInfo, {'xulx:role': 'identity'});
        xulError.value = 'Error: ';
        if(iq.stanza.error.*.length() > 0) 
            xulError.value += iq.stanza.error.*[0].name().localName.replace(/-/g, ' ') + ' ';
        xulError.value += '(' + iq.stanza.error.@code + ')';
        xulIdentity.hidden = true;
        xulError.hidden = false;
    } else {    
        _(xulInfo, {'xulx:role': 'name'}).value = iq.stanza..ns_info::identity.@name;
        _(xulInfo, {'xulx:role': 'category'}).value = iq.stanza..ns_info::identity.@category;
        _(xulInfo, {'xulx:role': 'type'}).value = iq.stanza..ns_info::identity.@type;

        var xulFeatures = _(xulInfo, {'xulx:role': 'features'});
        var featuresCount = iq.stanza..ns_info::feature.length();
        if(featuresCount > 0) {
            xulFeatures.hidden = false;
            xulFeatures.setAttribute('rows', Math.min(5, featuresCount));
        }

        for each(var feature in iq.stanza..ns_info::feature) 
            xulFeatures.appendItem(feature.@var);
    }

    xulInfo.setAttributeNS(ns_xulx, 'loaded', 'true');
    xulInfo.hidden = false;
}

function receivedItems(iq) {
    var jid = iq.stanza.@from;
    var node = iq.stanza.ns_items::query.@node;
    var xulItems = getItems(jid, node);
    
    if(iq.stanza..ns_items::item.length() == 0) 
        _(xulItems, {'xulx:role': 'notice'}).hidden = false;

    for each(var item in iq.stanza..ns_items::item) {
        var xulItem = cloneBlueprint('item');

        xulItem.setAttributeNS(ns_xmpp, 'jid', item.@jid);
        xulItem.setAttributeNS(ns_xmpp, 'name', item.@name);
        xulItem.setAttributeNS(ns_xmpp, 'node', item.@node);
        _(xulItem, {'xulx:role': 'jid'}).value = (item.@name == undefined ?
                                                  item.@jid :
                                                  item.@jid + '/' + item.@name);

        xulItems.appendChild(xulItem);
    }

    xulItems.setAttributeNS(ns_xulx, 'loaded', 'true');
    xulItems.hidden = false;
}
