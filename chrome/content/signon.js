var prefBranch = Components
    .classes["@mozilla.org/preferences-service;1"]
    .getService(Components.interfaces.nsIPrefService)
    .getBranch("xmpp.account.")
    .QueryInterface(Components.interfaces.nsIPrefBranch2);

var prefObserver = {
    observe: function(subject, topic, data) {
        refreshAccountList();
    }
};

var request;

function init() {
    request = window.arguments[0];
    
    _('main').getButton('accept').disabled = true;
    _('main').getButton('extra1').addEventListener(
        'command', configureAccounts, false);

    prefBranch.addObserver('', prefObserver, false);
}

function finish() {
    prefBranch.removeObserver('', prefObserver);
}

function doOk() {
    request.jid = request.jid || _('accounts').value;
    request.password = _('password').value;
    request.confirm = true;

    return true;
}

function doCancel() {
    return true;
}

function configureAccounts() {
    Components
        .classes["@mozilla.org/appshell/window-mediator;1"]
        .getService(Components.interfaces.nsIWindowMediator)
        .getMostRecentWindow("navigator:browser")
        .openPreferences('xmpp-pane');
}

// ----------------------------------------------------------------------
// REACTIONS

function selectedAccount(jid) {
    _('main').getButton('accept').disabled = false;
    _('password').focus();
}

// ----------------------------------------------------------------------
// UTILITIES

function _(id) {
    return document.getElementById(id);
}

function deleteChildren(container) {
    var i = container.childNodes.length - 1;
    while(i >= 0) {
        var child = container.childNodes[i];
        container.removeChild(child);
        i--;
    }
}

// ----------------------------------------------------------------------
// HOOKS

function xmppLoadedAccounts() {
    var accounts = XMPP.accounts;
    if(request.jid) {
        for each(var account in accounts) {
            if(request.jid == account.jid) {
                _('account-name').hidden = false;
                _('account-name').value = request.jid;
                selectedAccount(account.jid);
                break;
            }
        }
    } else {
        _('accounts').hidden = false;
        for each(var account in accounts) {
            if(XMPP.isUp(account.jid)) {
                _('accounts').value = account.jid;
                break;
            }
        }
        if(!_('accounts').value)
            _('accounts').value = accounts[0].jid;
        selectedAccount(_('accounts').value);
    }
}