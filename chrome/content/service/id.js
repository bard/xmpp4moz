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


function constructor(jid) {
    // TODO: check well-formedness of parts

    var parts, rest;

    parts = jid.split('@');
    if(parts.length == 2) {
        this._username = parts[0];
        rest = parts[1];
    } else 
        rest = parts[0];

    parts = rest.match(/^([^\/]+)\/?(.*)$/);
    this._hostname = parts[1];
    if(parts[2] == '')
        this._resource = undefined;
    else
        this._resource = parts[2];

    this.__defineGetter__(
        'hostname', function() { return this._hostname; });

    this.__defineGetter__(
        'resource', function() { return this._resource; });
    
    this.__defineGetter__(
        'username', function() { return this._username; });
    
    this.__defineGetter__(
        'shortID', function() {
            return this._username + '@' + this._hostname });

}

function toString() {
    var str = '';
    if(this._username)
        str += this._username + '@';

    str += this._hostname;

    if(this._resource)
        str += '/' + this._resource;

    return str;
}

