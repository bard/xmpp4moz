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

function receive(newObject) {

    var cachedObject, found;
    for(var i=0, l=this._store.length; i<l; i++) {
        cachedObject = this._store[i];
        if(cachedObject.session.name == newObject.session.name) {
            found = true;
            break;
        }
    }

    function getRosterItem(query, jid) {
        var items = query.childNodes;
        for(var i=0, l=items.length; i<l; i++)
            if(items[i].getAttribute('jid') == jid)
                return items[i];
    }

    if(!found) 
        this._store.push(newObject);
    else {
        var newQuery = newObject.stanza.getElementsByTagName('query')[0];
        var cachedQuery = cachedObject.stanza.getElementsByTagName('query')[0];
        var newItem;
        for(var i=0, l=newQuery.childNodes.length; i<l; i++) {
            newItem = newQuery.childNodes[i];
            cachedItem = getRosterItem(cachedQuery, newItem.getAttribute('jid'));
            if(cachedItem)
                if(newItem.getAttribute('subscription') == 'remove')
                    cachedQuery.removeChild(cachedItem);
                else
                    cachedQuery.replaceChild(newItem.cloneNode(true), cachedItem);
            else
                cachedQuery.appendChild(newItem);
        }
    }
}

function copy() {
    return this._store.slice(0);
}
