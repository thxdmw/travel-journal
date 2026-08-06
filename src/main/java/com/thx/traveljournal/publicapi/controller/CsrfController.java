package com.thx.traveljournal.publicapi.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 下发 CSRF 令牌。
 *
 * <p>前端登录后调一次，让 Spring Security 把令牌种进 Cookie，
 * 之后 axios 会自动带上对应的请求头。</p>
 */
@RestController
public class CsrfController {
    @GetMapping("/api/public/csrf")
    public ApiResponse<Map<String, String>> csrf(CsrfToken token) {
        return ApiResponse.ok(Map.of("headerName", token.getHeaderName(), "token", token.getToken()));
    }
}
