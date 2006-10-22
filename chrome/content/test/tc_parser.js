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


var Specification = mozlab.mozunit.Specification;
var assert        = mozlab.mozunit.assertions;
var module        = new ModuleManager(['..']);
var Parser        = module.require('class', 'parser');

var spec = new Specification('Parser');

var serializer = new XMLSerializer();

spec.stateThat = {
    'Recognize start event': function() {
        var parser = new Parser();

        var startSeen = false;
        parser.on(
            'start', function() {
                startSeen = true;
            });
            
        parser.parse('<stream:stream id="123"></stream>');
        assert.isTrue(startSeen);
    },

    'Recognize stop event': function() {
        var parser = new Parser();

        var stopSeen = false;
        parser.on(
            'stop', function() {
                stopSeen = true;
            });

        parser.parse('<stream:stream id="123"></stream:stream>');
        assert.isTrue(stopSeen);
    },

    'Recognize message, presence and iq stanzas': function() {
        var parser = new Parser();
            
        var stanza;
        parser.on(
            'stanza', function(s) {
                stanza = s;
            });

        parser.parse('<stream:stream id="1">');

        parser.parse('<message from="foo@localhost"><body>hello</body></message>');
        assert.equals(
            '<message from="foo@localhost"><body>hello</body></message>',
            serializer.serializeToString(stanza));

        parser.parse('<presence from="foo@localhost"/>');
        assert.equals(
            '<presence from="foo@localhost"/>',
            serializer.serializeToString(stanza));

        parser.parse('<iq from="foo@localhost"><query/></iq>');
        assert.equals(
            '<iq from="foo@localhost"><query/></iq>',
            serializer.serializeToString(stanza));
    },

    'Recognize empty stanza': function() {
        var parser = new Parser();

        var stanza;
        parser.on(
            'stanza', function(s) {
                stanza = s;
            });
          
        parser.parse('<stream:stream id="123">');

        parser.parse('<presence/>');
        assert.equals(
            '<presence/>',
            serializer.serializeToString(stanza));
    },

    'Recognize stanza event with empty element': function() {
        var parser = new Parser();

        var stanza;
        parser.on(
            'stanza', function(s) {
                stanza = s;
            });

        parser.parse('<stream:stream id="123">');


        parser.parse('<message><x/></message>');
        assert.equals(
            '<message><x/></message>',
            serializer.serializeToString(stanza));
    },

    'Accept document prolog': function() {
        var parser = new Parser();
        // WRITE
    },

    'Recognize attributes': function() {
        var parser = new Parser();

        parser.parse('<stream:stream id="123"><message from="foo@localhost">');
        assert.equals('foo@localhost', parser._current.getAttribute('from'));
    },

    'Recognize elements interspersed with text nodes': function() {
        var parser = new Parser();

        var stanza;
        parser.on(
            'stanza', function(s) {
                stanza = s;
            });
            
        parser.parse('<stream:stream id="123"><message><body>hello <i>nice</i> world</body></message>');

        assert.equals(
            '<message><body>hello <i>nice</i> world</body></message>',
            serializer.serializeToString(stanza));
    },

    // LEGACY TESTS

    'Fragments are recognized and put parser in the correct state': function() {
        var parser = new Parser();

        parser.parse('<message>');
        assert.equals('message', parser._current.nodeName);
        parser.parse('<body>');
        assert.equals('body', parser._current.nodeName);
        parser.parse('</body>');
        assert.equals('message', parser._current.nodeName);
        assert.equals('body', parser._current.childNodes[0].nodeName);
        parser.parse('</message>');
        assert.equals(null, parser._current);
    },

    'Whitespace and garbage out of elements is ignored': function() {
        var parser = new Parser();

        //assert.fail('Undecided.')

        parser.parse(' ');
        assert.equals(null, parser._current);
        parser.parse('abc');
        assert.equals(null, parser._current);        
        parser.parse('<message>');
        assert.equals('message', parser._current.nodeName);
    },

    'Entities are recognized': function() {
        var parser = new Parser();

        parser.parse("<message from='jabber.sameplace.cc' to='bard@jabber.sameplace.cc' type='chat'><body>The user &apos;joe@localhost&apos; was just created on node ejabberd@localhost.</body>");
        assert.equals('message', parser._current.nodeName);
        assert.equals('body', parser._current.childNodes[0].nodeName);
        assert.equals("The user \'joe@localhost\' was just created on node ejabberd@localhost.",
                      parser._current.childNodes[0].textContent);

    },

    'Start of stream is recognized': function() {
        var parser = new Parser();

        var started = false;
        parser.on(
            'start', function(sessionID) {
                started = true;
            });
        parser.on(
            'stop', function() {
                started = false;
            });
        
        assert.isFalse(started);
        
        parser.parse("<?xml version='1.0'?>" +
                     "<stream:stream xmlns='jabber:client' " +
                     "xmlns:stream='http://etherx.jabber.org/streams' " +
                     "id='2622060002' from='localhost' xml:lang='en'>");
        assert.isTrue(started);

        parser.parse("</stream:stream>");
        assert.isFalse(started);
    },

    'Single element is parsed': function() {
        var parser = new Parser();

        var element;
        parser.on(
            'stanza', function(e) {
                element = e;
            });
        parser.parse("<message from='deepthought@future.com' " +
                     "to='man@future.com' xml:lang='en'>" +
                     "<body>42!</body></message>");

        assert.equals('message', element.nodeName);
        assert.equals('deepthought@future.com', element.getAttribute('from'));
        assert.equals('42!', element.childNodes[0].textContent);
    },

    'Multiple subsequent element are parsed': function() {
        var parser = new Parser();

        var count = 0;
        parser.on(
            'stanza', function(e) {
                count += 1;
            });

        parser.parse(
            '<stream:stream>' +
            '<presence from="bar@localhost/test" type="unavailable"/>')

        parser.parse(
            '<message from="bar@localhost/test"><body>hello</body></message>' +
            '<message from="bar@localhost/test"><body>how are you?</body></message>' +
            '</stream:stream>'
            );
        
        assert.equals(3, count);
    }
};

