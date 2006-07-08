function forward(src, srcMsgName, dst, dstMsgName) {
    src[srcMsgName] = function() {
        // TODO: leave option to choose in which context the
        // forwarded method will run
        return dst[dstMsgName || srcMsgName].apply(dst, arguments) 
    }
}

