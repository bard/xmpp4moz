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

var spec = new Specification('Session');

var Session = module.require('class', 'session');

spec.stateThat = {
    'Open stream': function() {
        var session = new Session();
        var output;
        session.on({tag: 'data', direction: 'out'},
                   function(data) { output = data.content; });

        session.open('localhost');
        assert.equals('<?xml version="1.0"?>' +
                      '<stream:stream xmlns="jabber:client" ' +
                      'xmlns:stream="http://etherx.jabber.org/streams" '+
                      'to="localhost">', output);
    },

    'Close stream': function() {
        var session = new Session();
        var output;
        session.on({tag: 'data', direction: 'out'},
                   function(data) { output = data.content; });

        session.open();
        session.close();
        assert.equals('</stream:stream>', output);       
    },

    'Tell if stream is open or not': function() {
        var session = new Session();

        assert.isFalse(session.isOpen());
        session.open();
        assert.isTrue(session.isOpen());
        session.close();
        assert.isFalse(session.isOpen());
    },

    'Error if opening already opened session': function() {
        var session = new Session();

        session.open();
        assert.raises(new Error(), function() {
                          session.open();
                      });
    },

    'Error if closing already closed session': function() {
        var session = new Session();        

        session.open();
        session.close();
        assert.raises(new Error(), function() {
                          session.close();
                      });
    },

    'Accept incoming data': function() {
        
    },

    'Expose outgoing data via handler': function() {
        
    },
    
    'Register procedures to handle incoming and outgoing data': function() {

    },

    'Register procedures to handle incoming and outgoing stanzas': function() {
        var session = new Session();

        var seen = [];
        session.on({tag: 'iq'}, function(iq) { seen.push(iq); });
        session.on({tag: 'presence'}, function(presence) { seen.push(presence) });

        session.send(<iq type="get"/>);
        session.send(<presence/>);
        session.send(<iq type="set"/>);

        assert.equals('iq', seen[0].stanza.name());
        assert.equals('presence', seen[1].stanza.name());
        assert.equals('iq', seen[2].stanza.name());
    },

    'Send plain text': function() {
        var session = new Session();
        var output;
        session.on({tag: 'data', direction: 'out'},
                   function(data) { output = data.content; });

        session.send('<message to="alyssa@localhost"/>')
        assert.equals('<message to="alyssa@localhost"/>', output);
    },

    'Send XML stanzas': function() {
        var session = new Session();
        var output;
        session.on({tag: 'data', direction: 'out'},
                   function(data) { output = data.content; });

        session.send(<message to="alyssa@localhost"/>);
        assert.equals('<message to="alyssa@localhost" id="1000"/>', output);
    },

    'Stamp outgoing XML stanzas with incrementing IDs': function() {
        var session = new Session();
        var output;
        session.on({tag: 'data', direction: 'out'},
                   function(data) { output = data.content; });

        session.send(<message to="alyssa@localhost"/>)
        assert.equals('<message to="alyssa@localhost" id="1000"/>', output);
        session.send(<message to="alyssa@localhost"/>)
        assert.equals('<message to="alyssa@localhost" id="1001"/>', output);
    },

    'Optionally associate a reply handler to an XML stanza': function() {
        var session = new Session();
        var output, reply;
        session.on({tag: 'data', direction: 'out'},
                   function(data) { output = data.content.replace(/\n\s*/mg, ''); });
        
        session.send(<iq type="get"><query xmlns="test"/></iq>,
                     function(r) { reply = r; });
        assert.equals('<iq type="get" id="1000"><query xmlns="test"/></iq>', output);

        session.receive(<iq id="1000" type="result"/>);
        assert.equals('iq', reply.stanza.name())
    },

    'Stanzas passed to handlers know to what session they belong': function() {
        var session = new Session();
        var seen = [];
        
        session.on({tag: 'iq'}, function(iq) {
                       seen.push(iq);
                   });
        
        session.send(<iq type="get"/>);
        session.receive(<iq type="result"/>);

        assert.equals(session, seen[0].session);
        assert.equals(session, seen[1].session);
    }
};

spec.verify();