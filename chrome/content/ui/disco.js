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
    
    for each(var account in XMPP.accounts) {
        if(XMPP.isUp(account.jid)) {
            _('accounts').value = account.jid;
            break;
        }
    }
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
