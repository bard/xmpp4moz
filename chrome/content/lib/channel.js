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


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const ns_x4m_in = 'http://hyperstruct.net/xmpp4moz/protocol/internal';


// DOMAIN
// ----------------------------------------------------------------------

function Channel() {
    this._listeners = [];
}

Channel.prototype.on = function(pattern, handler) {
    var reaction = {
        pattern: pattern,
        handler: handler,
        _registrant: Components.stack.caller
    };
    this._listeners.push(reaction);
    return reaction;
};

Channel.prototype.forget = function(watcher) {
    var index = this._listeners.indexOf(watcher);
    if(index != -1) 
        this._listeners.splice(index, 1);
};

Channel.prototype.receive = function(event) {
    for each(var watch in this._listeners) {
        try {
            if(match(event, watch.pattern))
                watch.handler(event);
        } catch(e) {
            Cu.reportError(e);
        }
    }
};

Channel.prototype.observe = function(subject, topic, data) {
    var [_, name, info] = topic.match(/^(data|stanza|connector)-?(in|out|.*)?$/);
    var account = data.toString();

    var event = {
        get account() {
            return (this.stanza ?
                    this.stanza.ns_x4m_in::meta.@account.toXMLString() :
                    account);
        },

        get session() {
            return { name: account };
        }
    };

    switch(name) {
    case 'connector':
        event.state = info;
        event.event = name;
        break;
    case 'stanza':
        event.stanza = dom2xml(subject.QueryInterface(Ci.nsIDOMElement));
        event.event = event.stanza.name();
        event.direction = info;
        break;
    }

    this.receive(event);
};

Channel.prototype.release = function() {
    if(typeof(this.onRelease) == 'function')
        this.onRelease();
};


// UTILITIES
// ----------------------------------------------------------------------

function asString(object) {
    if(object instanceof Ci.nsISupportsString)
        return object.toString();
    else if(typeof(object) == 'string')
        return object;
    else
        throw new Error('Bad argument.');
}

/**
 * Convert a DOM element to an E4X XML object.
 *
 * Assign converted object to DOM element behind the scenes, so that
 * if it requested to be converted again, there is no need to go
 * through serialization/deserialization again.
 *
 * (This assumes that the element is immutable.)
 *
 */

function dom2xml(element) {
    if(!element.__dom2xml_memo)
        element.__dom2xml_memo = new XML(serialize(element));
    
    return element.__dom2xml_memo;
}

function match(object, template) {
    var pattern, value;
    for(var member in template) {
        value = object[member];
        pattern = template[member];
        
        if(pattern === undefined)
            ;
        else if(pattern && typeof(pattern) == 'function') {
            if(!pattern(value))
                return false;
        }
        else if(pattern && typeof(pattern.test) == 'function') {
            if(!pattern.test(value))
                return false;
        }
        else if(pattern && pattern.id) {
            if(pattern.id != value.id)
                return false;
        }
        else if(pattern != value)
            return false;
    } 

    return true;
}

function serialize(element) {
    var _ = arguments.callee;
    _.serializer = _.serializer ||
        Cc['@mozilla.org/xmlextras/xmlserializer;1'].getService(Ci.nsIDOMSerializer);
    return _.serializer.serializeToString(element);
}
