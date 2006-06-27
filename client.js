
var Transport = module.require('class', 'lib/socket');
var Session = module.require('class', 'session');

function constructor() {
    this._preWatches = [];
    this._postWatches = [];
    this._sessions = {};
}

/**
 * Manages multiple sessions and their transports.
 *
 * Provides single entry point to "toplevel" structures, i.e. sign on:
 *
 *  - transport connection
 *  - stream opening
 *  - authentication
 *  - roster request
 *  - initial presence
 *
 * And registration:
 *
 *  - transport connection
 *  - stream opening
 *  - ...
 *
 */

function signOn(jid, password, opts) {
    opts = opts || {};
    this.connect(jid, opts);
        
    var m = jid.match(/^([^@]+)@([^\/]+)\/(.+)$/);
    var username = m[1];
    var server   = m[2];
    var resource = m[3];
    var session = this._sessions[jid];
        
    session.send(
        <iq to={server} type="set"><query xmlns="jabber:iq:auth">
        <username>{username}</username>
        <password>{password}</password>
        <resource>{resource}</resource>
        </query></iq>,
        function(reply) {
             if(reply.stanza.@type == 'result') {
                 session.send(<iq type="get"><query xmlns="jabber:iq:roster"/></iq>);
                 session.send(<presence/>);
                 if(opts.continuation)
                     opts.continuation();
             }
         });
}

function signOff(jid) {
    this._sessions[jid].close();
}

function register(jid, password, opts) {
    opts = opts || {};
    this.connect(jid, opts);

    var m = jid.match(/^([^@]+)@([^\/]+)\/(.+)$/);
    var username = m[1];
    var server   = m[2];
    var resource = m[3];
    var session = this._sessions[jid];
    
    session.send(
        <iq to={server} type="set"><query xmlns="jabber:iq:auth">
        <username>{username}</username>
        <password>{password}</password>
        <resource>{resource}</resource>
        </query></iq>,
        function(reply) {
             if(reply.stanza.@type == 'result') {
                 session.send(<iq type="get"><query xmlns="jabber:iq:roster"/></iq>);
                 session.send(<presence/>);
             }
         });
}

function connect(jid, opts) {
    opts = opts || {};
    var server = opts.server || jid.match(/@([^\/]+)/)[1];
    var port = opts.port || 5222;        
        
    var transport = new Transport(server, port);
    var session = new Session(transport);

    transport.on(
        'data', function(data) {
            session._data('in', data);
        },
        'stop', function() {
            try {
                session.close();
            }
            catch(e) {}
        });

    session.on(
        {tag: 'data', direction: 'out'}, function(data) {
            transport.write(data.content);
        });

    var postWatches = this._postWatches;
    session.on(
        {tag: undefined}, function(object) {
            _handle1(object, postWatches, _match1);
        });

    transport.connect();
    session.open(jid.match(/@([^\/]+)/)[1]);        
    this._sessions[jid] = session;
}

function on(pattern, handler) {
    this._postWatches.push({pattern: pattern, handler: handler});
}

function send(sessionName) {
    var session = this._sessions[sessionName];
    session.send.apply(session, Array.prototype.slice.call(arguments, 1));
}


// ----------------------------------------------------------------------

function _handle1(object, watches, matcher) {
    for each(var watch in watches) {
        if(matcher(object, watch.pattern))
            watch.handler(object);
    }
}

function _match1(object, template) {
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


