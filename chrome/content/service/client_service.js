// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader);

const serializer = Cc['@mozilla.org/xmlextras/xmlserializer;1']
    .getService(Ci.nsIDOMSerializer);

loader.loadSubScript('chrome://xmpp4moz/content/lib/module_manager.js');
const module = new ModuleManager(['chrome://xmpp4moz/content']);

const Transport = module.require('class', 'lib/socket');


// GLOBAL STATE
// ----------------------------------------------------------------------

var observers = [];

var sessions = {
    _list: [],

    opening: function(session) {
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
    if(ssl == undefined)
        ssl || true;
    
    var transport = new Transport(server, port, { ssl: ssl });
    var session = Cc['@hyperstruct.net/xmpp4moz/xmppsession;1']
        .createInstance(Ci.nsIXMPPClientSession);
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
                    transport.write(subject
                                    .QueryInterface(Ci.nsISupportsString)
                                    .toString())


                if(parts[0] == 'stanza') {
                    subject.QueryInterface(Ci.nsIDOMElement);
                    client.notifyObservers(
                        sessions.get(data),
                        topic,
                        serializer.serializeToString(subject));
                } else {
                    subject.QueryInterface(Ci.nsISupportsString);
                    client.notifyObservers(
                        sessions.get(data),
                        topic,
                        subject.data);
                } 
            }}, null, false);

    transport.connect();
    sessions.opening(session);
    session.open(jid.match(/@([^\/]+)/)[1]);
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
            Cu.reportError(e);
        }
}

// XXX add other parameters as required by IDL
function removeObserver(observer) {
    var index = observers.indexOf(observer);
    if(index != -1) 
        observers.splice(index, 1);
}

