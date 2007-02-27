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

const ns_muc_user = 'http://jabber.org/protocol/muc#user';


// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

function receive(newPresence) {
    if(newPresence.stanza.hasAttribute('type') &&
       newPresence.stanza.getAttribute('type') != 'unavailable')
        return;

    var cachedPresence = this.fetch(newPresence.session.name,
                                    newPresence.stanza.getAttribute('from'),
                                    newPresence.stanza.getAttribute('to'));
    if(cachedPresence) {
        var cachedPayload = cachedPresence.stanza.getElementsByTagName('x')[0];
        if(cachedPayload &&
           cachedPayload.getAttribute('xmlns') == 'http://jabber.org/protocol/muc#user' &&
           newPresence.stanza.getAttribute('type') == 'unavailable')
            this.delete(cachedPresence);
        else
            this.store(newPresence);
    }
    else
        if(!newPresence.stanza.hasAttribute('type'))
            this.store(newPresence);
}

function copy() {
    var seq = [];
    treeLeafIter(this._storeIn, 2,
                 function(presence) { seq.push(presence); });
    treeLeafIter(this._storeOut, 1,
                 function(presence) { seq.push(presence); });
    return seq;
}


// INTERNALS
// ----------------------------------------------------------------------

function constructor() {
    this._store = [];
    this._storeIn = {};
    this._storeOut = {};
}

function fetch(account, from, to) {
    return from ? 
        treeFetch(this._storeIn, [account, JID(from).address, JID(from).resource]) :
        treeFetch(this._storeOut, [account, to]);
}

function delete(presence) {
    if(presence.stanza.hasAttribute('from')) {
        var from = presence.stanza.getAttribute('from');
        var to = presence.stanza.getAttribute('to');

        treeDelete(this._storeIn,
                   [presence.session.name, JID(from).address, JID(from).resource]);
    } else
        dump('***** Not implemented.\n');
}

function store(presence) {
    if(presence.stanza.hasAttribute('from')) {
        var from = presence.stanza.getAttribute('from');
        var to = presence.stanza.getAttribute('to');

        treeStore(this._storeIn,
                  [presence.session.name, JID(from).address, JID(from).resource],
                  presence);
    } else {
        var to = presence.stanza.getAttribute('to');
        treeStore(this._storeOut, [presence.session.name, to], presence);
    }
}


// UTILITIES
// ----------------------------------------------------------------------

function JID(string) {
    if(string in arguments.callee.memo)
        return arguments.callee.memo[string];
    var m = string.match(/^(.+?@)?(.+?)(?:\/|$)(.*$)/);

    var jid = {};

    if(m[1])
        jid.username = m[1].slice(0, -1);

    jid.hostname = m[2];
    jid.resource = m[3];
    jid.nick     = m[3];
    jid.full     = m[3] ? string : null;
    jid.address  = jid.username ?
        jid.username + '@' + jid.hostname :
        jid.hostname;

    arguments.callee.memo[string] = jid;
    return jid;    
}
JID.memo = {};

function treeStore(tree, path, value) {
    var node = tree;
    for each(var childName in path.slice(0, -1)) {
        if(!node[childName])
            node[childName] = {};
        node = node[childName];
    }
    node[path.slice(-1)] = value;
}

function treeFetch(tree, path) {
    var node = tree;
    for each(var childName in path) {
        node = node[childName];
        if(!node)
            return;
    }

    return node;
}

function treeDelete(tree, path) {
    var node = tree;
    for each(var childName in path.slice(0, -1)) {
        if(!node[childName])
            return;
        node = node[childName];
    }
    delete node[path.slice(-1)];
}

function treeLeafIter(tree, levels, leafFn) {
    function descend(tree, levelsLeft) {
        if(levelsLeft == 0)
            for(var childName in tree)
                leafFn(tree[childName]);
        else
            for(var childName in tree)
                descend(tree[childName], levelsLeft - 1);
    }

    descend(tree, levels);
}

