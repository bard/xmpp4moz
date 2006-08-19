// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

Components
.classes['@mozilla.org/moz/jssubscript-loader;1']
.getService(Components.interfaces.mozIJSSubScriptLoader)
    .loadSubScript('chrome://xmpp4moz/content/lib/module_manager.js');

const module = new ModuleManager(['chrome://xmpp4moz/content']);
const Transport = module.require('class', 'lib/socket');
const Session = module.require('class', 'session');


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [];

var sessions = {
    _list: [],

    opened: function(session) {
        this._list.push(session)
    },

    closed: function(thing) {
        var session = (typeof(thing) == 'string' ?
                       this.get(thing) : thing);

        this._list.splice(
            this._list.indexOf(session), 1);
    },

    get: function(jid) {
        for each(var session in this._list) {
            if(session.name == jid)
                return session;
        }
    }
};


// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

function isUp(jid) {
    var session = sessions.get(jid);
    return (session && session.isOpen());
}

function open(jid, server, port, ssl) {
    server = server || jid.match(/@([^\/]+)/)[1];
    port = port || 5223;
    ssl = ssl || true;
    
    var transport = new Transport(server, port, { ssl: ssl });
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
                null, 'stanza-' + object.direction + '-' + object.session.name, object.stanza);
        });
    session.on(
        {event: 'data'}, function(data) {
            client.notifyObservers(
                null, 'data-' + data.direction + '-' + data.session.name, data.content);
        });
    session.on(
        {event: 'stream'}, function(stream) {
            client.notifyObservers(
                null, 'stream-' + stream.direction + '-' + stream.session.name, stream.state);
        });

    transport.connect();
    session.open(jid.match(/@([^\/]+)/)[1]);
    sessions.opened(session);
    return session;
}

function close(jid) {
    sessions.get(jid).close();
    // TODO: actually session should be removed on close event, not on
    // signOff request
    sessions.closed(jid);
}

function send(sessionName, stanza, observer) {
    var handler;
    if(observer) 
        handler = function(reply) {
            // XXX apparently does not like string as first arg, not nsISupports?
            observer.observe(null, 'reply-in-' + sessionName,
                             reply.stanza.toXMLString());
        };

    sessions.get(sessionName).send(new XML(stanza), handler);
}

function addObserver(observer) {
    observers.push(observer);
}

function notifyObservers(subject, topic, data) {
    for each(var observer in observers)
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            dump('Observer reported exception: ' + e + '\n');
        }
}

// XXX add other parameters as required by IDL
function removeObserver(observer) {
    var index = observers.indexOf(observer);
    if(index != -1) 
        observers.splice(index, 1);
}

