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

        assert.fail('Undecided.')

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

