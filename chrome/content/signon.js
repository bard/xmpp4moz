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
    
    if(params.requester) {
        _('make-default').label =
            'Always use this account for ' + params.requester;
        _('make-default').hidden = false;        
    }

    _('main').getButton('accept').disabled = true;
    _('main').getButton('extra1').addEventListener(
        'command', configureAccounts, false);

    refreshAccountList();
    if(params.jid) 
        for each(var accountItem in _('accounts').childNodes) {
            if(accountItem.label == params.jid) {
                _('account').setAttribute('label', params.jid);
                accountSelected(params.jid);
                break;
            }
        }
    else {
        if(_('accounts').firstChild) {
            var jid = _('accounts').firstChild.getAttribute('label')
            _('account').setAttribute('label',  jid);
            accountSelected(jid);
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
    params.confirm = true;

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
        menuItem.addEventListener(
            'command', function(event) {
                accountSelected(event.target.getAttribute('label'));
            }, false);
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

function accountSelected(jid) {
    _('main').getButton('accept').disabled = false;
    
    if(XMPP.isUp(jid)) {
        _('already-online').hidden = false;
        _('password').hidden = true;
        _('password').value = '';
    } else {
        _('already-online').hidden = true;
        _('password').hidden = false;
        _('password').disabled = false;
        _('password').focus();
    } 
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

