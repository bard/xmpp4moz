/*
 * Copyright 2006-2007 by Massimiliano Mirra
 * 
 * This file is part of xmpp4moz.
 * 
 * xmpp4moz is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 * 
 * xmpp4moz is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 * Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
 *  
 */


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
