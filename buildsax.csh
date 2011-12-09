#!/bin/csh -f

pushd ~/src/mozilla/xulrunner-5/idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXAttributes.xpt nsISAXAttributes.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXContentHandler.xpt  nsISAXContentHandler.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXDTDHandler.xpt nsISAXDTDHandler.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXErrorHandler.xpt  nsISAXErrorHandler.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXLexicalHandler.xpt  nsISAXLexicalHandler.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXLocator.xpt  nsISAXLocator.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXMutableAttributes.xpt  nsISAXMutableAttributes.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXXMLFilter.xpt  nsISAXXMLFilter.idl
~/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl -m typelib -w -v -I ~/src/mozilla/xulrunner-5/idl/ -e nsISAXXMLReader.xpt  nsISAXXMLReader.idl
 
mv nsISAXAttributes.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXAttributes.xpt  
mv nsISAXContentHandler.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXContentHandler.xpt
mv nsISAXDTDHandler.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXDTDHandler.xpt
mv nsISAXErrorHandler.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXErrorHandler.xpt
mv nsISAXLexicalHandler.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXLexicalHandler.xpt
mv nsISAXLocator.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXLocator.xpt
mv nsISAXMutableAttributes.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXMutableAttributes.xpt
mv nsISAXXMLFilter.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXXMLFilter.xpt
mv nsISAXXMLReader.xpt ~/src/mozilla/xmpp4moz5/components/nsISAXXMLReader.xpt

popd


