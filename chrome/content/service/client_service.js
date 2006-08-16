// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

Components
.classes['@mozilla.org/moz/jssubscript-loader;1']
.getService(Components.interfaces.mozIJSSubScriptLoader)
    .loadSubScript('chrome://xmpp4moz/content/lib/module_manager.js');

const module = new ModuleManager(['chrome://xmpp4moz/content']);

var Transport = module.require('class', 'lib/socket');
var Session = module.require('class', 'session');


// GLOBAL STATE
// ----------------------------------------------------------------------

var sessions = [];
var observers = [];


// PUBLIC FUNCTIONALITY
// ----------------------------------------------------------------------

function isUp(jid) {
    var session = getSessionByName(jid);
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
    sessions.push(session);
    return session;
}

function close(jid) {
    var session = getSessionByName(jid);
    session.close();
    // TODO: actually session should be removed on close event, not on
    // signOff request
    sessions.splice(sessions.indexOf(session), 1);    
}

function send(sessionName, stanza, observer) {
    var handler;
    if(observer) 
        handler = function(reply) {
            // XXX apparently does not like string as first arg, not nsISupports?
            observer.observe(null, 'reply-in-' + sessionName,
                             reply.stanza.toXMLString());
        };

    getSessionByName(sessionName).send(new XML(stanza), handler);
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

function removeObserver(observer) {
    var index = observers.indexOf(observer);
    if(index != -1) 
        observers.splice(index, 1);
}


// INTERNALS
// ----------------------------------------------------------------------

function getSessionByName(name) {
    for each(var session in sessions)
        if(session.name == name)
            return session;
}

