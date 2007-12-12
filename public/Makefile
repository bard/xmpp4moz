IDLC=/home/pkg/gecko-sdk/bin/xpidl
INC=-I. -I/home/pkg/gecko-sdk/idl/
XPTS=../components/nsIXMPPClientService.xpt \
	../components/nsIXMPPClientSession.xpt \
	../components/nsIXMPPConnector.xpt \
	../components/nsIXMPPCacheService.xpt

all: $(XPTS)

../components/%.xpt: %.idl
	$(IDLC) -m typelib -w -v $(INC) -e $(@) $(<)

.PHONY: all