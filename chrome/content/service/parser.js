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


var XMLP = module.require('package', 'lib/xmlsax').XMLP;

var _document = Components
    .classes['@mozilla.org/xml/xml-document;1']
    .createInstance(Components.interfaces.nsIDOMXMLDocument);

function constructor() {
    this._scanner = new XMLP();
    this._current = null;
    this._characterData = '';
}

function setObserver(observer) {
    this._observer = observer;
}
    
function parse(string) {
    if(_isWhiteSpace(string))
        return;

    var event;
    this._scanner.feed(string);

    do {
        event = this._scanner.next();

        if(event == XMLP._TEXT || event == XMLP._ENTITY) {
            this._characterData += 
                this._scanner.getContent().substr(
                    this._scanner.getContentBegin(),
                    this._scanner.getContentEnd() - this._scanner.getContentBegin());
        }

        if(event == XMLP._ELM_B || event == XMLP._ELM_EMP) {
            this._handleCharacterData();
                    
            var name = this._scanner.getName();
            switch(name) {
            case 'stream:stream':
                this._observer.onStart(this._scanner.getAttributeValueByName('id'));
                break;
            default:
                var e = _document.createElement(name);

                for(var i=0; i<this._scanner.getAttributeCount(); i++)
                    e.setAttribute(
                        this._scanner.getAttributeName(i),
                        this._scanner.getAttributeValue(i));
                
                if(this._current)
                    this._current = this._current.appendChild(e);
                else
                    this._current = e;
            }
        }

        if(event == XMLP._ELM_E || event == XMLP._ELM_EMP) {
            this._handleCharacterData();
                    
            var name = this._scanner.getName();

            switch(name) {
            case 'stream:stream':
                this._observer.onStop();
                break;
            default:
                if(this._current.parentNode == null)
                    this._observer.onStanza(this._current);

                this._current = this._current.parentNode;
            }                    
        }

    } while(event != XMLP._NONE && event != XMLP._ERROR);

    this._scanner.releaseBuffer();
}

function _handleCharacterData() {
    if(!_isWhiteSpace(this._characterData))
        this._fullCharacterDataReceived();
    this._characterData = '';
}

function _fullCharacterDataReceived() {
    this._current.appendChild(
        _document.createTextNode(this._characterData));
}

function _isWhiteSpace(string) {
    return /^\s*$/.test(string);
}

