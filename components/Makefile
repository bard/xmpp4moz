IDLC=/usr/lib/firefox/xpidl
INC=-I. -I/usr/share/idl/xulrunner
XPTS=nsIXMPPClientService.xpt nsIXMPPClientSession.xpt

all: $(XPTS)

%.xpt: %.idl
	$(IDLC) -m typelib -w -v $(INC) -e $(@) $(<)

.PHONY: all