package com.thx.traveljournal.map.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 地点搜索与逆地理编码，接的是高德 Web 服务 API。
 *
 * <p>返回的都是 GCJ-02 坐标，和前台地图使用的瓦片一致，不需要额外转换。
 * 没有配置 AMAP_WEB_SERVICE_KEY 时相关接口会明确报错，后台仍可手动在地图上选点。</p>
 */
@Service
@RequiredArgsConstructor
public class MapLocationService {
    private static final String AMAP_BASE_URL = "https://restapi.amap.com";

    private final RestClient.Builder restClientBuilder;
    private final AppProperties properties;

    public record LocationView(String placeId, String name, String formattedAddress,
                               String province, String city, String district,
                               String country, String countryCode, String adcode,
                               BigDecimal latitude, BigDecimal longitude,
                               String coordinateSystem, String locationSource) {}

    /** 供前端判断要不要显示搜索框：没配 key 时只留地图选点。 */
    public Map<String, Object> status() {
        AppProperties.MapSettings settings = properties.map();
        boolean configured = settings != null && settings.searchEnabled()
                && StringUtils.hasText(settings.amapWebServiceKey());
        return Map.of(
                "provider", settings == null || !StringUtils.hasText(settings.provider()) ? "amap" : settings.provider(),
                "searchEnabled", configured,
                "coordinateSystem", "GCJ02"
        );
    }

    /** 关键词搜索地点。第三方服务不可用时降级为提示手动选点，不让整个弹窗报错。 */
    public List<LocationView> search(String keyword, String region) {
        requireConfigured();
        if (!StringUtils.hasText(keyword)) throw BusinessException.badRequest("请输入城市、景点或地址");
        String key = properties.map().amapWebServiceKey();
        try {
            JsonNode body = client().get().uri(uriBuilder -> {
                var builder = uriBuilder.path("/v5/place/text")
                        .queryParam("key", key)
                        .queryParam("keywords", keyword.trim())
                        .queryParam("page_size", 15)
                        .queryParam("show_fields", "business");
                if (StringUtils.hasText(region)) builder.queryParam("region", region.trim());
                return builder.build();
            }).retrieve().body(JsonNode.class);
            verifyResponse(body);
            List<LocationView> result = new ArrayList<>();
            JsonNode pois = body.path("pois");
            if (pois.isArray()) {
                for (JsonNode poi : pois) {
                    BigDecimal[] location = parseLocation(text(poi, "location"));
                    if (location == null) continue;
                    result.add(new LocationView(
                            text(poi, "id"), text(poi, "name"), text(poi, "address"),
                            text(poi, "pname"), text(poi, "cityname"), text(poi, "adname"),
                            "中国", "CN", text(poi, "adcode"), location[1], location[0],
                            "GCJ02", "AMAP_SEARCH"));
                }
            }
            return result;
        } catch (RestClientException ex) {
            throw BusinessException.badRequest("地点搜索服务暂时不可用，请稍后重试或手动选点");
        }
    }

    /** 逆地理编码：把地图上点到的坐标反查成省市区和详细地址。 */
    public LocationView reverse(BigDecimal latitude, BigDecimal longitude) {
        requireConfigured();
        validateCoordinates(latitude, longitude);
        String key = properties.map().amapWebServiceKey();
        try {
            JsonNode body = client().get().uri(uriBuilder -> uriBuilder.path("/v3/geocode/regeo")
                    .queryParam("key", key)
                    .queryParam("location", longitude.toPlainString() + "," + latitude.toPlainString())
                    .queryParam("extensions", "base")
                    .build()).retrieve().body(JsonNode.class);
            verifyResponse(body);
            JsonNode regeocode = body.path("regeocode");
            JsonNode component = regeocode.path("addressComponent");
            String city = text(component, "city");
            if (!StringUtils.hasText(city)) city = text(component, "province");
            String country = text(component, "country");
            return new LocationView(null, city, text(regeocode, "formatted_address"),
                    text(component, "province"), city, text(component, "district"),
                    country, "中国".equals(country) ? "CN" : null, text(component, "adcode"),
                    latitude, longitude, "GCJ02", "AMAP_REVERSE");
        } catch (RestClientException ex) {
            throw BusinessException.badRequest("地址识别服务暂时不可用，坐标仍可手动保存");
        }
    }

    private RestClient client() {
        return restClientBuilder.baseUrl(AMAP_BASE_URL).build();
    }

    private void requireConfigured() {
        AppProperties.MapSettings settings = properties.map();
        if (settings == null || !settings.searchEnabled() || !StringUtils.hasText(settings.amapWebServiceKey())) {
            throw BusinessException.badRequest("地点搜索尚未配置，请设置 AMAP_WEB_SERVICE_KEY");
        }
    }

    private void verifyResponse(JsonNode body) {
        if (body == null || !"1".equals(text(body, "status"))) {
            String info = body == null ? null : text(body, "info");
            throw BusinessException.badRequest(StringUtils.hasText(info)
                    ? "地图服务返回错误：" + info : "地图服务没有返回有效结果");
        }
    }

    private void validateCoordinates(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null || longitude == null
                || latitude.compareTo(BigDecimal.valueOf(-90)) < 0 || latitude.compareTo(BigDecimal.valueOf(90)) > 0
                || longitude.compareTo(BigDecimal.valueOf(-180)) < 0 || longitude.compareTo(BigDecimal.valueOf(180)) > 0) {
            throw BusinessException.badRequest("经纬度超出有效范围");
        }
    }

    private BigDecimal[] parseLocation(String value) {
        if (!StringUtils.hasText(value)) return null;
        String[] parts = value.split(",");
        if (parts.length != 2) return null;
        try {
            return new BigDecimal[]{new BigDecimal(parts[0]), new BigDecimal(parts[1])};
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || value.isNull()) return null;
        if (value.isArray()) return value.isEmpty() ? null : value.get(0).asText(null);
        return value.asText(null);
    }
}
