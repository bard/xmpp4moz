function Query() {
    this._fragments = [];
}

Query.prototype = {
    event: function(val) {
        this._event = val;
        return this;
    },

    id: function(val) {
        this._id = val;
        return this;
    },

    type: function(val) {
        this._type = val;
        return this;
    },

    direction: function(val) {
        this._direction = val;
        return this;
    },

    account: function(val) {
        this._account = val;
        return this;
    },

    from: function(val) {
        this._from = val;
        return this;
    },

    to: function(val) {
        this._to = val;
        return this;
    },

    query: function(val) {
        this._fragments.push('/' + val + ':query');
        return this;
    },

    xpath: function(val) {
        this._fragments.push(val);
        return this;
    },

    compile: function() {
        var q = '//' + this._event;

        // stanza-level attributes

        var attrs = [];
        if(this._id)
            attrs.push('@id="' + this._id + '"');
        if(this._type)
            attrs.push('@type="' + this._type + '"');
        if(this._from)
            attrs.push(this._from.indexOf('/') == -1 ?
                       // "from" doesn't contain a resource, so we're
                       // either asking the bare jid itself, or for
                       // the jid with any resource.
                       '(@from = "' + this._from + '" or starts-with(@from, "' + this._from + '/"))' :
                       '@from="' + this._from + '"');
        if(this._to)
            attrs.push(this._to.indexOf('/') == -1 ?
                       // since "to" doesn't contain a resource,
                       // make it a substring check.
                       '(@to = "' + this._to + '" or starts-with(@to, "' + this._to + '/"))' :
                       '@to="' + this._to + '"');
        if(attrs.length > 0)
            q += '[' + attrs.join(' and ') + ']'

        // xmpp4moz metadata (account and direction of travelling)

        var meta = [];
        if(this._direction)
            meta.push('@direction="' + this._direction + '"');
        if(this._account)
            meta.push('@account="' + this._account + '"');
        if(meta.length > 0)
            q += '/x4m:meta[' + meta.join(' and ') + ']'

        // XPath fragments

        if(this._fragments.length > 0) {
            var reset = '/ancestor-or-self::' + this._event;
            q += this._fragments.map(function(fragment) {
                return reset + fragment;
            }).join('');
        }

        q += '/ancestor-or-self::' + this._event;

        return q;
    }
}

