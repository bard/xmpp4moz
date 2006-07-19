var channel, inputHistory = [], inputHistoryCursor;

function init() {
    channel = XMPP.createChannel();

    channel.on(
        {event: 'data'}, function(data) {
            display(data.session.name + ' ' +
                    (data.direction == 'in' ? 'S' : 'C') + ': ' +
                    new XML(data.content).toXMLString());
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

function display(message) {
    var logLine = cloneBlueprint('log-line');
    logLine.getElementsByAttribute('role', 'content')[0].textContent = message;
    
    _('jabber-log').appendChild(logLine);
    _('jabber-log').ensureElementIsVisible(logLine);
}

function insert(stanzaName) {
    _('input').value += '<' + stanzaName + '></' + stanzaName + '>';
}

// ----------------------------------------------------------------------
// GUI REACTIONS

function pressedKeyInInputArea(event) {
    var textBox = event.currentTarget;
    //switch
    if(event.keyCode == KeyEvent.DOM_VK_UP) {
        event.preventDefault();
        if(inputHistoryCursor == 0)
            inputHistoryCursor = inputHistory.length-1;
        else
            inputHistoryCursor--;

        textBox.value = inputHistory[inputHistoryCursor];        
    }
    else if(event.keyCode == KeyEvent.DOM_VK_DOWN) {
        event.preventDefault();
        if(inputHistoryCursor == inputHistory.length-1)
            inputHistoryCursor = 0;
        else
            inputHistoryCursor++;

        textBox.value = inputHistory[inputHistoryCursor];
    }
    else if(event.keyCode == KeyEvent.DOM_VK_RETURN) {
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