// Set by xmppShowAccount();

var xmppSelectedAccountId;


// ----------------------------------------------------------------------
// ACTIONS

function xmppRefreshAccountList() {
    var accountList = document.getElementById('xmpp-accounts');

    for(var i=accountList.getRowCount()-1; i>=0; i--) 
        accountList.removeItemAt(i);

    for each(var account in XMPP.accounts) 
        accountList.appendItem(account.address, account.index);
}

function xmppShowAccount(accountId) {
    xmppSelectedAccountId = accountId;

    var pref = Components
        .classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);          

    function uncamelize(string) {
        return string
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase() 
    }

    document.getElementById('xmpp-account-info').hidden = false;
    var account = XMPP.getAccountByIndex(accountId);

    for each(var accountField in
             ['address', 'password', 'resource',
              'connectionHost', 'connectionPort', 'connectionSecurity']) {
        var prefName = 'xmpp.account.' + account.index + '.' + accountField;
        var elementId = 'xmpp-' + uncamelize(accountField);
            
        var prefValue;
        try {
            prefValue = pref.getCharPref(prefName);
        } catch(e) {
            try {
                prefValue = pref.getIntPref(prefName);
            } catch(e) {
                prefValue = '';
            }
        }

        document.getElementById(elementId).value = prefValue;
    }
}

function xmppCreateAccount() {
    var newAccountId = (new Date()).getTime();
    
    var pref = Components
        .classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch)
        .getBranch('xmpp.account.' + newAccountId + '.');

    pref.setCharPref('address', 'user@server.org');
    pref.setCharPref('resource', 'Firefox');
    pref.setCharPref('password', '');
    pref.setCharPref('connectionHost', '');
    pref.setIntPref('connectionPort', 5223);
    pref.setIntPref('connectionSecurity', 1);

    xmppRefreshAccountList();
    xmppShowAccount(newAccountId);
}

function xmppDeleteAccount(accountId) {
    // TODO: ask for confirmation here
    accountId = accountId || xmppSelectedAccountId;
    if(!accountId)
        return;

    Components
        .classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch)
        .deleteBranch('xmpp.account.' + accountId + '.');

    xmppRefreshAccountList();
    document.getElementById('xmpp-account-info').hidden = true;
}

// ----------------------------------------------------------------------
// REACTIONS

function xmppFieldChanged(field) {
    function camelize(string) {
        var parts = string.split('-');
        return parts[0] + 
            parts.slice(1).map(
                function(part) {
                    return part[0].toUpperCase() + part.slice(1);
                }).join();
    }

    var prefName = camelize(field.id.replace(/^xmpp-/, ''));

    var pref = Components
        .classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch)
        .getBranch('xmpp.account.' + xmppSelectedAccountId + '.');

    try {
        pref.setCharPref(prefName, field.value);
    } catch(e) {
        pref.setIntPref(prefName, field.value);
    }
}

function xmppAccountSelected() {
    var addressItem = document.getElementById('xmpp-accounts').selectedItem;
    if(!addressItem)
        return;
    xmppShowAccount(addressItem.value);
}

