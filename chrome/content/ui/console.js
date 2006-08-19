// GLOBAL STATE
// ----------------------------------------------------------------------

var channel;
var inputHistory = [];
var inputHistoryCursor;


// GUI INITIALIZATION/FINALIZATION
// ----------------------------------------------------------------------

function init(event) {
    channel = XMPP.createChannel();

    channel.on(
        {event: 'data'}, function(data) {
            var content;
            try {
                content = new XML(data.content).toXMLString();
            } catch(e if e.name == 'SyntaxError') {
                content = data.content;
            }

            display(data.session.name, data.direction, content);
        });

    _('input').focus();
}

function finish() {
    channel.release();
}


// GUI UTILITIES (GENERIC)
// ----------------------------------------------------------------------

function scrollingOnlyIfAtBottom(window, action) {
    var shouldScroll = ((window.scrollMaxY - window.pageYOffset) < 24);
    action();
    if(shouldScroll)
        window.scrollTo(0, window.scrollMaxY);
}

function _(id) {
    return document.getElementById(id);
}

function getDescendantByAttribute(element, attrName, attrValue) {
    for each(var child in element.childNodes) {
        if(child.nodeType == Node.ELEMENT_NODE) {
            if(child.getAttribute(attrName) == attrValue)
                return child;
            else {
                var descendant = getDescendantByAttribute(child, attrName, attrValue);
                if(descendant)
                    return descendant;                
            }
        }
    }
    return null;
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function clearLog() {
    var logEntries = _('log').contentDocument.getElementById('entries');
    while(entries.firstChild)
        entries.removeChild(entries.firstChild);
}

function display(account, direction, content) {
    var logDoc = _('log').contentDocument;
    var logEntry = logDoc.getElementById('entry').cloneNode(true);

    getDescendantByAttribute(logEntry, 'class', 'account')
        .textContent = account;
    getDescendantByAttribute(logEntry, 'class', 'direction')
        .textContent = (direction == 'in' ? 'S' : 'C');
    getDescendantByAttribute(logEntry, 'class', 'content')
        .textContent = content;
    logEntry.style.display = null;

    scrollingOnlyIfAtBottom(
        logDoc.defaultView, function() {
            logDoc.getElementById('entries')
                .appendChild(logEntry);
        });
}

function insert(item) {
    var xml;
    switch(item) {
    case 'message':
        xml = <message/>;
        break;
    case 'iq':
        xml = <iq/>;
        break;
    case 'iq-disco':
        xml =
            <iq type="get" to="">
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