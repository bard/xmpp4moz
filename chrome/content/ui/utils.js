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


// UTILITIES (GENERIC)
// ----------------------------------------------------------------------

function ns(name) {
    return window['ns_' + name];
}


// GUI UTILITIES (GENERIC)
// ----------------------------------------------------------------------

/**
 * Given a parent element, a namespaced attribute and a value, returns
 * the first parent's child with given attribute set to the given value.
 *
 * Uses:
 *   - document
 *   - ns('namespacePrefix') -> 'namespaceURL'
 *
 * Used by:
 *   - _()
 *
 */

function getElementByAttributeNS(parent, prefix, name, value) {
    function getElementInDocument(parent, prefix, name, value) {
        return x(parent, './/*[@' + (prefix ? prefix + ':' : '') +
                 name + '="' + value + '"]');
    }

    function getElementNotYetInDocument(parent, namespace, name, value) {
        for(var child = parent.firstChild; child; child = child.nextSibling)
            if(child.getAttributeNS && child.getAttributeNS(namespace, name) == value)
                return child;

        for(var child = parent.firstChild; child; child = child.nextSibling) {
            var matchingChild = getElementNotYetInDocument(child, namespace, name, value);
            if(matchingChild)
                return matchingChild;
        }
    }

    // XXX this in-document test will not work for elements at the toplevel
    return (parent.parentNode == document) ?
        getElementNotYetInDocument(parent, ns(prefix), name, value) :
        getElementInDocument(parent, prefix, name, value);
}

/**
 * Document simple query.
 *
 * _(element)
 *   Returns the document element itself.
 *
 * _('id')
 *   Returns the document element with the given id.
 *
 * _(element, {attrName: 'attrValue'}), _('id', {attrName: 'attrValue'})
 *   Returns the first element's child with given value for given attribute.
 *
 * _(element, {'ns:attrName': 'attrValue'}), _('id', {'ns:attrName': 'attrValue'})
 *   Returns the first element's child with given value for given namespaced attribute.
 *
 */

function _(element, descendantQuery) {
    if(typeof(element) == 'string')
        element = document.getElementById(element);

    if(typeof(descendantQuery) == 'object')
        for(var attrName in descendantQuery) {
            var match = attrName.match(/^(.*?:)?(.+)$/);
            var nsPrefix = match[1] ? match[1].slice(0,-1) : null;
            var attrLocalName = match[2];

            element = getElementByAttributeNS(
                element, nsPrefix, attrLocalName, descendantQuery[attrName]);
        }

    return element;
}

/**
 * Document XPath query.
 *
 * x('XPathQuery')
 *   Returns element matching the query, taking the document as context node.
 *
 * x(element, 'XPathQuery')
 *   Returns element matching the query, taking the given element as context node.
 *
 * Uses:
 *   - document
 *   - ns('namespacePrefix') -> 'namespaceURL'
 *
 */

function x() {
    var contextNode, path;
    if(arguments[0] instanceof Element) {
        contextNode = arguments[0];
        path = arguments[1];
    }
    else {
        path = arguments[0];
        contextNode = document;
    }

    function resolver(prefix) {
        return ns(prefix);
    }

    return document.evaluate(
        path, contextNode, resolver, XPathResult.ANY_UNORDERED_NODE_TYPE, null).
        singleNodeValue;
}

/**
 * Returns the clone of an element in the blueprints area.
 *
 * Uses:
 *   - x('XPathQuery') -> element
 *
 */

function cloneBlueprint(role) {
    return x('//*[@id="blueprints"]/*[@xulx:role="' + role + '"]').
        cloneNode(true);
}

/**
 * Starting from element, travels the ancestor chain looking for an
 * attribute with the given name and namespace, and when found returns
 * its value.
 *
 */

function getAncestorAttributeNS(element, namespace, attrLocalName) {
    while(element.parentNode && element.parentNode.hasAttributeNS) {
        if(element.parentNode.hasAttributeNS(namespace, attrLocalName))
            return element.parentNode.getAttributeNS(namespace, attrLocalName);
        element = element.parentNode;
    }
    return null;
}

/**
 * Returns the value of attrName in the context where element is,
 * i.e. as attribute of the element itself, or of any in its ancestor
 * chain, starting from element and going up.
 *
 */

function attr(element, attrName) {
    var match = attrName.match(/^(.*?:)?(.+)$/);
    var nsPrefix = match[1] ? match[1].slice(0,-1) : null;
    var namespace = ns(nsPrefix);
    var attrLocalName = match[2];

    if(element.hasAttributeNS(namespace, attrLocalName))
        return element.getAttributeNS(namespace, attrLocalName);
    else
        return getAncestorAttributeNS(element, namespace, attrLocalName);
}
