package com.thx.traveljournal.common.api;

import org.slf4j.MDC;

/** 读取当前请求的追踪 id，值由 {@link RequestIdFilter} 放进 MDC。 */
public final class RequestIds {
    private RequestIds() {}
    public static String current() { return MDC.get("requestId"); }
}
