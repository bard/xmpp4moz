/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is xmpp4moz.
 *
 * The Initial Developer of the Original Code is
 * Massimiliano Mirra <bard [at] hyperstruct [dot] net>.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */


// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

/**
 * An in-memory object database supporting queries and indices.
 *
 * The following will create a database and will mantain indices for
 * objects with a 'surname' property and objects with a 'name'
 * property.
 *
 *   var db = new DB({indices: ['surname', 'name']});
 *
 */

function DB(opts) {
    this._store = [];
    this._indices = {};

    if(opts && opts.indices)
        for each(var indexName in opts.indices)
            this._indices[indexName] = {};
}

DB.prototype = {
    /**
     * Put an object into the database.
     *
     * If _id_ is defined, put it at specified id (overwriting any
     * object having that id already).
     *
     * If _object_ is null and _id_ is defined, _id_ will no longer
     * reference an object.
     *
     * Objects put into the database get an 'id' property.
     *
     */

    put: function(object, id) {
        if(object != undefined && id == undefined) {
            id = this._store.push(object) - 1;
            object.id = id;
            this._indicize(object, id);
        }
        else if(object == null && id != undefined) {
            this._unindicize(this._store[id], id);
            delete this._store[id];
        }
        else {
            if(id in this._store)
                this._unindicize(this._store[id], id);

            object.id = id;
            this._store[id] = object;
            this._indicize(object, id);
        }

        return id;
    },

    /**
     * Retrieve all database entries matching _pattern_, and return
     * them as an array.
     *
     */

    get: function(pattern) {
        var store    = this._store;
        var indices  = this._indicesFor(pattern);
        var subStore = (indices.length > 0 ?
                        intersect(indices).map(function(id) { return store[id]; }) :
                        store);

        return subStore.filter(
            function(object) {
                return object ? match(object, pattern) : false;
            });
    },

    _indexFor: function(property, value) {
        if(!this._indices[property][value])
            this._indices[property][value] = [];
        return this._indices[property][value];
    },

    _indicize: function(object, id) {
        for(var indexedProperty in this._indices)
            if(indexedProperty.indexOf('.') != -1) {
                var propParts = indexedProperty.split('.');
                if((propParts[0] in object) &&
                   (propParts[1] in object[propParts[0]]))
                   this._indexFor(indexedProperty,
                                  object[propParts[0]][propParts[1]]).push(id);
            }
            else if(indexedProperty in object)
                this._indexFor(indexedProperty,
                               object[indexedProperty]).push(id);
        
        // should take into account case in which object is already
        // indicized?
    },

    _unindicize: function(object, id) {
        for(var indexedProperty in this._indices)
            if(indexedProperty in object) {
                var index = this._indexFor(indexedProperty, object[indexedProperty]);
                var pos = index.indexOf(id);
                if(pos != -1)
                    index.splice(pos, 1);
            }
    },

    _indicesFor: function(pattern) {
        var store = this._store;
        var relevantIndices = [];
        for(var indexedProperty in this._indices)
            if(indexedProperty.indexOf('.') != -1) {
                var propParts = indexedProperty.split('.');
                if((propParts[0] in pattern) &&
                   (propParts[1] in pattern[propParts[0]]))
                    relevantIndices.push(
                        this._indexFor(indexedProperty,
                                       pattern[propParts[0]][propParts[1]]))
            }
            else if(indexedProperty in pattern)
                relevantIndices.push(
                    this._indexFor(indexedProperty,
                                   pattern[indexedProperty]));

        return relevantIndices;
    }
};


// UTILITIES
// ----------------------------------------------------------------------

/**
 * Given an array of arrays, finds their intersection.
 *
 * Item comparison is done via indexOf().
 *
 */

function intersect(arrays) {
    arrays.sort(function(a, b) { return a.length - b.length; });

    var shortest = arrays[0];
    var rest     = arrays.slice(1);

    return shortest.filter(
        function(n) {
            return rest.every(
                function(array) {
                    return array.indexOf(n) != -1;
                });
        });
}

