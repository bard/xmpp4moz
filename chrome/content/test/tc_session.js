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