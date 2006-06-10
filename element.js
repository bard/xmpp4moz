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

// Factories

var _serializer = new XMLSerializer();

function iq(type, purpose, opts) {
    var opts = opts || {};
    var xml = <iq><query/></iq>;
    switch(purpose) {
    case 'auth':
        xml.query.@xmlns = 'jabber:iq:auth';
        xml.query.username = opts.username;
        xml.query.password = opts.password;
        xml.query.resource = opts.resource;
        break;
    case 'register':
        xml.query.@xmlns = 'jabber:iq:register';
        xml.query.username = opts.username;
        xml.query.password = opts.password;
        break;
    case 'roster':
        xml.query.@xmlns = 'jabber:iq:roster';
        break;
    case 'roster/remove':
        xml.query.@xmlns = 'jabber:iq:roster';
        xml.query.item.@jid = opts.jid;
        xml.query.item.@subscription = 'remove';
        break;
    default:
        
    }

    if(type)
        xml.@type = type;
    else
        throw new Error('Type required for iq.');

    // Making this optional as session will id-stamp the element
    if(opts.id)
        xml.@id = opts.id;


    return new IqWrapper(xml);
}

function presence(type, to, opts) {
    var xml;
    opts = opts || {};

    if(arguments.length == 1 && typeof(arguments[0]) == 'object') {
        var legacyArg = arguments[0];
        to = legacyArg.to;
        type = legacyArg.type;
        opts.show = legacyArg.show;
        opts.message = legacyArg.message;
    }

    if(type == 'available')
        type = null;

    if(to && type)
        xml = <presence to={to} type={type}/>;
    else if(to && !type) 
        xml = <presence to={to}/>;
    else if(!to && type)
        xml = <presence type={type}/>;
    else
        xml = <presence/>;

    if(opts.show)
        xml.show = opts.show;
    if(opts.message)
        xml.message = opts.message;

    return new PresenceWrapper(xml);
}

function message(to, body, opts) {
    var xml;
    opts = opts || {};

    if(arguments.length == 1 && typeof(arguments[0]) == 'object') {
        var legacyArg = arguments[0];
        to = legacyArg.to;
        body = legacyArg.body;
        opts.type = legacyArg.type;
    }

    xml = <message to={to}/>;

    if(opts.type)
        xml.@type = opts.type;
    if(body)
        xml.body = body;

    return new MessageWrapper(xml);
}

// Wrappers for legacy interfaces

function _(xml) {
    var s = xml.toString();
    if(s != '')
        return s;
}

function wrap(domElement, session) {
    var xml, wrapper;

    xml = new XML(_serializer.serializeToString(domElement));
    switch(xml.name().toString()) {
    case 'iq':
        if(xml.*::query.length() > 0)
            switch(xml.*::query.namespace().toString()) {
            case 'jabber:iq:roster':
                wrapper = IqRosterWrapper;
                break;
            default:
                wrapper = IqWrapper;
                break;
            }
        else
            wrapper = IqWrapper;
        break;
    case 'presence':
        wrapper = PresenceWrapper;
        break;
    case 'message':
        wrapper = MessageWrapper;
        break;
    }

    return new wrapper(xml, session);
}

function iqAuth(opts) {
    return iq(
        opts.type || 'set', 'auth',
        { id: opts.id, username: opts.username, password: opts.password, resource: opts.resource });
}

function iqRegister(opts) {
    return iq(
        opts.type || 'set', 'register',
        { id: opts.id, username: opts.username, password: opts.password });
}

function iqRoster(opts) {
    return iq(
        opts.type || 'get', 'roster',
        { id: opts.id });
}

// ----------------------------------------------------------------------

function StanzaWrapper(xml, session) {
    this.xml = xml;
    this._session = session;
}

StanzaWrapper.prototype = {
    get nodeName() {
        return _(this.xml.name());
    },

    get session() {
        return this._session;
    },

    getId: function() {
        return _(this.xml.@id);
    },

    setId: function(val) {
        this.xml.@id = val;
    },
    
    getTo: function() {
        return _(this.xml.@to);
    },

    getFrom: function() {
        return _(this.xml.@from);
    },

    getType: function() {
        return _(this.xml.@type) || 'available';
    },

    toString: function() {
        return this.xml.toXMLString().replace(/^\s+/mg, '').replace(/\n+/mg, '');;
    },
  
    getAttribute: function(name) {
        return _(this.xml['@' + name]);
    }  
};

// ----------------------------------------------------------------------

function PresenceWrapper() {
    StanzaWrapper.apply(this, arguments);
}
PresenceWrapper.prototype = new StanzaWrapper();

PresenceWrapper.prototype.getMessage = function() {
    return _(this.xml.message);
};

PresenceWrapper.prototype.getShow = function() {
        return _(this.xml.show);
};

PresenceWrapper.prototype.setShow = function(value) {
    this.xml.show = value;
};

PresenceWrapper.prototype.isRoomOccupant = function() {
    if(this.xml.*::x.length() > 0)
        return (this.xml.*::x.namespace().toString() == 'http://jabber.org/protocol/muc#user');
};

PresenceWrapper.prototype.getOccupantNick = function() {
    return this.xml.@from.toString.match(/\/(.+)$/)[1];
};

PresenceWrapper.prototype.getErrorCode =  function() {
    return _(this.xml.error);
};

// ----------------------------------------------------------------------

function MessageWrapper() {
    StanzaWrapper.apply(this, arguments);
}
MessageWrapper.prototype = new StanzaWrapper();

MessageWrapper.prototype.getType = function() {
    return _(this.xml.@type.toString()) || 'normal';
};

MessageWrapper.prototype.getBody = function() {
    return _(this.xml.body);
};

MessageWrapper.prototype.getErrorCode = function() {
    return _(this.xml..error.@code);
};

// ----------------------------------------------------------------------

function IqWrapper() {
    StanzaWrapper.apply(this, arguments);
}
IqWrapper.prototype = new StanzaWrapper();

IqWrapper.prototype.getNameSpace = function() {
    if(this.xml.*::query.length() > 0)
        return _(this.xml.*::query.namespace());
};

// ----------------------------------------------------------------------

function IqRosterWrapper() {
    IqWrapper.apply(this, arguments);
}
IqRosterWrapper.prototype = new IqWrapper();

IqRosterWrapper.prototype.getItems = function() {
    var jids = [];
    for each(var item in this.xml.*::query.*::item) {
        jids.push(item.@jid);
    }
    return jids;
};

// ----------------------------------------------------------------------

