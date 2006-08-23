// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

Components
.classes['@mozilla.org/moz/jssubscript-loader;1']
.getService(Components.interfaces.mozIJSSubScriptLoader)
    .loadSubScript('chrome://xmpp4moz/content/lib/module_manager.js');

const module = new ModuleManager(['chrome://xmpp4moz/content']);
const Transport = module.require('class', 'lib/socket');


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
    var session = Components
        .classes['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Components.interfaces.nsIXMPPClientSession);
    session.setName(jid);

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

    session.addObserver({
        observe: function(subject, topic, data) {
                var parts = topic.split('-');
                if(parts[0] == 'data' && parts[1] == 'out')
                    transport.write(data);

                client.notifyObservers(subject, topic, data);
            }}, null, false);

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
    sessions.get(sessionName).send(stanza, observer);
}

function addObserver(observer) {
    observers.push(observer);
}

function notifyObservers(subject, topic, data) {
    for each(var observer in observers) 
        try {
            observer.observe(subject, topic, data);
        } catch(e) {
            Components.utils.reportError(e);
        }
}

// XXX add other parameters as required by IDL
function removeObserver(observer) {
    var index = observers.indexOf(observer);
    if(index != -1) 
        observers.splice(index, 1);
}

