/*
 * Copyright 2008 by Massimiliano Mirra
 *
 * This file is part of xmpp4moz.
 *
 * xmpp4moz is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 *
 * xmpp4moz is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
 *
 */

// ----------------------------------------------------------------------

var EXPORTED_SYMBOLS = [
    'JID',
    'getPassword',
    'setPassword',
    'delPassword'
];

// ----------------------------------------------------------------------

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ----------------------------------------------------------------------

function JID(string) {
    var memo = arguments.callee.memo || (arguments.callee.memo = {});
    if(string in memo)
        return memo[string];
    var m = string.match(/^(.+?@)?(.+?)(?:\/|$)(.*$)/);

    var jid = {};

    if(m[1])
        jid.username = m[1].slice(0, -1);

    jid.hostname = m[2];
    jid.resource = m[3];
    jid.nick     = m[3];
    jid.full     = m[3] ? string : null;
    jid.address  = jid.username ?
        jid.username + '@' + jid.hostname :
        jid.hostname;

    memo[string] = jid;
    return jid;
}

function getPassword(address) {
    var url = 'xmpp://' + JID(address).hostname;
    var username = JID(address).username;

    if('@mozilla.org/passwordmanager;1' in Cc) {
        var passwordManager = Cc['@mozilla.org/passwordmanager;1']
            .getService(Ci.nsIPasswordManager);

        var e = passwordManager.enumerator;
        while(e.hasMoreElements()) {
            try {
                var pass = e.getNext().QueryInterface(Ci.nsIPassword);
                if(pass.host == url && pass.user == username)
                    return pass.password;
            } catch (ex) {

            }
        }

    } else if('@mozilla.org/login-manager;1' in Cc) {
        var loginInfo = getLoginInfo(url, username);
        if(loginInfo)
            return loginInfo.password;
    }
}

function delPassword(address) {
    var url = 'xmpp://' + JID(address).hostname;
    var username = JID(address).username;

    if('@mozilla.org/passwordmanager;1' in Cc) {
        var passwordManager = Cc['@mozilla.org/passwordmanager;1']
            .getService(Ci.nsIPasswordManager);

        try { passwordManager.removeUser(url, username); } catch (e) {}
    } else if('@mozilla.org/login-manager;1' in Cc) {
        var loginInfo = getLoginInfo(url, username);
        if(loginInfo)
            loginManager.removeLogin(loginInfo)
    }
}

function setPassword(address, password) {
    var url = 'xmpp://' + JID(address).hostname;
    var username = JID(address).username;

    if('@mozilla.org/passwordmanager;1' in Cc) {
        var passwordManager = Cc['@mozilla.org/passwordmanager;1']
            .getService(Ci.nsIPasswordManager);

        try { passwordManager.removeUser(url, username); } catch (e) {}
        passwordManager.addUser(url, username, password);
    }
    else if('@mozilla.org/login-manager;1' in Cc) {
        var loginManager = Cc['@mozilla.org/login-manager;1']
            .getService(Ci.nsILoginManager)

        var loginInfo = Cc['@mozilla.org/login-manager/loginInfo;1']
            .createInstance(Ci.nsILoginInfo);
        loginInfo.init(
            url,                        // hostname
            null,                       // submit url - forms only
            url,                        // realm - it's important that this be same as url, as firefox2->3 migration will make it so for accounts in firefox2
            username,                   // username
            password,                   // password
            '',                       // username field - forms only
            '');                      // password field - forms only

        var oldLoginInfo = getLoginInfo(url, username);

        if(oldLoginInfo)
            loginManager.modifyLogin(oldLoginInfo, loginInfo)
        else
            loginManager.addLogin(loginInfo);
    }
}

// ----------------------------------------------------------------------

function getLoginInfo(url, username) {
    var logins = Cc['@mozilla.org/login-manager;1']
        .getService(Ci.nsILoginManager)
        .findLogins({}, url, null, url);
    for(var i=0; i<logins.length; i++)
        if(logins[i].username == username)
            return logins[i];
}

