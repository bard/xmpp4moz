/*
 * Copyright 2006-2007 by Massimiliano Mirra
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


function asDOM(object) {
    var parser = Cc['@mozilla.org/xmlextras/domparser;1']
        .getService(Ci.nsIDOMParser);

    asDOM = function(object) {
        if(object instanceof Ci.nsIDOMElement)
            return object;

        var element;
        switch(typeof(object)) {
        case 'xml':
            element = parser
                .parseFromString(object.toXMLString(), 'text/xml')
                .documentElement;
            break;
        case 'string':
            element = parser
                .parseFromString(object, 'text/xml')
                .documentElement;
            break;
        default:
            throw new Error('Argument error. (' + typeof(object) + ')');
        }
        
        return element;
    };

    return asDOM(object);
}

function asXML(element) {
    return new XML(serialize(element));
}

function serialize(element) {
    var serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1']
        .getService(Ci.nsIDOMSerializer);
    serialize = function(element) {
        return serializer.serializeToString(element);
    };
    return serialize(element);
}

function JID(string) {
    var memo = arguments.callee.memo || (arguments.callee.memo = {});
    if(string in memo)
        return memo[string];
    var m = string.match(/^(.+?@)?(.+?)(?:\/|$)(.*$)/);

    var jid = {};

    if(m[1])
        jid.username = m[1].slice(0, -1);

    jid.hostname = m[2];
    jid.resource = m[3];
    jid.nick     = m[3];
    jid.full     = m[3] ? string : null;
    jid.address  = jid.username ?
        jid.username + '@' + jid.hostname :
        jid.hostname;

    memo[string] = jid;
    return jid;    
}

function load(url) {
    var loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
        .getService(Ci.mozIJSSubScriptLoader);

    if(arguments.length == 1)
        // load everything in current environment
        loader.loadSubScript(url);
    else {
        // load selected names in current environment
        var scope = {};
        loader.loadSubScript(url, scope);
        for each(var name in Array.slice(arguments, 1)) {
            this[name] = scope[name];
        }
    }
}
