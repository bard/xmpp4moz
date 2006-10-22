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


function Manager(matcher) {
    this._preWatches = [];
    this._postWatches = [];
    this._matcher = matcher || _match1;
}

Manager.prototype = {
    preHandle: function(event, info) {
        _handle1(event, info, this._preWatches, this._matcher);
    },

    postHandle: function(event, info) {
        _handle1(event, info, this._postWatches, this._matcher);
    },

    on: function(pattern, handler) {
        this._postWatches.push({pattern: pattern, handler: handler});
    },

    before: function(pattern, handler) {
        this._preWatches.push({pattern: pattern, handler: handler});    
    }
};

// ----------------------------------------------------------------------
// BACKEND - SIDE EFFECTS FREE

function _handle1(event, info, watches, matcher) {
    for each(var watch in watches) {
        if(matcher(event, watch.pattern))
            if(typeof(event) == 'string')
                watch.handler(info);
            else
                watch.handler(event);
    }
}

function _match1(object, template) {
    if(typeof(object) == 'string' &&
       typeof(template) == 'string' &&
       object == template) {
        return true;
    }

    var pattern, value;
    for(var member in template) {
        value = object[member];
        pattern = template[member];
        
        if(pattern === undefined)
            ;
        else if(pattern && typeof(pattern) == 'function') {
            if(!pattern(value))
                return false;
        }
        else if(pattern && typeof(pattern.test) == 'function') {
            if(!pattern.test(value))
                return false;
        }
        else if(pattern && pattern.id) {
            if(pattern.id != value.id)
                return false;
        }
        else if(pattern != value)
            return false;
    } 

    return true;
}

