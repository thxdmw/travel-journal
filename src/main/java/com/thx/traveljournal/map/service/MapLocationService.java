package com.thx.traveljournal.map.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.CoordinateConverter;
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
 * <p>高德接口本身按 GCJ-02 坐标系工作，但数据库长期标准坐标统一是 WGS84（见
 * {@link com.thx.traveljournal.common.util.CoordinateConverter}），所以这一层负责在边界上
 * 完成转换：查询前把入参 WGS84 转成 GCJ-02 传给高德，返回结果再转回 WGS84——调用方
 * 和数据库看到的坐标永远是 WGS84，不需要关心高德内部用的是哪套坐标系。
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
                "coordinateSystem", "WGS84"
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
                    // 高德返回的是「经度,纬度」（GCJ-02）；数据库长期标准坐标是 WGS84，
                    // 落库前先转换，调用方拿到的从来都是 WGS84。
                    BigDecimal[] location = parseLocation(text(poi, "location"));
                    if (location == null) continue;
                    double[] wgs84 = CoordinateConverter.gcj02ToWgs84(location[1].doubleValue(), location[0].doubleValue());
                    result.add(new LocationView(
                            text(poi, "id"), text(poi, "name"), text(poi, "address"),
                            text(poi, "pname"), text(poi, "cityname"), text(poi, "adname"),
                            "中国", "CN", text(poi, "adcode"),
                            BigDecimal.valueOf(wgs84[0]), BigDecimal.valueOf(wgs84[1]),
                            "WGS84", "AMAP_SEARCH"));
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
        // 入参是 WGS84（数据库长期标准坐标），高德的逆地理编码接口按 GCJ-02 工作，
        // 查询前转换一次；响应里原样返回调用方传入的 WGS84 坐标，不用高德的回传值。
        double[] gcj02 = CoordinateConverter.wgs84ToGcj02(latitude.doubleValue(), longitude.doubleValue());
        try {
            JsonNode body = client().get().uri(uriBuilder -> uriBuilder.path("/v3/geocode/regeo")
                    .queryParam("key", key)
                    .queryParam("location", gcj02[1] + "," + gcj02[0])
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
                    latitude, longitude, "WGS84", "AMAP_REVERSE");
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
