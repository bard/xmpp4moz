
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

