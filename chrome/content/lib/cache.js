function Cache(changeCriteria, acceptCriteria) {
    this._store = [];
    this._changeCriteria = changeCriteria;
    this._acceptCriteria = acceptCriteria;
}

Cache.prototype = {
    receive: function(newObject) {
        if(this._acceptCriteria && !this._acceptCriteria(newObject))
            return;

        var change, doneChange, cachedObject;
        for(var i=0, l=this._store.length; i<l; i++) {
            cachedObject = this._store[i];
            change = this._changeCriteria(newObject, cachedObject);

            if(change !== undefined) {
                if(change === null)
                    this._store.splice(i, 1);
                else
                    this._store[i] = change;
                
                doneChange = true;
                break;
            }
        }
        if(!doneChange)
            this._store.push(newObject);
    },

    getEnumeration: function() {
        var i=0, cachedObjects = this._store.slice(0);
        
        var enumerator = {
            getNext: function() {
                return cachedObjects[i++];
            },

            hasMoreElements: function() {
                return i < cachedObjects.length;
            }
        }
        return enumerator;
    }
};
