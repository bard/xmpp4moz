
var Transport = module.require('class', 'lib/socket');
var Session = module.require('class', 'session');

function constructor() {
    this._sessions = {};
    this._observers = [];
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
    var port = opts.port || 5223;
    if(opts.ssl == undefined)
        opts.ssl = true;
    
    var transport = new Transport(server, port, { ssl: opts.ssl });
    var session = new Session(transport);

    transport.on(
        'data', function(data) {
            session.receive(data);
        },
        'stop', function() {
            try {
                session.close();
            }
            catch(e) {}
        });

    session.on(
        {event: 'data', direction: 'out'}, function(data) {
            transport.write(data.content);
        });

    var client = this;
    session.on(
        {stanza: function(s) { return s; }}, function(object) {
            client.notifyObservers(
                object.stanza, 'stanza-' + object.direction,
                jidOfSession(object.session));
        });
    session.on(
        {event: 'data'}, function(object) {
            client.notifyObservers(
                object.content, 'data-' + object.direction,
                jidOfSession(object.session));
        });

    transport.connect();
    session.open(jid.match(/@([^\/]+)/)[1]);        
    this._sessions[jid] = session;
}

function send(sessionName) {
    var session = this._sessions[sessionName];
    session.send.apply(session, Array.prototype.slice.call(arguments, 1));
}

function jidOfSession(session) {
    for(var jid in this._sessions)
        if(session == this._sessions[jid])
            return jid;
}

function getSessions() {
    var jids = [];
    for(var jid in this._sessions)
        jids.push(jid);
    return jids;
}

function addObserver(observer) {
    this._observers.push(observer);
}

function notifyObservers(subject, topic, data) {
    for each(var observer in this._observers)
        observer.observe(subject, topic, data);
}

function removeObserver(observer) {
    var index = this._observers.indexOf(observer);
    if(index != -1)
        this._observers.splice(index, 1);
}
