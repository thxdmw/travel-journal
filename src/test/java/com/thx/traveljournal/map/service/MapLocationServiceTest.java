package com.thx.traveljournal.map.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 高德接口本身按 GCJ-02 工作，但数据库长期标准坐标是 WGS84：这套用例确认
 * search()/reverse() 边界转换正确——调用方拿到手上的坐标永远是 WGS84。
 */
class MapLocationServiceTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    private RestClient.Builder deepStubClient(JsonNode response) {
        RestClient.Builder builder = mock(RestClient.Builder.class, RETURNS_DEEP_STUBS);
        when(builder.baseUrl(anyString()).build().get().uri(any(java.util.function.Function.class))
                .retrieve().body(JsonNode.class)).thenReturn(response);
        return builder;
    }

    private AppProperties propertiesWithSearchEnabled() {
        AppProperties.MapSettings settings = new AppProperties.MapSettings(
                "amap", "test-web-service-key", true, "AUTO", "AMAP", "", "",
                "/api/public/_AMapService", "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                "© OpenStreetMap contributors", "");
        return new AppProperties(null, null, null, null, settings, null, null, null);
    }

    /** 青城山附近一点，明确在中国境内，GCJ-02 转 WGS84 后数值应该确实发生偏移。 */
    @Test
    void searchConvertsAmapGcj02ResultToWgs84() throws Exception {
        JsonNode response = objectMapper.readTree("""
                {"status":"1","pois":[
                  {"id":"poi1","name":"青城山","address":"都江堰市","pname":"四川省","cityname":"成都市",
                   "adname":"都江堰市","adcode":"510181","location":"103.5678,30.9021"}
                ]}
                """);
        MapLocationService service = new MapLocationService(deepStubClient(response), propertiesWithSearchEnabled());

        var results = service.search("青城山", null);

        assertEquals(1, results.size());
        var item = results.get(0);
        assertEquals("WGS84", item.coordinateSystem());
        assertEquals("AMAP_SEARCH", item.locationSource());
        // 高德原始坐标是 103.5678,30.9021（经度,纬度）；WGS84 应该和它有真实偏移，不是原样透传
        assertNotEquals(0, BigDecimal.valueOf(30.9021).compareTo(item.latitude()));
        assertNotEquals(0, BigDecimal.valueOf(103.5678).compareTo(item.longitude()));
        assertTrue(item.latitude().subtract(BigDecimal.valueOf(30.9021)).abs().doubleValue() < 0.01);
        assertTrue(item.longitude().subtract(BigDecimal.valueOf(103.5678)).abs().doubleValue() < 0.01);
    }

    @Test
    void reverseEchoesBackTheOriginalWgs84InputCoordinate() throws Exception {
        JsonNode response = objectMapper.readTree("""
                {"status":"1","regeocode":{"formatted_address":"四川省成都市都江堰市青城山镇",
                  "addressComponent":{"province":"四川省","city":"成都市","district":"都江堰市",
                  "country":"中国","adcode":"510181"}}}
                """);
        MapLocationService service = new MapLocationService(deepStubClient(response), propertiesWithSearchEnabled());
        BigDecimal inputLat = BigDecimal.valueOf(30.9021), inputLng = BigDecimal.valueOf(103.5678);

        var result = service.reverse(inputLat, inputLng);

        assertEquals("WGS84", result.coordinateSystem());
        assertEquals("AMAP_REVERSE", result.locationSource());
        // 响应里的坐标必须是调用方传入的原始 WGS84 值，不是高德内部查询用的 GCJ-02 值
        assertEquals(0, inputLat.compareTo(result.latitude()));
        assertEquals(0, inputLng.compareTo(result.longitude()));
    }

    @Test
    void statusReportsWgs84AsTheCoordinateSystem() {
        MapLocationService service = new MapLocationService(mock(RestClient.Builder.class), propertiesWithSearchEnabled());

        var status = service.status();

        assertEquals("WGS84", status.get("coordinateSystem"));
    }
}
