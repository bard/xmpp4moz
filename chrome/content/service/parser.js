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

