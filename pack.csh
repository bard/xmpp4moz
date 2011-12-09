#!/bin/csh -f
zip -r xmpp4moz chrome.manifest install.rdf components chrome defaults  -x public/ -x README -x notes -x pack.csh -x update.rdf.templage -x archive/ 
mv xmpp4moz.zip xmpp4moz.xpi
