/*
 * Copyright 2008 by Massimiliano Mirra
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
    'accounts'
];


// DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.');

var prefBranch = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.account.')
    .QueryInterface(Ci.nsIPrefBranch2);

prefBranch.addObserver('', {
    observe: function(subject, topic, data) {
        accounts._refresh();
    }
}, false);

Components.utils.import('resource://xmpp4moz/utils.jsm');


// UTILITIES
// ----------------------------------------------------------------------

function prefRead(key, leafName) {
    var name = 'account.' + key + '.' + leafName;

    var prefType = pref.getPrefType(name);
    if(prefType == pref.PREF_STRING)
        return pref.getCharPref(name);
    else if(prefType == pref.PREF_INT)
        return pref.getIntPref(name);
    else if(prefType == pref.PREF_BOOL)
        return pref.getBoolPref(name);
    else
        return null;
}

function prefWrite(key, leafName, value) {
    var name = 'account.' + key + '.' + leafName;

    var prefType = pref.getPrefType(name);
    if(prefType == pref.PREF_STRING)
        return pref.setCharPref(name, value);
    else if(prefType == pref.PREF_INT)
        return pref.setIntPref(name, value);
    else if(prefType == pref.PREF_BOOL)
        return pref.setBoolPref(name, value);
    else
        return null;
}

function uniq(array) {
    var encountered = [];

    return array.filter(
        function(item) {
            if(encountered.indexOf(item) == -1) {
                encountered.push(item);
                return true;
            } else
                return false;
        });
}


// CLASSES
// ----------------------------------------------------------------------

function AccountWrapper(key) {
    this.key = key;
}

AccountWrapper.prototype.__defineGetter__('jid', function() {
    return this.address + '/' + this.resource;
});

AccountWrapper.prototype.__defineGetter__('password', function() {
    return getPassword(this.address) || prefRead('password');
});

[ 'address',
  'resource',
  'autoLogin',
  'presenceHistory',
  'connectionHost',
  'connectionPort',
  'connectionSecurity'
].forEach(function(property) {
    AccountWrapper.prototype.__defineGetter__(property, function() {
        return prefRead(this.key, property);
    });

    AccountWrapper.prototype.__defineSetter__(property, function(value) {
        return prefWrite(this.key, property, value);
    });
});



var accounts = {
    _store: [],

    _refresh: function() {
        var keys = uniq(
            pref.getChildList('account.', {})
                .map(function(item) {
                    try {
                        return item.split('.')[1];
                    } catch(e) {
                        // Cases where item.split() would result in
                        // an error and prevent accounts from being
                        // read were reported.  No additional
                        // information is available, though, so we
                        // just catch the exception and report the
                        // error to the console.
                        Cu.reportError(e);
                        return undefined;
                    }})
                .filter(function(key) {
                    return key != undefined;
                }));

        this._store = keys.map(function(key) new AccountWrapper(key));
    },

    forEach: function() {
        return this._store.forEach.apply(this._store, arguments);
    },

    map: function() {
        return this._store.map.apply(this._store, arguments);
    },

    filter: function() {
        return this._store.filter.apply(this._store, arguments);
    },

    some: function() {
        return this._store.some.apply(this._store, arguments);
    },

    every: function() {
        return this._store.every.apply(this._store, arguments);
    },

    _find: function(criteria) {
        switch(typeof(criteria)) {
        case 'function':
            for(var i=0,l=this._store.length; i<l;i++)
                if(criteria(this._store[i]))
                    return [i, this._store[i]]
            return [-1, null];
            break;
        case 'object':
            for(var propName in criteria)
                break;

            for(var i=0,l=this._store.length; i<l;i++)
                if(this._store[i][propName] == criteria[propName])
                    return [i, this._store[i]]
            return [-1, null];
            break;
        }
    },

    get: function(criteria) {
        var [index, account] = this._find(criteria);
        return account;
    },

    remove: function(criteria) {
        var [index, account] = this._find(criteria);
        if(!account)
            throw new Error('Account not found. (' + criteria.toSource() + ')');

        pref.deleteBranch('account.' + account.key + '.');
        this._store.splice(index, 1);
    }
};


// STATE
// ----------------------------------------------------------------------

accounts._refresh();
