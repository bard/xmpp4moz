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


/**
 * The session component sits between the network and the XMPP
 * service, mediating exchange of XMPP stanzas and doing some
 * bookkeeping in the meanwhile, such as stamping outgoing stanzas
 * with unique IDs and remembering what handler to run when a reply to
 * a specific stanza is received.
 *
 * Input from the network is expected to be fed to the receive()
 * method.  It resurfaces in session and can be listened through an
 * observer, watching for the 'data-out' topic.
 *
 */


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader);
const serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Ci.nsIDOMSerializer);


// INITIALIZATION
// ----------------------------------------------------------------------

function init() {
    this._isOpen = false;
    this._idCounter = 1000;
    this._pending = {};
    this._observers = [];

    this.__defineGetter__(
        'name', function() {
            return this._name;
        });
}

function setName(string) {
    this._name = string;
}


// PUBLIC INTERFACE - SESSION MANAGEMENT AND DATA EXCHANGE
// ----------------------------------------------------------------------

/**
 * Send the stream prologue.
 *
 */

function open(server) {
    if(this._isOpen)
        throw new Error('Session already opened.');

    this.send('<?xml version="1.0"?>' +
              '<stream:stream xmlns="jabber:client" ' +
              'xmlns:stream="http://etherx.jabber.org/streams" ' +
              'to="' + server + '">');

    this._stream('out', 'open');
}

/**
 * Send the stream epilogue.
 *
 */

function close() {
    if(!this._isOpen)
        throw new Error('Session already closed.');

    this._stream('out', 'close');
    this.send('</stream:stream>');
}

function isOpen() {
    return this._isOpen;
}

/**
 * Send data to the other side.  Conversion to XML DOM will be
 * attempted internally; if successful, stanza will be stamped with
 * unique id.  If observer is provided and the data was valid XML,
 * observer will be called upon reception of reply.
 *
 */

function send(data, replyObserver) {
    if(/^(<\?xml version="1.0"\?><stream:stream|<\/stream:stream>|\s*$)/.test(data))
        // Session: work around apparently uncatchable exception from
        // parseFromString() by not attempting to parse known invalid
        // XML (stream prologue/epilogue, keepalives).
        this._data('out', data);
    else {
        var domStanza = parseOut(data);
        if(domStanza.tagName == 'parsererror' ||
           domStanza.namespaceURI == 'http://www.mozilla.org/newlayout/xml/parsererror.xml')
            this._data('out', data);
        else
            this._stanza('out', domStanza, replyObserver);
    } 
}

/**
 * Receive text or XML from the other side.
 *
 */

function receive(data) { 
    this._data('in', data);
}
    
function addObserver(observer) {
    this._observers.push(observer);    
}

function removeObserver(observer) {
    var index = this._observers.indexOf(observer);
    if(index != -1) 
        this._observers.splice(index, 1);    
}


// INTERNALS
// ----------------------------------------------------------------------

function _stream(direction, state) {
    if(direction == 'in' && state == 'open')
        this._isOpen = true;
    else if(direction =='out' && state == 'close')
        this._isOpen = false;

    this.notifyObservers(state, 'stream-' + direction, this.name);
}

function _data(direction, data) {
    this.notifyObservers(data, 'data-' + direction, this.name);

    if(direction == 'in') {
        if(/<stream:stream/.test(data))
            this._stream('in', 'open');
        else {
            var streamClosed = false;
            if(endsWith(data, '</stream:stream>')) {
                data = data.substr(0, s.length - '</stream:stream>'.length)
                streamClosed = true;
            }

            var batch = parseIn(data);
            if(batch) {
                var node = batch.firstChild;
                while(node) {
                    if(node.nodeType == Ci.nsIDOMNode.ELEMENT_NODE)
                        this._stanza(
                            'in', (node.getAttribute('xmlns') == 'jabber:client' ?
                                   attrFilter(node, function(attrName, attrValue) {
                                                  return !(attrName == 'xmlns' && attrValue == 'jabber:client');
                                              }) :
                                   node));

                    node = node.nextSibling;
                }
            }

            if(streamClosed)
                this._stream('in', 'close');
        }
    }
}

function _stanza(direction, domStanza, replyObserver) {
    switch(direction) {
    case 'in':
        var id = domStanza.getAttribute('id');
        if(this._pending[id]) {
            var _this = this;
            try {
                this._pending[id].observe(domStanza, 'reply-in', _this.name);
            } catch(e) {
                Cu.reportError(e);
            } finally {
                delete this._pending[id];
            }
        }
        break;
    case 'out':
        domStanza.setAttribute('id', this._idCounter++);
        if(replyObserver)
            this._pending[domStanza.getAttribute('id')] = replyObserver;
        this._data('out', serializer.serializeToString(domStanza));
        break;
    }

    this.notifyObservers(domStanza, 'stanza-' + direction, this.name);
}

function notifyObservers(subject, topic, data) {
    if(typeof(subject) == 'string') {
        var xpcString = Cc["@mozilla.org/supports-string;1"]
            .createInstance(Ci.nsISupportsString);
        xpcString.data = subject;
        subject = xpcString;
    }
    
    for each(var observer in this._observers) 
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Cu.reportError(e);
        }    
}

function attrFilter(srcNode, filterFn) {
    function serialize(element) {
        return Cc['@mozilla.org/xmlextras/xmlserializer;1']
            .getService(Ci.nsIDOMSerializer)
            .serializeToString(element);
    }

    var dstNode;
    switch(srcNode.nodeType) {
    case srcNode.ELEMENT_NODE:
        dstNode = srcNode.ownerDocument.createElement(srcNode.nodeName);
        for(var i=0, l=srcNode.attributes.length, attr;
            i<l; i++) {
            attr = srcNode.attributes[i];
            if(filterFn(attr.name, attr.value) == false)
                continue;
            else
                dstNode.setAttribute(attr.name, attr.value);
        }

        var child = srcNode.firstChild;
        while(child) {
            dstNode.appendChild(arguments.callee(child, filterFn));
            child = child.nextSibling;
        }
        break;
    default:
        dstNode = srcNode;
    }

    return dstNode;
}

function parseOut(data) {
    var _ = arguments.callee;
    _.parser = _.parser || Cc['@mozilla.org/xmlextras/domparser;1'].getService(Ci.nsIDOMParser);

    return _.parser.parseFromString(data, 'text/xml').documentElement;
}

/**
 * Parse incoming data.
 *
 * A single <stream:stream> element is returned, containing one or
 * more XMPP stanzas and other stream-level elements.
 *
 * If data does not parse correctly, we assume it is because the
 * server did not send complete XML input.  Thus, we store data in a
 * buffer and return null.  Next time the function is called, we parse
 * the buffered data plus the newly received data.
 *
 * Because of internal state, this function is more like an object.
 * Use with care.
 *
 */

function parseIn(data) {
    var _ = arguments.callee;

    _.buffer = _.buffer || '';
    _.parser = _.parser || Cc['@mozilla.org/xmlextras/domparser;1'].getService(Ci.nsIDOMParser);

    var batch = _.parser.parseFromString(
        '<stream:stream xmlns:stream="http://etherx.jabber.org/streams">' +
        _.buffer + data +
        '</stream:stream>',
        'text/xml').documentElement;

    if(batch.nodeName == 'parsererror') {
        _.buffer += data;
        return null;
    } else {
        _.buffer = '';
        return batch;
    }
}

function endsWith(string, suffix) {
    return string.substr(string.length - suffix.length) == suffix;
}
