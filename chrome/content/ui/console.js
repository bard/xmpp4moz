var channel, inputHistory = [], inputHistoryCursor;

function init() {
    channel = XMPP.createChannel();

    channel.on(
        {event: 'data'}, function(data) {
            var content;
            try {
                content = new XML(data.content).toXMLString();
            } catch(e if e.name == 'SyntaxError') {
                content = data.content;
            }
            
            display(data.session.name + ' ' +
                    (data.direction == 'in' ? 'S' : 'C') + ': ' +
                    content);
        });

    _('input').focus();
}

function finish() {
    channel.release();
}

// ----------------------------------------------------------------------
// GUI UTILITIES

function _(id) {
    return document.getElementById(id);
}

function cloneBlueprint(name) {
    return document
        .getElementById('blueprints')
        .getElementsByAttribute('role', name)[0]
        .cloneNode(true);
}

// ----------------------------------------------------------------------
// GUI ACTIONS

function clearLog() {
    while(_('log').firstChild)
        _('log').removeChild(_('log').firstChild);
}

function display(message) {
    var logLine = cloneBlueprint('log-line');
    logLine.getElementsByAttribute('role', 'content')[0].textContent = message;
    
    _('log').appendChild(logLine);
    _('log').ensureElementIsVisible(logLine);
}

function insert(item) {
    var xml;
    switch(item) {
    case 'message':
        xml = <message></message>;
        break;
    case 'iq':
        xml = <iq></iq>;
        break;
    case 'iq-disco':
        xml = <iq type="get" to="">
            <query xmlns="http://jabber.org/protocol/disco#info"/>
            </iq>;
        break;
    case 'presence':
        xml = <presence/>;
        break;
    }
    _('input').value += xml.toXMLString();
}

// ----------------------------------------------------------------------
// GUI REACTIONS

function pressedKeyInInputArea(event) {
    var textBox = event.currentTarget;

    switch(event.keyCode) {
    case KeyEvent.DOM_VK_UP:
        event.preventDefault();
        if(inputHistoryCursor == 0)
            inputHistoryCursor = inputHistory.length-1;
        else
            inputHistoryCursor--;
        
        textBox.value = inputHistory[inputHistoryCursor];
        break;
    case KeyEvent.DOM_VK_DOWN:
        event.preventDefault();
        if(inputHistoryCursor == inputHistory.length-1)
            inputHistoryCursor = 0;
        else
            inputHistoryCursor++;
        
        textBox.value = inputHistory[inputHistoryCursor];
        break;
    case KeyEvent.DOM_VK_RETURN:
        if(event.ctrlKey)
            textBox.value += '\n';
        else {
            event.preventDefault();
                
            if(textBox.value.match(/^\s*$/))
                return;

            try {
                sendStanza(_('accounts').value, new XML(textBox.value));
                textBox.value = '';
            } catch(e) {
                alert(e);
            }
        }
        break;
    }
}

// ----------------------------------------------------------------------
// NETWORK ACTIONS

function sendStanza(account, xml) {
    XMPP.send(account, xml);
    inputHistoryCursor = 0;
    inputHistory.push(xml.toXMLString());
}

// ----------------------------------------------------------------------
// HOOKS

function xmppLoadedAccounts() {
    for each(var account in XMPP.accounts) {
        if(XMPP.isUp(account.jid)) {
            _('accounts').value = account.jid;
            break;
        }
    }
}