/*
  Copyright (C) 2005-2006 by Massimiliano Mirra

  This program is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation; either version 2 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301 USA

  Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
*/

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

