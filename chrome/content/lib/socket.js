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


const Cc = Components.classes;
const Ci = Components.interfaces;

function constructor(host, port, opts) {
    this._host = host;
    this._port = port;
    this._opts = opts || {};
    this._eventListeners = {};

    this._transportService = Cc["@mozilla.org/network/socket-transport-service;1"]
        .getService(Ci.nsISocketTransportService);
}

function write(data) {
    try {
        this._outstream.writeString(data);
    } catch(e if e.name == 'NS_BASE_STREAM_CLOSED') {
        this._instream.close();
        this._outstream.close();
        this._handle('stop');
    }
}

function isConnected() {
    return this._connected;
}

function connect() {
    if(this._connected)
        return;
            
    if(this._opts.ssl)
        this._transport = this._transportService.createTransport(
            ['ssl'], 1, this._host, this._port, null);
    else
        this._transport = this._transportService.createTransport(
            null, 0, this._host, this._port, null);

    this._baseOutstream = this._transport.openOutputStream(0,0,0);
    this._outstream = Cc["@mozilla.org/intl/converter-output-stream;1"]
        .createInstance(Ci.nsIConverterOutputStream);
    this._outstream.init(this._baseOutstream, 'UTF-8', 0, '?'.charCodeAt(0))

    this._baseInstream = this._transport.openInputStream(0,0,0);
    this._instream = Cc["@mozilla.org/intl/converter-input-stream;1"]
        .createInstance(Ci.nsIConverterInputStream);
    this._instream.init(this._baseInstream, 'UTF-8', 0,
            Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    this._connected = true;

    var pump = Cc["@mozilla.org/network/input-stream-pump;1"]
        .createInstance(Ci.nsIInputStreamPump);

    pump.init(this._baseInstream, -1, -1, 0, 0, false);

    var socket = this;
    var listener = {
        onStartRequest: function(request, context){
            socket._handle('start');
        },
        onStopRequest: function(request, context, status){
            socket._instream.close();
            socket._outstream.close();
            socket._handle('stop', status);
        },
        onDataAvailable: function(request, context, inputStream, offset, count){
            var data = {};
            socket._instream.readString(count, data);
            socket._handle('data', data.value);
        }
    };

    pump.asyncRead(listener, null);
}

function disconnect() {
    if(!this._connected)
        return;
    
    this._instream.close();
    this._outstream.close();
    this._connected = false;
}

function on(eventName, action) {
    this._eventListeners[eventName] = action;
}

function _handle(eventName, info) {
    var action = this._eventListeners[eventName];
    if(action)
        action(info);
}