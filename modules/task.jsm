/*
 * Copyright 2008-2009 by Massimiliano Mirra
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


// EXPORTS
// ----------------------------------------------------------------------

var EXPORTED_SYMBOLS = [
    'task'
];


/**********************************************************************

Turns the function _task_ into a lightweight process.  An object is
returned, through which the process can be controlled (started,
killed, inspected).

Function _task_ must be a generator, i.e. it must contain at least one
_yield_ keyword.


BASICS
======

Example:

    var p = proc(function() {
        dump('Sleeping for three seconds...\n');
        yield sleep(3000);
        dump('Awake again!\n');
    });
    p.start();

When "yield sleep(3000)" is met, the scheduler suspends the process.
The sleep() function, or any other function to be called this way,
follows a simple pattern: it doesn't perform an action, instead it
returns a function that would perform the action, when called.  Said
function in turns receive an argument: a function to call to signal
when it has finished.

Example:

    function sleep(msecs) {
        return function(resume) {
            window.setTimeout(resume, msecs);
        }
    }

When called, sleep returns an anonymous function.  The scheduler calls
the function, passing in a "resume" function, which acts as a
signaler.  The anonymous function runs, and in this case, it simply
waits _msecs_ milliseconds, and then resumes.


CONTROLLING THE PROCESS
=======================

proc() returns a controller object on which the following methods can
be called:

 - start()   : starts the process
 - send()    : sends a message to the process (see below)
 - kill()    : kills the process before it has finished
 - inspect() : returns information about the process (currently, its
               unprocessed messages)

The second argument to proc(), _async_, is a boolean.  If false (the
default), when the process resumes, the next stage is called as a
normal function (thus diving deeper into the stack).  If true, the
next stage is called via window.setTimeout() (thus unwinding the
stack).


MESSAGE PASSING
===============

Processes can receive messages.  The scheduler passes the _task_
function a _receive_ argument: use it as a function to process
incoming messages.  Note that it blocks until a message is received.

Example:

    var p = proc(function(receive) {
        dump('Waiting for a message...\n');
        var msg = yield receive();
        dump('Received: ' + msg + '\n');
    });
    p.start();
    // ... later ...
    p.send('hello!');



**********************************************************************/

function task(t, async) {
    var receiver = null;
    var mailbox = [];

    function makeReceiver() {
        return function(resume) {
            // Process has hit a receive() line, so we should block
            // and wait to receive a message.  However, we might
            // already have received a message while we were doing
            // something else...  so we first check whether there's a
            // pending message, and if so, we process it immediately:
            var message = mailbox.shift();
            if(message)
                resume(message);
            else
                // If there's no pending message, we create a
                // receiver.  The code that actually receives messages
                // will check for the existence of this receiver, and
                // invoke it if present.  (This will mean that the
                // message was received while process was blocked in a
                // receive() call.)  Note that the first thing we do
                // inside the receiver is clearing the receiver
                // variable, since each receiver handles one message
                // only.
                receiver = function(message) {
                    receiver = null;
                    resume(message);
                };
        }
    }

    // Whenever the taskThread will call "var x = yield receive()",
    // makeReceiver is called and a new value gets assigned to
    // messagePutCallback, thus when other threads will call
    // taskThread.send('foobar'), the latest messagePutCallback will
    // be called.

    // It's important to note that, since it contains yield(), task()
    // produces a generator, thus it's not immediately executed.
    // Following line will return the generator into taskThread, but
    // won't start executing it.

    var scheduler = t(makeReceiver);

    function next(value) {
        try {
            // Example: in "yield sleep(1000)", sleep(1000) returns a
            // function which receives an argument (the continuation)
            // and delays it by 1000 milliseconds.  Here we receive
            // that function...
            var result = scheduler.send(value);
            if(typeof(result) == 'function')
                // And here we call it.
                if(async)
                    window.setTimeout(function() { result(next); }, 0);
                else
                    try {
                        result(next);
                    } catch(e) {
                        Components.utils.reportError(e);
                        next(e)
                    }
            else
                // Actually, it might also be "yield somethingElse()"
                // where somethingElse() returns a plain value, not
                // more code to execute.
                return result;
        } catch(e if e == StopIteration) {

        }
    }


    var controller = {
        start: function() {
            next();
            return this;
        },
        send: function(message) {
            if(receiver)
                // We're blocking at a receive() call and we're
                // receiving a message -- call the receiver right
                // away!
                receiver(message);
            else
                // We're busy doing something, not blocked waiting to
                // receive messages.  Put the message in the mailbox.
                // It will be processed when the next receive() is
                // hit.
                mailbox.push(message);
        },
        kill: function() {
            scheduler.close();
        },
        inspect: function() {
            return mailbox;
        }
    };

    return controller;
}

