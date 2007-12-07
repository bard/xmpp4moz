function runTests(tests) {
    var report = [];
    for(var testName in tests)
        try {
            if(testName == 'setup')
                continue;
            var context = {};
            if(tests.setup)
                tests.setup.call(context)
            tests[testName].call(context);
        } catch(e) {
            report.push('**********************************************************************');
            report.push('FAILURE: ' + testName + '\n' + e.message);
            report.push(e.stack);
            report.push('\n');
        }
    report.push('Tests completed.');
    return report.join('\n');
}

function compareXML(tree1, tree2) {
    // possibly call normalize() on both arguments to get rid of whitespace
    
    if(tree1.nodeKind() != tree2.nodeKind())
        throw new Error('Different node kinds. (' +
                        tree1.nodeKind() + ',' + tree2.nodeKind() + ')');

    switch(tree1.nodeKind()) {
    case 'element':
        if(tree1.name() != tree2.name())
            throw new Error('Different tag names. (' +
                            '<' + tree1.name() + '>, ' + '<' + tree2.name() + '>)');
        break;
    case 'text':
        if(tree1.valueOf() != tree2.valueOf())
            throw new Error('Different text values. (' +
                            '<' + tree1.valueOf() + '>, ' + '<' + tree2.valueOf() + '>)');

        break;
    default:
        throw new Error('Unhandled node kind. (' + tree1.nodeKind() + ')');
    }

    var attrList1 = tree1.@*;
    var attrList2 = tree2.@*;
    if(attrList1.length() != attrList2.length())
        throw new Error('Different attribute count for <' + tree1.name() + '>. (expected ' +
                        attrList1.length() + ', got ' + attrList2.length() + ')');

    var childList1 = tree1.*;
    var childList2 = tree2.*;
    if(childList1.length() != childList2.length())
        throw new Error('Different child count for <' + tree1.name() + '>. (expected ' +
                        childList1.length() + ', got ' + childList2.length() + ')');

    for each(var attr in attrList1) {
        if(tree1['@' + attr.name()] != tree2['@' + attr.name()])
            throw new Error('Different values for attribute @' + attr.name() + '. (expected ' +
                            tree1['@' + attr.name()] + ', got ' + tree2['@' + attr.name()] + ')');
    }

    for(var i=0; i<childList1.length(); i++)
        compareXML(childList1[i], childList2[i])

    return true;
}

var assert = {
    isNull: function(thing) {
        if(thing != null)
            throw new Error('Not a null-equivalent. (' + thing + ')');
    },

    isEquivalentXML: function(a, b) {
        compareXML(a, b);
    },

    equals: function(a, b) {
        if(typeof(a) != typeof(b))
            throw new Error('Different types. (expected ' + typeof(a) + ', got ' + typeof(b) + ')');

        switch(typeof(a)) {
        case 'number':
        case 'string':
            if(a != b)
                throw new Error('Not equal. (expected ' + a + ', got ' + b + ')');
            break;
        case 'xml':
            assert.isEquivalentXML(a, b);
            break;
        case 'object':
            if(('length' in a) && ('length' in b)) {
                if(a.length != b.length)
                    throw new Error('Different lengths. (expected ' + a.length + ', got ' + b.length + ')');
                else
                    for(var i=0,l=a.length; i<l; i++)
                        assert.equals(a[i], b[i]);
            }
            else
                if(a != b)
                    throw new Error('Not equal. (' + a + ',' + b + ')');
            break;
        default:
            throw new Error('Unhandled type. (' + typeof(a) + ')');
        }
    },

    throwsError: function(action) {
        var errorThrown = false;

        try {
            action.call(null);
        } catch(e) {
            errorThrown = true;
        }
        if(!errorThrown)
            throw new Error('Should have thrown error.');
    }
};
