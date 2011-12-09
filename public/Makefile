#NOT NEEDED IF USING xmpp4moz only from javascript

IDLC=/Users/si/src/mozilla/xulrunner-4-v1.9.2/bin/xpidl
INC=-I. -I/Users/si/src/mozilla/xulrunner-5/idl/

XPTS=../components/nsIXMPPClientService.xpt \
	../components/nsIXMPPClientSession.xpt \
	../components/nsIXMPPConnector.xpt \
	../components/nsIXMPPCacheService.xpt

all: $(XPTS)

../components/%.xpt: %.idl
	$(IDLC) -m typelib -w -v $(INC) -e $(@) $(<)

.PHONY: all