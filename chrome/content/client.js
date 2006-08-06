
var Transport = module.require('class', 'lib/socket');
var Session = module.require('class', 'session');

function constructor() {
    this._sessions = [];
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
        
    var m = jid.match(/^([^@]+)@([^\/]+)\/(.+)$/);
    var username = m[1];
    var server   = m[2];
    var resource = m[3];
    var session = this.connect(jid, opts);
        
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
    var session = this.getSession(jid);
    session.close();
    // TODO: actually session should be removed on close event, not on
    // signOff request
    this._sessions.splice(this._sessions.indexOf(session), 1);    
}

function register(jid, password, opts) {
    opts = opts || {};

    var m = jid.match(/^([^@]+)@([^\/]+)\/(.+)$/);
    var username = m[1];
    var server   = m[2];
    var resource = m[3];
    var session = this.connect(jid, opts);
    
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
    var session = new Session(jid);

    transport.on(
        'data', function(data) {
            session.receive(data);
        });

    transport.on(
        'start',
        function() {});

    transport.on(
        'stop', function() {
            try {
                session.close();
            }
            catch(e) {}
        });

    var client = this;
    session.on(
        {event: 'data', direction: 'out'}, function(data) {
            transport.write(data.content);
        });
    session.on(
        {stanza: function(s) { return s; }}, function(object) {
            client.notifyObservers(
                object.session, 'stanza-' + object.direction, object.stanza);
        });
    session.on(
        {event: 'data'}, function(data) {
            client.notifyObservers(
                data.session, 'data-' + data.direction, data.content);
        });
    session.on(
        {event: 'stream'}, function(stream) {
            client.notifyObservers(
                stream.session, 'stream-' + stream.direction, stream.state);
        });

    transport.connect();
    session.open(jid.match(/@([^\/]+)/)[1]);
    this._sessions.push(session);
    return session;
}

function send(sessionName) {
    var session = this.getSession(sessionName);
    session.send.apply(session, Array.prototype.slice.call(arguments, 1));
}

function getSession(name) {
    for each(var session in this._sessions)
        if(session.name == name)
            return session;
}

function getSessions() {
    return this._sessions;
}

function addObserver(observer) {
    this._observers.push(observer);
}

function notifyObservers(subject, topic, data) {
    for each(var observer in this._observers)
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            dump('Observer reported exception: ' + e + '\n');
        }
}

function removeObserver(observer) {
    var index = this._observers.indexOf(observer);
    if(index != -1) 
        this._observers.splice(index, 1);
}
