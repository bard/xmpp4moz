function spec_match(action) {
    var assert = {
        isTrue: function(condition) {
            if(!condition)
                throw new Error(Components.stack.caller.lineNumber);
        },

        isFalse: function(condition) {
            if(condition)
                throw new Error(Components.stack.caller.lineNumber);
        }
    };

    var tests = {
        'empty template is wildcard': function() {
            assert.isTrue(
                match({ a: 1 }, { }));
        },

        'match literal values': function() {
            assert.isTrue(
                match({ a: 1 }, { a: 1 }));

            assert.isTrue(
                match({ a: 'hello' }, { a: 'hello' }));

            assert.isFalse(
                match({ a: 1 }, { a: 1000 }));

            assert.isFalse(
                match({ a: 'hello' }, { a: 'world' }));
        },

        'match value objects with test() member': function() {
            assert.isTrue(
                match({ a: 1 }, { a: { test: function() { return true; } } }))

            assert.isFalse(
                match({ a: 1 }, { a: { test: function() { return false; } } }))

            assert.isTrue(
                match({ a: 1 }, { a: { test: function(a) { return a > 0; } } }))

            assert.isTrue(
                match({ a: 'hello' }, { a: /^h/ }));
        },

        'match against functions': function() {
            assert.isTrue(
                match({ a: 1 }, { a: function() { return true; }}));

            assert.isFalse(
                match({ a: 1 }, { a: function() { return false; }}));

            assert.isTrue(
                match({ a: 1 }, { a: function(a) { return a > 0; }}));
        },

        'match sub-templates': function() {
            assert.isTrue(
                match({ a: { b: 1, c: 2 }}, { a: { b: 1 }}))

            assert.isFalse(
                match({ a: { b: 1, c: 2 }}, { a: { b: 1000 }}))

            assert.isFalse(
                match({ a: { b: 1 }, c: 2}, { a: { b: 1 }, c: 3}));

            assert.isFalse(
                match({ a: undefined}, { a: { b: 1 }}));
        }
    }
    
    var report = [];
    if(action == 'describe')
        for(var testName in tests)
            report.push(testName);
    else {
        for(var testName in tests)
            try {
                tests[testName].call();
            } catch(e) {
                report.push('FAILURE: ' + testName + ' (' + e.message + ')');
            }
        report.push('\nTests completed.');
    }
        
    return report.join('\n');
}