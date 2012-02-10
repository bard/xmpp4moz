#!/bin/csh -f
rm xmpp4moz.xpi
zip -r xmpp4moz chrome.manifest install.rdf components chrome defaults -x public/\* -x README\* -x pack.csh\* -x update.rdf.template -x archive/ \*~ \*.DS_Store -x \*tmp/\* \*orig/\* -x \*.git/\* \*.svn/\*
mv xmpp4moz.zip xmpp4moz.xpi
