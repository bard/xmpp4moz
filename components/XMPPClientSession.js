/* ---------------------------------------------------------------------- */
/*                      Component specific code                           */

const CLASS_ID = Components.ID('{1552a874-4e8f-47cd-a9f0-5a87b248e0a8}');
const CLASS_NAME = 'XMPP Session';
const CONTRACT_ID = '@hyperstruct.net/xmpp4moz/xmppsession;1';
const SOURCE = 'chrome://xmpp4moz/content/service/client_session.js';
const INTERFACE = Components.interfaces.nsIXMPPClientSession;

/* ---------------------------------------------------------------------- */
/*                           Template code                                */

//SI New for FF4
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
    .getService(Ci.mozIJSSubScriptLoader);

function Component() {
    this.wrappedJSObject = this; //USED for accessing from js only //FF9
}

Component.prototype = {

    classID: CLASS_ID, //SI
    classDescription: CLASS_NAME, //FF9
    contractID: CONTRACT_ID,  //FF9

    reload: function() {
        loader.loadSubScript(SOURCE, this.__proto__);
    },
    
    //FF4 - init listener, originally I had it in SOURCE
    observe: function (aSubject, aTopic, aData) {
	if ((aTopic == "app-startup")||(aTopic == "profile-after-change")) {
	    this.init();
	    //this._message = 'huppo mini moose';
	}
    },

    //FF9 
    QueryInterface: XPCOMUtils.generateQI([
	Components.interfaces.nsIObserver
    ])

    //FF4
    /*
    QueryInterface: XPCOMUtils.generateQI([
	INTERFACE, //alt to the above
	Components.interfaces.nsIObserver //To observe startup event
    ])
    */

    //FF3
    /*
    QueryInterface: function(aIID) {
        if(!aIID.equals(INTERFACE) &&
           !aIID.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_NO_INTERFACE;
        return this;
    }*/
};

loader.loadSubScript(SOURCE, Component.prototype);

//FF3
/*
var Factory = {
    createInstance: function(aOuter, aIID) {
        if(aOuter != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;
        var component = new Component();
        return component.QueryInterface(aIID);
    }
};
*/

//FF3
/*
var Module = {
    _firstTime: true,

    registerSelf: function(aCompMgr, aFileSpec, aLocation, aType) {
        if (this._firstTime) {
            this._firstTime = false;
            throw Components.results.NS_ERROR_FACTORY_REGISTER_AGAIN;
        };
        aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
        aCompMgr.registerFactoryLocation(
            CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);
    },

    unregisterSelf: function(aCompMgr, aLocation, aType) {
        aCompMgr = aCompMgr.QueryInterface(Ci.nsIComponentRegistrar);
        aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);
    },

    getClassObject: function(aCompMgr, aCID, aIID) {
        if (!aIID.equals(Ci.nsIFactory))
            throw Cr.NS_ERROR_NOT_IMPLEMENTED;

        if (aCID.equals(CLASS_ID))
            return Factory;

        throw Cr.NS_ERROR_NO_INTERFACE;        
    },

    canUnload: function(aCompMgr) { return true; }
};
*/

//function NSGetModule(aCompMgr, aFileSpec) { return Module; }

//This replaces the above commented objects Factory and Module
/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([Component]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([Component]);
