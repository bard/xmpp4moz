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


function constructor() {
    this._store = {};
}

function receive(newObject) {
    var account = newObject.session.name;
    var cachedObject = this._store[account];

    if(cachedObject) {
        if(cachedObject.stanza.getElementsByTagName('query')[0].childNodes.length == 0)
            this._store[account] = newObject;
        else {
            var itemChange = newObject.stanza.getElementsByTagName('query')[0].firstChild;
            var iq = cachedObject.stanza;
            while(itemChange) {
                iq = applyRosterPush(iq, itemChange);
                itemChange = itemChange.nextSibling;
            }
            cachedObject.stanza = iq;
        }
    }
    else
        this._store[account] = newObject;
}

function copy() {
    var seq = [];
    for each(var roster in this._store)
        seq.push(roster);
    return seq;
}


// UTILITIES
// ------------------------------------------------------------

function findItemForJID(jid, query) {
    var item = query.firstChild;
    while(item) {
        if(item.getAttribute('jid') == jid)
            return item;
        item = item.nextSibling;
    }
    return undefined;
}

function applyRosterPush(iqIn, rosterItemChange) {
    var iqOut = iqIn.cloneNode(true);
    var change = rosterItemChange.cloneNode(true);
    
    var query = iqOut.getElementsByTagName('query')[0];
    var item = findItemForJID(change.getAttribute('jid'), query);

    if(item)
        if(change.getAttribute('subscription') == 'remove')
            query.removeChild(item);
        else
            query.replaceChild(change, item);
    else
        if(change.getAttribute('subscription') != 'remove')
            query.appendChild(change);

    return iqOut;
}
