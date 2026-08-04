package com.thx.traveljournal.common.api;

import org.slf4j.MDC;

public final class RequestIds {
    private RequestIds() {}
    public static String current() { return MDC.get("requestId"); }
}
