// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const ns_xul = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const ns_xulx = 'http://hyperstruct.net/xul-extensions';
const ns_html = 'http://www.w3.org/1999/xhtml';
const ns_xmpp = 'http://hyperstruct.net/xmpp';
const ns_info = 'http://jabber.org/protocol/disco#info';
const ns_items = 'http://jabber.org/protocol/disco#items';


// GLOBAL STATE
// ----------------------------------------------------------------------

var channel;


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

    document.addEventListener(
        'mouseover', function(event) {
            if(!event.target.hasAttributeNS)
                return;
            
            document.getElementById('status').label =
                'JID: ' + attr(event.target, 'xmpp:jid') +
                ', Node: ' + attr(event.target, 'xmpp:node');
        }, false);
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

function initialDiscovery(jid) {
    var xulItem = cloneBlueprint('item');
    xulItem.setAttributeNS(ns('xmpp'), 'jid', jid);
    _(xulItem, {'xulx:role': 'jid'}).value = jid;
    _('main').appendChild(xulItem);
    discoveryInfo(_('accounts').value, jid);
    discoveryItems(_('accounts').value, jid);
}


// GUI REACTIONS
// ----------------------------------------------------------------------

function requestedInfo(element) {
    var jid = attr(element, 'xmpp:jid');
    var node = attr(element, 'xmpp:node');

    var xulInfo = getInfo(jid, node);
    if(xulInfo.getAttributeNS(ns('xulx'), 'loaded') == 'true') 
        toggleHidden(xulInfo);
    else
        discoveryInfo(_('accounts').value, jid, node);
}

function requestedItems(element) {
    var jid = attr(element, 'xmpp:jid');
    var node = attr(element, 'xmpp:node');

    var xulItems = getItems(jid, node);
    if(xulItems.getAttributeNS(ns('xulx'), 'loaded') == 'true')
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

    xulInfo.setAttributeNS(ns('xulx'), 'loaded', 'true');
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

        xulItem.setAttributeNS(ns('xmpp'), 'jid', item.@jid);
        xulItem.setAttributeNS(ns('xmpp'), 'name', item.@name);
        xulItem.setAttributeNS(ns('xmpp'), 'node', item.@node);
        _(xulItem, {'xulx:role': 'jid'}).value = (item.@name == undefined ?
                                                  item.@jid :
                                                  item.@jid + '/' + item.@name);

        xulItems.appendChild(xulItem);
    }

    xulItems.setAttributeNS(ns('xulx'), 'loaded', 'true');
    xulItems.hidden = false;
}


// HOOKS
// ----------------------------------------------------------------------

function xmppLoadedAccounts() {
    for each(var account in XMPP.accounts) {
        if(XMPP.isUp(account.jid)) {
            _('accounts').value = account.jid;
            break;
        }
    }
}