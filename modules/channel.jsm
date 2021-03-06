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


// EXPORTS
// ----------------------------------------------------------------------

var EXPORTED_SYMBOLS = [
    'Channel'
];


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import('resource://xmpp4moz/utils.jsm');
Cu.import('resource://xmpp4moz/namespaces.jsm');
Cu.import('resource://xmpp4moz/log.jsm');


// DOMAIN
// ----------------------------------------------------------------------

function Channel() {
    this._listeners = [];
}

Channel.prototype.on = function(test, action) {
    if(typeof(test) == 'object')
        deprecation('2009-04-09 channel.on() - use simple functions in your channel tests,' +
                    ' e.g. channel.on(function(e) e.name == "presence", ...).');

    var listener = {
        test: test,
        action: action,
    };
    this._listeners.push(listener);
    return listener;
};

Channel.prototype.forget = function(listener) {
    var index = this._listeners.indexOf(listener);
    if(index != -1)
        this._listeners.splice(index, 1);
};

Channel.prototype.receive = function(event) {
    for each(var listener in this._listeners) {
        try {
            switch(typeof(listener.test)) {
            case 'function':
                if(listener.test(event))
                    listener.action(event);
                break;
            case 'object':
                if(match(event, listener.test))
                    listener.action(event);
                break;
            default:
                throw new Error('Unrecognized test type. (' + typeof(listener.test) + ')');
            }
        } catch(e) {
            Cu.reportError(e + '\n' + e.stack);
        }
    }
};

Channel.prototype.observe = function(subject, topic, data) {
    var [_, name, info] = topic.match(/^(data|stanza|connector)-?(in|out|.*)?$/);

    var event = {};

    switch(name) {
    case 'connector':
        event.state = info;
        event.name = name;
        event.event = name;
        event.account = data.toString();
        if(subject instanceof Ci.nsIDOMElement)
            event.info = dom2xml(subject.QueryInterface(Ci.nsIDOMElement));
        break;
    case 'stanza':
        subject.QueryInterface(Ci.nsIDOMElement);
        event.stanza = dom2xml(subject);
        event.event = event.stanza.name();
        event.account = event.stanza.@ns_x4m_in::account.toString();
        event.direction = event.stanza.@ns_x4m_in::direction.toString();

        event.name = event.stanza.name().localName;
        event.from = event.stanza.@from.toString();
        event.to = event.stanza.@to.toString();
        event.type = event.stanza.@type.toString();
        event.id = event.stanza.@id.toString();
        event.xml = event.stanza;
        event.dom = subject;
        event.dir = event.direction;
        event.session = {
            account: event.account,
            resource: null
        };
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
