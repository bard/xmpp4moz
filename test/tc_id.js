/*
  Copyright (C) 2005-2006 by Massimiliano Mirra

  This program is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation; either version 2 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301 USA

  Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
*/

var Specification = mozlab.mozunit.Specification;
var assert        = mozlab.mozunit.assertions;
var module        = new ModuleManager(['../..']);
var ID            = module.require('package', 'xmppjs/package').ID;

var spec = new Specification('ID');
    
spec.stateThat = {
    testServer: function() {
        var jid = new ID('server.org');
        assert.isNull(jid.username);
        assert.equals('server.org', jid.hostname);
        assert.isNull(jid.resource);
        assert.equals('server.org', jid.toString());
    },

    testUserServer: function() {
        var jid = new ID('user@server.org');
        assert.equals('user', jid.username);
        assert.equals('server.org', jid.hostname);
        assert.isNull(jid.resource);
        assert.equals('user@server.org', jid.toString());
    },

    testServerResource: function() {
        var jid = new ID('server.org/root');
        assert.isNull(jid.username);
        assert.equals('server.org', jid.hostname);
        assert.equals('root', jid.resource);
        assert.equals('server.org/root', jid.toString());
    },

    testUserServerResource: function() {
        var jid = new ID('user@server.org/resource/extended');
        assert.equals('user', jid.username);
        assert.equals('server.org', jid.hostname);
        assert.equals('resource/extended', jid.resource);
        assert.equals('user@server.org/resource/extended', jid.toString());
        assert.equals('user@server.org', jid.shortID);
    }
};

spec.verify();
