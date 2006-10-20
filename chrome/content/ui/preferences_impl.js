// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Ci.nsIPromptService); 
var pref = Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefService)
    .getBranch('xmpp.account.');

var ns_register = 'jabber:iq:register';


// GLOBAL STATE
// ----------------------------------------------------------------------

var selectedAccountKey;


// GUI UTILITIES (GENERIC)
// ----------------------------------------------------------------------

function _(id) {
    return document.getElementById(id);
}

function v(id) {
    return _(id).value;
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function refreshAccountList() {
    for(var i=_('xmpp-accounts').getRowCount()-1; i>=0; i--) 
        _('xmpp-accounts').removeItemAt(i);

    for each(var account in XMPP.accounts) 
        _('xmpp-accounts').appendItem(account.jid, account.key);
}

function showAccount(accountKey) {
    selectedAccountKey = accountKey;

    function uncamelize(string) {
        return string
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase() 
    }

    _('xmpp-account-message').hidden = true;
    _('xmpp-account-settings').hidden = false;
    var account = XMPP.getAccountByKey(accountKey);

    for each(var accountField in
             ['address', 'password', 'resource',
              'connectionHost', 'connectionPort', 'connectionSecurity']) {
        var prefName = account.key + '.' + accountField;
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

        _(elementId).value = prefValue;
    }
}

function createAccount() {
    var newAccountKey = (new Date()).getTime();
    
    pref.setCharPref(newAccountKey + '.address', 'user@server.org');
    pref.setCharPref(newAccountKey + '.resource', 'Firefox');
    pref.setCharPref(newAccountKey + '.password', '');
    pref.setCharPref(newAccountKey + '.connectionHost', '');
    pref.setIntPref(newAccountKey + '.connectionPort', 5223);
    pref.setIntPref(newAccountKey + '.connectionSecurity', 1);

    refreshAccountList();
    showAccount(newAccountKey);
}

function deleteAccount(accountKey) {
    // TODO: ask for confirmation here
    accountKey = accountKey || selectedAccountKey;
    if(!accountKey)
        return;

    pref.deleteBranch(accountKey + '.');

    refreshAccountList();
    _('xmpp-account-message').hidden = false;
    _('xmpp-account-settings').hidden = true;
}

function registerAccount(address, host, port, ssl) {
    var jid = address;

    var request = {
        confirm: false,
        query: undefined, 
        presets: {
            username: XMPP.JID(jid).username,
            password: v('xmpp-password')
        }
    };

    XMPP.open(
        jid, { host: host, port: port, ssl: ssl },
        function() {
            XMPP.send(
                jid,
                <iq to={XMPP.JID(jid).hostname} type="get">
                <query xmlns="jabber:iq:register"/>
                </iq>,
                function(reply) {
                    request.query = reply.stanza.ns_register::query;

                    window.openDialog(
                        'chrome://xmpp4moz/content/ui/registration.xul',
                        'xmpp4moz-registration', 'modal,centerscreen',
                        request);
                    
                    if(request.confirm) {
                        var iq = <iq to={XMPP.JID(jid).hostname} type="set"/>;
                        iq.query = request.query;
                        XMPP.send(
                            jid, iq, function(reply) {
                                if(reply.stanza.@type == 'result') 
                                    prompts.alert(
                                        null, 'Registration successful',
                                        'Account successfully registered.');
                                else
                                    prompts.alert(
                                        null, 'Registration error', 
                                        reply.stanza.error.*[0].name().localName.replace(/-/g, ' ') +
                                        ' (' + reply.stanza.error.@code + ')');
                                    
                                XMPP.close(jid);
                            });
                        
                    } else {
                        XMPP.close(jid);
                    }
                });
        });
}


// GUI REACTIONS
// ----------------------------------------------------------------------

function changedField(field) {
    function camelize(string) {
        var parts = string.split('-');
        return parts[0] + 
            parts.slice(1).map(
                function(part) {
                    return part[0].toUpperCase() + part.slice(1);
                }).join();
    }

    var prefName = selectedAccountKey + '.' + camelize(field.id.replace(/^xmpp-/, ''));
    try {
        pref.setCharPref(prefName, field.value);
    } catch(e) {
        pref.setIntPref(prefName, field.value);
    }

    // XXX hackish
    if(field.id == 'xmpp-address') 
        changedField(_('xmpp-connection-host'));
}

function modifiedAddress(address) {
    var server = address.split('@')[1] || '';
    _('xmpp-connection-host').value =
        (server == 'gmail.com' ? 'talk.google.com' : server);
}

function requestedRegisterAccount() {
    registerAccount(v('xmpp-address'),
                    v('xmpp-connection-host'),
                    v('xmpp-connection-port') || 5223,
                    v('xmpp-connection-security') == 1 ? true : false)
}

function selectedAccount() {
    var addressItem = _('xmpp-accounts').selectedItem;
    if(!addressItem)
        return;
    showAccount(addressItem.value);
}
