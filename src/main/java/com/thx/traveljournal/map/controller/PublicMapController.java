package com.thx.traveljournal.map.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/** 前台地图运行时配置：该用哪个地图 Provider 展示，以及展示要用到的公开 Key。 */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicMapController {
    private static final String FALLBACK_PROVIDER = "AMAP";

    private final AppProperties properties;
    private final RestClient.Builder restClientBuilder;

    /**
     * @param region      访客地区码（从可信 header 读到的就原样返回，读不到是 null），
     *                    仅供前端展示「自动（按地区判断）」这类文案，不用于其他逻辑
     * @param mapProvider 本次应该使用的展示 Provider：AMAP 或 OSM
     * @param amapJsKey   高德 Web端(JS API) Key；未配置时为空字符串，前端应视为高德不可用
     */
    public record RuntimeView(String region, String mapProvider, String amapJsKey,
                              String amapServiceHost, String osmTileUrl, String osmAttribution) {}

    @GetMapping("/runtime")
    public ApiResponse<RuntimeView> runtime(HttpServletRequest request) {
        AppProperties.MapSettings settings = properties.map();
        String region = resolveRegion(request, settings);
        return ApiResponse.ok(new RuntimeView(region, resolveProvider(region, settings),
                settings == null ? "" : nullToEmpty(settings.amapJsKey()),
                settings == null ? "/api/public/_AMapService"
                        : valueOr(settings.amapServiceHost(), "/api/public/_AMapService"),
                settings == null ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        : valueOr(settings.osmTileUrl(), "https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
                settings == null ? "© OpenStreetMap contributors"
                        : valueOr(settings.osmAttribution(), "© OpenStreetMap contributors")));
    }

    /**
     * 高德 JS API 安全代理。前端只知道同源 serviceHost；服务端把安全密钥作为 jscode
     * 追加到发往高德 Web 服务的请求中。只允许 GET 和固定前缀，避免变成开放代理。
     */
    @GetMapping("/_AMapService/**")
    public ResponseEntity<byte[]> amapService(HttpServletRequest request,
                                               @RequestParam(required = false) java.util.Map<String, String> ignored) {
        AppProperties.MapSettings settings = properties.map();
        if (settings == null || !StringUtils.hasText(settings.amapSecurityCode())) {
            return ResponseEntity.notFound().build();
        }
        String prefix = "/api/public/_AMapService/";
        String uri = request.getRequestURI();
        if (!uri.startsWith(prefix)) return ResponseEntity.badRequest().build();
        String path = uri.substring(prefix.length());
        if (path.isBlank() || path.contains("..") || path.contains(":")) return ResponseEntity.badRequest().build();
        // 官方安全代理只需要覆盖 JS API 使用的 Web 服务与自定义底图样式接口，避免把安全码代理扩成任意高德 API 中继。
        boolean styleRequest = path.startsWith("v4/map/styles");
        if (!path.startsWith("v3/") && !styleRequest) return ResponseEntity.badRequest().build();
        List<String> query = new ArrayList<>();
        request.getParameterMap().forEach((name, values) -> {
            if (!"jscode".equalsIgnoreCase(name)) {
                for (String value : values) query.add(encode(name) + "=" + encode(value));
            }
        });
        query.add("jscode=" + encode(settings.amapSecurityCode()));
        String upstream = styleRequest ? "https://webapi.amap.com/" : "https://restapi.amap.com/";
        URI target = URI.create(upstream + path + "?" + String.join("&", query));
        try {
            ResponseEntity<byte[]> response = restClientBuilder.build().get().uri(target).retrieve().toEntity(byte[].class);
            HttpHeaders headers = new HttpHeaders();
            if (response.getHeaders().getContentType() != null) headers.setContentType(response.getHeaders().getContentType());
            headers.setCacheControl("no-store");
            return ResponseEntity.status(response.getStatusCode()).headers(headers).body(response.getBody());
        } catch (RestClientException error) {
            return ResponseEntity.status(502).build();
        }
    }

    /** 读一个可配置的可信 header 判断访客地区；没配置 header 名或读不到值就返回 null，交给兜底逻辑处理。 */
    private String resolveRegion(HttpServletRequest request, AppProperties.MapSettings settings) {
        String headerName = settings == null ? null : settings.geoHeaderName();
        if (!StringUtils.hasText(headerName)) return null;
        String value = request.getHeader(headerName.trim());
        if (!StringUtils.hasText(value)) return null;
        String normalized = value.trim().toUpperCase(java.util.Locale.ROOT);
        // 只接受 ISO 3166-1 alpha-2 形式的国家码。Cloudflare 在无法定位时会返回 XX；
        // 这类值不能被误判为“海外”，应继续走部署配置的 auto-fallback。
        return normalized.matches("[A-Z]{2}") && !"XX".equals(normalized) ? normalized : null;
    }

    /**
     * 部署方可以在配置里把 displayProvider 直接锁定成 AMAP / OSM，跳过地区判断；
     * 默认 AUTO 时按地区决定：中国大陆用高德，其他地区用 OSM，判断不出地区就用兜底值。
     */
    private String resolveProvider(String region, AppProperties.MapSettings settings) {
        String mode = settings == null || !StringUtils.hasText(settings.displayProvider())
                ? "AUTO" : settings.displayProvider().trim().toUpperCase();
        if ("AMAP".equals(mode) || "OSM".equals(mode)) return mode;
        if ("CN".equals(region)) return "AMAP";
        if (region != null) return "OSM";
        String fallback = settings == null || !StringUtils.hasText(settings.displayFallback())
                ? FALLBACK_PROVIDER : settings.displayFallback().trim().toUpperCase();
        return "OSM".equals(fallback) ? "OSM" : "AMAP";
    }

    private String nullToEmpty(String value) { return value == null ? "" : value; }
    private String valueOr(String value, String fallback) { return StringUtils.hasText(value) ? value.trim() : fallback; }
    private String encode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, java.nio.charset.StandardCharsets.UTF_8);
    }
}
