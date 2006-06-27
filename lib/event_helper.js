function constructor() {
    this._eventHandlers = {};
}

function on() {
    var eventName, eventListener;
    for(var i=0, l=arguments.length; i<l; i+=2) {
        eventName = arguments[i];
        eventListener = arguments[i+1];
        
        if(!this._eventHandlers[eventName])
            this._eventHandlers[eventName] = [];
        this._eventHandlers[eventName].push(eventListener);
    }
    return arguments[arguments.length-1];
}

function forget(eventName, eventHandler) {
    var eventHandlers = this._eventHandlers[eventName];
    if(!eventHandlers)
        return;
        
    var index = eventHandlers.indexOf(eventHandler);
    if(index == -1)
        return;
        
    eventHandlers.splice(index, 1);
    return eventHandler;
}

function _handle(eventName, eventInfo) {
    if(this._eventHandlers[eventName])
        for each(var eventHandler in this._eventHandlers[eventName]) 
            eventHandler(eventInfo);
}
