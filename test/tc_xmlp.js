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
var module        = new ModuleManager(['../..']);
var XMLP          = module.require('package', 'xmppjs/xmlsax').XMLP;

var spec = new Specification('Additions to XMLP');

spec.stateThat = {
    'Scanner recognizes single-character empty elements': function() {
        var scanner = new XMLP('<x></x>');
            
        event = scanner.next();
        assert.equals(XMLP._ELM_B, event);
        assert.equals('x', scanner.getName());

        event = scanner.next();
        assert.equals(XMLP._ELM_E, event);
        assert.equals('x', scanner.getName());
    },

    'Scanner recognizes single-characters empty shortened elements': function() {
        var scanner = new XMLP('<x/>');

        event = scanner.next();
        assert.equals(XMLP._ELM_EMP, event);
        assert.equals('x', scanner.getName());
    },

    'Scanner clear buffers after parses, leaving only what is needed for successive parses': function() {
        var scanner = new XMLP();

        function consume() {
            var event;
            do {
                event = scanner.next();
            } while(event != XMLP._NONE && event != XMLP._ERROR);
            scanner.releaseBuffer();
        }

        assert.equals('', scanner.m_xml);

        scanner.feed('<stream:stream id="123"><message>');
        consume();
        assert.equals('', scanner.m_xml);

        scanner.feed('<body>hello</body></me');
        consume();
        assert.equals('</me', scanner.m_xml);

        scanner.feed('ssage>');
        consume();
        assert.equals('', scanner.m_xml);
    }    
};
