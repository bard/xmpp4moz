function constructor() {
    this._store = [];    
}

function receive(newObject) {
    if(newObject.stanza.hasAttribute('type') &&
       newObject.stanza.getAttribute('type') != 'unavailable')
        return;

    var found, cachedObject;
    for(var i=0, l=this._store.length; i<l; i++) {
        cachedObject = this._store[i];
        if(cachedObject.session.name == newObject.session.name &&
           cachedObject.stanza.getAttribute('from') == newObject.stanza.getAttribute('from')
           && cachedObject.stanza.getAttribute('to') == newObject.stanza.getAttribute('to')) {
            found = true;
            break;
        }
    }

    if(found) 
        if(newObject.stanza.getAttribute('type') == 'unavailable')
            this._store.splice(i, 1);
        else
            this._store[i] = newObject;
    else 
        this._store.push(newObject);
        
}

function copy() {
    return this._store.slice(0);
}
