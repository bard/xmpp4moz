// Set by xmppShowAccount();

var xmppSelectedAccountKey;


// ----------------------------------------------------------------------
// ACTIONS

function xmppRefreshAccountList() {
    var accountList = document.getElementById('xmpp-accounts');

    for(var i=accountList.getRowCount()-1; i>=0; i--) 
        accountList.removeItemAt(i);

    for each(var account in XMPP.accounts) 
        accountList.appendItem(account.jid, account.key);
}

function xmppShowAccount(accountKey) {
    xmppSelectedAccountKey = accountKey;

    var pref = Components
        .classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);

    function uncamelize(string) {
        return string
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase() 
    }

    document.getElementById('xmpp-account-info').hidden = false;
    var account = XMPP.getAccountByKey(accountKey);

    for each(var accountField in
             ['address', 'password', 'resource',
              'connectionHost', 'connectionPort', 'connectionSecurity']) {
        var prefName = 'xmpp.account.' + account.key + '.' + accountField;
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
    var newAccountKey = (new Date()).getTime();
    
    var pref = Components
        .classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService)
        .getBranch('xmpp.account.' + newAccountKey + '.');

    pref.setCharPref('address', 'user@server.org');
    pref.setCharPref('resource', 'Firefox');
    pref.setCharPref('password', '');
    pref.setCharPref('connectionHost', '');
    pref.setIntPref('connectionPort', 5223);
    pref.setIntPref('connectionSecurity', 1);

    xmppRefreshAccountList();
    xmppShowAccount(newAccountKey);
}

function xmppDeleteAccount(accountKey) {
    // TODO: ask for confirmation here
    accountKey = accountKey || xmppSelectedAccountKey;
    if(!accountKey)
        return;

    Components
        .classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch)
        .deleteBranch('xmpp.account.' + accountKey + '.');

    xmppRefreshAccountList();
    document.getElementById('xmpp-account-info').hidden = true;
}

function xmppRegisterAccount() {
    window.alert('Not implemented yet.');
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
        .getService(Components.interfaces.nsIPrefService)
        .getBranch('xmpp.account.' + xmppSelectedAccountKey + '.');

    try {
        pref.setCharPref(prefName, field.value);
    } catch(e) {
        pref.setIntPref(prefName, field.value);
    }

    // XXX hackish
    if(field.id == 'xmpp-address') 
        xmppFieldChanged(document.getElementById('xmpp-connection-host'));
}

function xmppModifiedAddress(address) {
    var server = address.split('@')[1] || '';
    document.getElementById('xmpp-connection-host').value =
        (server == 'gmail.com' ? 'talk.google.com' : server);
}

function xmppAccountSelected() {
    var addressItem = document.getElementById('xmpp-accounts').selectedItem;
    if(!addressItem)
        return;
    xmppShowAccount(addressItem.value);
}

