IDLC=/usr/lib/xulrunner/sdk/bin/xpidl
INC=-I. -I/usr/share/idl/xulrunner
XPTS=nsIXMPPClientService.xpt nsIXMPPClientSession.xpt nsIXMPPTransport.xpt

all: $(XPTS)

%.xpt: %.idl
	$(IDLC) -m typelib -w -v $(INC) -e $(@) $(<)

.PHONY: all