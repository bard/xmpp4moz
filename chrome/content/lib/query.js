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


function Query() {
    this._fragments = [];
}

Query.prototype = {
    event: function(val) {
        this._event = val;
        return this;
    },

    id: function(val) {
        this._id = val;
        return this;
    },

    type: function(val) {
        this._type = val;
        return this;
    },

    direction: function(val) {
        this._direction = val;
        return this;
    },

    account: function(val) {
        this._account = val;
        return this;
    },

    from: function(val) {
        this._from = val;
        return this;
    },

    to: function(val) {
        this._to = val;
        return this;
    },

    queryNS: function(ns) {
        this._fragments.push('/*[local-name() = "query" and ' +
                             'namespace-uri() = "' + ns + '"]');

        return this;
    },

    child: function(namespace, name) {
        if(namespace == '*')
            this._fragments.push('/*[local-name() = "' + name + '"]');
        else
            this._fragments.push('/*[local-name() = "' + name + '" and ' +
                                 'namespace-uri() = "' + namespace + '"]');
        return this;
    },

    desc: function(namespace, name) {
        this._fragments.push('//*[local-name() = "' + name + '" and ' +
                             'namespace-uri() = "' + namespace + '"]');

        return this;
    },

    query: function(val) {
        dump('*** Deprecation notice *** Use q().child(namespace, name) instead of q().query(prefix) ')
        this._fragments.push('/' + val + ':query');
        return this;
    },

    xpath: function(val) {
        this._fragments.push(val);
        return this;
    },

    compile: function() {
        var q = '//' + this._event;

        // stanza-level attributes

        var attrs = [];
        if(this._id)
            attrs.push('@id="' + this._id + '"');
        if(this._type)
            attrs.push('@type="' + this._type + '"');
        if(this._from)
            attrs.push(this._from.indexOf('/') == -1 ?
                       // "from" doesn't contain a resource, so we're
                       // either asking the bare jid itself, or for
                       // the jid with any resource.
                       '(@from = "' + this._from + '" or starts-with(@from, "' + this._from + '/"))' :
                       '@from="' + this._from + '"');
        if(this._to)
            attrs.push(this._to.indexOf('/') == -1 ?
                       // since "to" doesn't contain a resource,
                       // make it a substring check.
                       '(@to = "' + this._to + '" or starts-with(@to, "' + this._to + '/"))' :
                       '@to="' + this._to + '"');
        if(attrs.length > 0)
            q += '[' + attrs.join(' and ') + ']'

        // xmpp4moz metadata (account and direction of travelling)

        var meta = [];
        if(this._direction)
            meta.push('@direction="' + this._direction + '"');
        if(this._account)
            meta.push('@account="' + this._account + '"');
        if(meta.length > 0) // XXX test
            q += '/*[' +
            'local-name() = "meta" and ' +
            'namespace-uri() = "http://hyperstruct.net/xmpp4moz/protocol/internal" and '
            + meta.join(' and ') +
            ']';

        // XPath fragments

        if(this._fragments.length > 0) {
            var reset = '/ancestor-or-self::' + this._event;
            q += this._fragments.map(function(fragment) {
                return reset + fragment;
            }).join('');
        }

        q += '/ancestor-or-self::' + this._event;

        return q;
    }
}