/**
 * Return true if _object_ matches _template_.
 *
 */

function match(object, template) {
    var value, pattern;
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
        else if(pattern && value && typeof(pattern) == 'object') {
            if(!match(value, pattern))
                return false;
        } 
        else if(pattern != value)
            return false;
    } 

    return true;
}

/**
 * Perform self-verification.
 *
 */

function verify() {
    function AssertionFailed(message) {
        this.message = message;
    }

    var assert = {
        equals: function(expected, given) {
            if(typeof(expected) != typeof(given))
                throw new AssertionFailed('Expected value of type ' + typeof('expected') + ', ' +
                                          'got value of type ' + typeof(given));
            else if(typeof(expected) == 'object') {
                for(var name in expected)
                    assert.equals(expected[name], given[name]);
                for(var name in given)
                    assert.equals(expected[name], given[name]);
            } else
                if(expected != given)
                    throw new AssertionFailed('Expected: ' + expected + ', got: ' + given);
        }
    };

    var tests = {
        'what goes in then gets out': function() {
            var db = new DB();
            var input = { name: 'ford', surname: 'prefect' };
            db.put(input);

            var results = db.get({ name: 'ford' });

            assert.equals(1, results.length)
            assert.equals(input, results[0]);
        },

        'entries can be replaced': function() {
            var db = new DB();

            db.put({ name: 'ford', surname: 'prefect' });
            assert.equals([{ id: 0, name: 'ford', surname: 'prefect'}], db.get({}));

            db.put({ name: 'arthur', surname: 'dent' }, 0);
            assert.equals([{ id: 0, name: 'arthur', surname: 'dent'}], db.get({}));
        },

        'indices are updated when entries are appended': function() {
            var db = new DB({indices: ['surname']});

            db.put({ name: 'ford', surname: 'prefect' });
            assert.equals({ 'prefect': [0] }, db._indices['surname']);

            db.put({ name: 'chrysler', surname: 'prefect' });
            assert.equals({ 'prefect': [0, 1] }, db._indices['surname']);
        },

        'indices get updated on replaced entries': function() {
            var db = new DB({indices: ['surname']});

            db.put({ name: 'ford', surname: 'prefect' });
            assert.equals({ 'prefect': [0] }, db._indices['surname']);

            db.put({ name: 'arthur', surname: 'dent' }, 0);
            assert.equals({ 'prefect': [], 'dent': [0] }, db._indices['surname']);
        },

        'indicize subproperty': function() {
            var db = new DB({indices: ['hobbies.favourite']});

            db.put({ name: 'ford', surname: 'prefect', hobbies: { favourite: 'travelling' }});
            assert.equals({ 'travelling': [0] }, db._indices['hobbies.favourite']);
        },

        'objects are deleted by setting a null at their id': function() {
            var db = new DB({indices: ['surname']});
            
            var id = db.put({ name: 'ford', surname: 'prefect'});
            assert.equals({ 'prefect': [0] }, db._indices['surname']);
            assert.equals([{ id: 0, name: 'ford', surname: 'prefect'}], db._store);

            db.put(null, id);
            assert.equals({ 'prefect': [] }, db._indices['surname']);
            assert.equals([], db._store);
        },

        'get objects using functions as matchers': function() {
            var db = new DB();

            db.put({ name: 'ford', surname: 'prefect' });
            assert.equals([{ id: 0, name: 'ford', surname: 'prefect' }],
                          db.get({ surname: function(s) { return s[0] == 'p'; }}));
        },

        'get indexed objects': function() {
            var db = new DB({indices: ['surname']});

            db.put({ name: 'ford', surname: 'prefect' });
            assert.equals([{ id: 0, name: 'ford', surname: 'prefect' }],
                          db.get({ surname: 'prefect' }));
        }
    };

    var report = [];
    for(var testName in tests)
        try {
            tests[testName].call();
        } catch(e) {
            report.push('**********************************************************************');
            report.push('FAILURE: ' + testName + '\n' + e.message);
            report.push(e.stack);
        }
    report.push('\nTests completed.');

    return report.join('\n');
}
