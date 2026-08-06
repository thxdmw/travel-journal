package com.thx.traveljournal.common.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * 给每个请求分配一个追踪 id。
 *
 * <p>id 同时写进日志 MDC、响应头 {@code X-Request-Id} 和统一响应体，
 * 这样用户截图报错就能直接定位到对应的那条日志。</p>
 */
@Component
public class RequestIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        MDC.put("requestId", requestId);
        response.setHeader("X-Request-Id", requestId);
        try { filterChain.doFilter(request, response); }
        finally { MDC.remove("requestId"); }
    }
}
