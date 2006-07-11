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

var params;

function init() {
    params = window.arguments[0];

    var requestingApplication = params.appName || 'this application';
    
    _('make-default').label =
        'Always use this account for ' + requestingApplication;

    _('main').getButton('accept').disabled = true;
    _('main').getButton('extra1').addEventListener(
        'command', configureAccounts, false);

    refreshAccountList();
    if(params.jid) 
        for each(var accountItem in _('accounts').childNodes) {
            if(accountItem.label == params.jid) {
                _('account').setAttribute('label', params.jid);
                accountSelected();
                break;
            }
        }
    else {
        if(_('accounts').firstChild) {
            _('account').setAttribute('label',  _('accounts').firstChild.getAttribute('label'));
            accountSelected();
        }        
    }
    
    prefBranch.addObserver('', prefObserver, false);
}

function finish() {
    prefBranch.removeObserver('', prefObserver);
}

function doOk() {
    params.jid = _('account').label;
    params.password = _('password').value;
    params.confirmConnection = true;

    return true;
}

function doCancel() {
    return true;
}

function refreshAccountList() {
    var menuPopup = document.getElementById('accounts');

    deleteChildren(menuPopup);

    for each(var account in XMPP.accounts) {
        var menuItem = document.createElement('menuitem');
        menuItem.setAttribute('label', account.address + '/' + account.resource);
        menuItem.addEventListener('command', accountSelected, false);
        menuPopup.insertBefore(menuItem, menuPopup.firstChild);
    }
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

function accountSelected(event) {
    _('main').getButton('accept').disabled = false;
    _('password').disabled = false;
    _('password').focus();
    //_('make-default').disabled = false;
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

