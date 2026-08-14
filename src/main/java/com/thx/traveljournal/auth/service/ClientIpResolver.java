package com.thx.traveljournal.auth.service;

import com.thx.traveljournal.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 判断这次请求真正来自哪个 IP。
 *
 * <p>登录限流按 IP 计数，所以「这个 IP 是谁说的」直接决定限流能不能被绕过。
 * 以前的做法是无条件取 {@code X-Forwarded-For} 的第一段——那一段完全由客户端自己填，
 * 每次请求换一个假地址，限流就等于不存在，顺带还把内存里的失败计数表撑大。</p>
 *
 * <p>现在只有当直连方本身是配置里列出的可信代理时才读这个头，并且从右往左取第一个
 * 不属于可信代理的地址：右边是离我们最近的、由代理自己追加的，左边才是可以伪造的部分。</p>
 */
@Component
public class ClientIpResolver {
    private final Set<String> trustedProxies;

    public ClientIpResolver(AppProperties properties) {
        this.trustedProxies = parse(properties == null || properties.security() == null
                ? null : properties.security().trustedProxies());
    }

    private static Set<String> parse(String configured) {
        if (!StringUtils.hasText(configured)) return Set.of();
        return Arrays.stream(configured.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    /** 这次请求的客户端 IP。 */
    public String resolve(HttpServletRequest request) {
        String direct = request.getRemoteAddr();
        // 直连方不在可信名单里，说明没有反向代理，或者这个头是客户端自己加的：一律不信
        if (trustedProxies.isEmpty() || !trustedProxies.contains(direct)) return direct;
        String forwarded = request.getHeader("X-Forwarded-For");
        if (!StringUtils.hasText(forwarded)) return direct;
        List<String> hops = Arrays.stream(forwarded.split(","))
                .map(String::trim).filter(StringUtils::hasText).toList();
        for (int i = hops.size() - 1; i >= 0; i--) {
            String hop = hops.get(i);
            if (!trustedProxies.contains(hop)) return hop;
        }
        return direct;
    }
}
