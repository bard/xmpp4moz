IDLC=/home/pkg/gecko-sdk/bin/xpidl
INC=-I. -I/home/pkg/gecko-sdk/idl/
XPTS=nsIXMPPClientService.xpt nsIXMPPClientSession.xpt nsIXMPPConnector.xpt nsIXMPPCacheService.xpt

all: $(XPTS)

%.xpt: %.idl
	$(IDLC) -m typelib -w -v $(INC) -e $(@) $(<)

.PHONY: all