/*
 * Copyright 2009 by Massimiliano Mirra
 *
 * This file is part of xmpp4moz.
 *
 * xmpp4moz is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 *
 * xmpp4moz is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
 *
 */


// EXPORTS
// ----------------------------------------------------------------------

var EXPORTED_SYMBOLS = [
    'Logger'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;


// API
// ----------------------------------------------------------------------

function Logger(name) {
    this._name = name;
    this._postProc = function(s) s;
    this._backlog = [];
    this._maxBacklog = 200;
}

Logger.prototype.debug = function() {
    try {
    this._log.apply(this, ['DBG'].concat(Array.slice(arguments)));
    }catch(e) {
        dump(e+'\n'+e.stack)
    }
};

Logger.prototype.error = function() {
    this._log.apply(this, ['ERR'].concat(Array.slice(arguments)));
};

Logger.prototype.__defineGetter__('backlog', function() this._backlog);

Logger.prototype.__defineSetter__('postproc', function(fn) {
    this._postProc = fn;
});


// INTERNALS
// ----------------------------------------------------------------------

Logger.prototype._log = function(type) {
    var logLine = type + ' ' + this._name + ' ' + this._postProc(listToString(Array.slice(arguments, 1)));

    if(this._backlog.length > this._maxBacklog)
        this._backlog.shift();
    this._backlog.push(logLine);

    dump(logLine); dump('\n\n');
};


// UTILITIES
// ----------------------------------------------------------------------

function listToString(list) {
    var parts = [];
    for(var i=0,l=list.length; i<l; i++)
        parts.push(asString(list[i]));
    return parts.join('');
}

function asString(thing) {
    if(typeof(thing) == 'string')
        return thing;
    else if(typeof(thing) == 'xml')
        return thing.toXMLString();
    else if(thing instanceof Ci.nsISupportsString)
        return thing.toString();
    else if(thing instanceof Ci.nsIDOMElement)
        return serialize(thing);
    else
        return '';
}

function serialize(element) {
    var serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1'].getService(Ci.nsIDOMSerializer);
    serialize = function(element) {
        return serializer.serializeToString(element);
    };
    return serialize(element);
}
