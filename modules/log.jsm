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
    'Log'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var srvConsole = Cc['@mozilla.org/consoleservice;1']
    .getService(Ci.nsIConsoleService);


// STATE
// ----------------------------------------------------------------------

var sinks = [], sources = [];


// API
// ----------------------------------------------------------------------

var Log = {
    getSource: function(name, extraInfo) {
        var source = new Source(name, extraInfo);

        if(sources.indexOf(name) == -1)
            sources.push(name);

        return source;
    },

    sinkTo: function(pattern, sinkFunction) {
        var i = findSink(pattern, sinkFunction);
        if(i == -1)
            sinks.push([pattern, sinkFunction]);
    },

    unsink: function(pattern, sinkFunction) {
        var i = findSink(pattern, sinkFunction);
        if(i != -1)
            sinks.splice(i, 1);
    },

    JSCONSOLE: function(data) {
        srvConsole.logStringMessage(data);
    },

    SYSCONSOLE: function(data) {
        dump(data); dump('\n\n');
    }
};

var Source = function(name, extraInfo) {
    this._info = { name: name };
    for(var n in extraInfo)
        this._info[n] = extraInfo[n];

    if(sources.indexOf(name) == -1)
        sources.push(name);
};

Source.prototype.send = function(data) {
    if(sinks.length == 0)
        return;

    var d = {
        time: new Date(),
        origin: Components.stack.caller
    };
    for(var n in this._info)
        d[n] = this._info[n];
    for(var n in data)
        d[n] = data[n];

    for each([pattern, sinkFunction] in sinks) {
        if((typeof(pattern) == 'string' && (pattern == '*' || pattern == info.name)) ||
           (typeof(pattern.test) == 'function' && pattern.test(info.name)))
            try {
                sinkFunction(d);
            } catch(e) {
                Cu.reportError('Error while trying to log: "' + e + '"');
            }
    }
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
