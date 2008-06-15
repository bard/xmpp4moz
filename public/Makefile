IDLC=/usr/lib/xulrunner-1.9/xpidl
INC=-I. -I/usr/share/idl/xulrunner-1.9/unstable/
XPTS=../components/nsIXMPPClientService.xpt \
	../components/nsIXMPPClientSession.xpt \
	../components/nsIXMPPConnector.xpt \
	../components/nsIXMPPCacheService.xpt

all: $(XPTS)

../components/%.xpt: %.idl
	$(IDLC) -m typelib -w -v $(INC) -e $(@) $(<)

.PHONY: all