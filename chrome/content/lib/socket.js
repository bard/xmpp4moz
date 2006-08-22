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

var mixin = module.require('package', 'mixin');
var event = module.require('package', 'event_handling');

function constructor(h, p, o) {
    this._host = h;
    this._port = p;
    this._opts = o || {};
    
    this._transportService = Components
        .classes["@mozilla.org/network/socket-transport-service;1"]
        .getService(Components.interfaces.nsISocketTransportService);

    var eventManager = new event.Manager();
    mixin.forward(this, 'on', eventManager);
    mixin.forward(this, '_handle', eventManager, 'postHandle');
}

function write(data) {
    try {
        this._outstream.write(data, data.length);
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
        this._transport = this._transportService.createTransport(null, 0, this._host, this._port, null);

    this._outstream = this._transport.openOutputStream(0,0,0);
    this._stream = this._transport.openInputStream(0,0,0);
    this._instream = Components
        .classes["@mozilla.org/scriptableinputstream;1"]
        .createInstance(Components.interfaces.nsIScriptableInputStream);
    this._instream.init(this._stream);
    this._connected = true;

    var pump = Components
        .classes["@mozilla.org/network/input-stream-pump;1"]
        .createInstance(Components.interfaces.nsIInputStreamPump);

    pump.init(this._stream, -1, -1, 0, 0, false);

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
            socket._handle('data', socket._instream.read(count));
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
