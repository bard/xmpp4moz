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
    this._store = [];
}

function presenceIndexOf(account, from, to) {
    var cachedPresence;
    for(var i=0, l=this._store.length; i<l; i++) {
        cachedPresence = this._store[i];
        if(cachedPresence.session.name == account &&
           cachedPresence.stanza.getAttribute('from') == from &&
           cachedPresence.stanza.getAttribute('to') == to)
            return i;
    }
    return -1;
}

function receive(newPresence) {
    if(newPresence.stanza.hasAttribute('type') &&
       newPresence.stanza.getAttribute('type') != 'unavailable')
        return;

    var index = this.presenceIndexOf(
        newPresence.session.name,
        newPresence.stanza.getAttribute('from'),
        newPresence.stanza.getAttribute('to'));

    if(index != -1) {
        // The muc#user payload of the presence stanza should not be
        // checked this way, as there could be many <x> payloads.  But
        // getElementsByTagNameNS seems not to work.

        var cachedPresencePayload = this._store[index].stanza.getElementsByTagName('x')[0];

        if(newPresence.stanza.getAttribute('type') == 'unavailable' &&
           cachedPresencePayload &&
           cachedPresencePayload.getAttribute('xmlns') == 'http://jabber.org/protocol/muc#user')
            this._store.splice(index, 1);
        else
            this._store[index] = newPresence;
    }
    else
        if(!newPresence.stanza.hasAttribute('type'))
            this._store.push(newPresence);
}

function copy() {
    return this._store.slice(0);
}
