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
var XMLP          = module.require('package', 'lib/xmlsax').XMLP;

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
