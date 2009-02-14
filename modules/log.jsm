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
    'log'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var srvConsole = Cc['@mozilla.org/consoleservice;1']
    .getService(Ci.nsIConsoleService);

Cu.import('resource://xmpp4moz/utils.jsm');


// STATE
// ----------------------------------------------------------------------

var sinks = [], sources = [];


// API
// ----------------------------------------------------------------------

var log = {};

log.Source = function(name) {
    this._name = name;
    if(sources.indexOf(name) == -1)
        sources.push(name);
};

log.Source.prototype.debug = function() {
    log1.apply(null, ['DBG', this._name].concat(Array.slice(arguments)));
};

log.Source.prototype.error = function() {
    log1.apply(null, ['ERR', this._name].concat(Array.slice(arguments)));
};

log.sinkTo = function(pattern, sinkFunction) {
    var i = findSink(pattern, sinkFunction);
    if(i == -1)
        sinks.push([pattern, sinkFunction]);
};

log.unsink = function(pattern, sinkFunction) {
    var i = findSink(pattern, sinkFunction);
    if(i != -1)
        sinks.splice(i, 1);
};

log.JSCONSOLE = function(data) {
    srvConsole.logStringMessage(data);
};

log.SYSCONSOLE = function(data) {
    dump(data); dump('\n\n');
};


// INTERNALS
// ----------------------------------------------------------------------

function findSink(pattern, sinkFunction) {
    for(let i=0,l=sinks.length; i<l; i++) {
        let [p, s] = sinks[i];
        if(p == pattern && s == sinkFunction)
            return i;
    }

    return -1;
}

function log1(type, name) {
    if(sinks.length == 0)
        return;

    var logLine = type + ' ' + name + ' ' + listToString(Array.slice(arguments, 2));
    for each([pattern, sinkFunction] in sinks) {
        if((typeof(pattern) == 'string' && (pattern == '' || pattern == name)) ||
           (typeof(pattern.test) == 'function' && pattern.test(name)))
            try {
                sinkFunction(logLine);
            } catch(e) {
                Cu.reportError('Error while trying to log: "' + e + '"');
            }
    }
}

function listToString(list) {
    var parts = [];
    for(var i=0,l=list.length; i<l; i++) {
        try {
            parts.push(asString(list[i]))
        } catch(e) {}
    }
    return parts.join('');
}
