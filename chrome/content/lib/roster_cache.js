function constructor() {
    this._store = [];
}

function receive(newObject) {

    var cachedObject, found;
    for(var i=0, l=this._store.length; i<l; i++) {
        cachedObject = this._store[i];
        if(cachedObject.session.name == newObject.session.name) {
            found = true;
            break;
        }
    }

    function getRosterItem(query, jid) {
        var items = query.childNodes;
        for(var i=0, l=items.length; i<l; i++)
            if(items[i].getAttribute('jid') == jid)
                return items[i];
    }

    if(!found) 
        this._store.push(newObject);
    else {
        var newQuery = newObject.stanza.getElementsByTagName('query')[0];
        var cachedQuery = cachedObject.stanza.getElementsByTagName('query')[0];
        var newItem;
        for(var i=0, l=newQuery.childNodes.length; i<l; i++) {
            newItem = newQuery.childNodes[i];
            cachedItem = getRosterItem(cachedQuery, newItem.getAttribute('jid'));
            if(cachedItem)
                if(newItem.getAttribute('subscription') == 'remove')
                    cachedQuery.removeChild(cachedItem);
                else
                    cachedQuery.replaceChild(newItem.cloneNode(true), cachedItem);
            else
                cachedQuery.appendChild(newItem);
        }
    }
}

function copy() {
    return this._store.slice(0);
}
