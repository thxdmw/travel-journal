package com.thx.traveljournal.map.controller;

import com.thx.traveljournal.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import org.springframework.web.client.RestClient;

/**
 * AUTO / AMAP / OSM 的地区解析规则：部署方手动锁定的值优先于 AUTO 判断；
 * AUTO 按访客地区判断，判断不出来才落到配置的兜底 Provider。
 */
class PublicMapControllerTest {

    private AppProperties.MapSettings settings(String displayProvider, String displayFallback, String geoHeaderName) {
        return new AppProperties.MapSettings("amap", "", true, displayProvider, displayFallback, "test-js-key", "test-security-code",
                "/api/public/_AMapService", "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                "© OpenStreetMap contributors", geoHeaderName);
    }

    private PublicMapController controllerWith(AppProperties.MapSettings settings) {
        return new PublicMapController(new AppProperties(null, null, null, null, settings, null, null, null),
                mock(RestClient.Builder.class));
    }

    @Test
    void manualAmapOverridesAutoResolution() {
        PublicMapController controller = controllerWith(settings("AMAP", "OSM", "CF-IPCountry"));
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("CF-IPCountry")).thenReturn("JP");

        var result = controller.runtime(request).data();

        assertEquals("AMAP", result.mapProvider());
    }

    @Test
    void manualOsmOverridesAutoResolution() {
        PublicMapController controller = controllerWith(settings("OSM", "AMAP", "CF-IPCountry"));
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("CF-IPCountry")).thenReturn("CN");

        var result = controller.runtime(request).data();

        assertEquals("OSM", result.mapProvider());
    }

    @Test
    void autoResolvesToAmapForChina() {
        PublicMapController controller = controllerWith(settings("AUTO", "OSM", "CF-IPCountry"));
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("CF-IPCountry")).thenReturn("CN");

        var result = controller.runtime(request).data();

        assertEquals("CN", result.region());
        assertEquals("AMAP", result.mapProvider());
    }

    @Test
    void autoResolvesToOsmForNonChinaRegion() {
        PublicMapController controller = controllerWith(settings("AUTO", "AMAP", "CF-IPCountry"));
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("CF-IPCountry")).thenReturn("JP");

        var result = controller.runtime(request).data();

        assertEquals("JP", result.region());
        assertEquals("OSM", result.mapProvider());
    }

    @Test
    void autoFallsBackToConfiguredDefaultWhenRegionUnknown() {
        PublicMapController controller = controllerWith(settings("AUTO", "OSM", ""));
        HttpServletRequest request = mock(HttpServletRequest.class);

        var result = controller.runtime(request).data();

        assertNull(result.region());
        assertEquals("OSM", result.mapProvider());
    }

    @Test
    void autoFallsBackWhenProxyReportsUnknownCountryCode() {
        PublicMapController controller = controllerWith(settings("AUTO", "AMAP", "CF-IPCountry"));
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("CF-IPCountry")).thenReturn("XX");

        var result = controller.runtime(request).data();

        assertNull(result.region());
        assertEquals("AMAP", result.mapProvider());
    }

    @Test
    void exposesAmapJsKeyForFrontendScriptLoading() {
        PublicMapController controller = controllerWith(settings("OSM", "AMAP", ""));
        HttpServletRequest request = mock(HttpServletRequest.class);

        var result = controller.runtime(request).data();

        assertEquals("test-js-key", result.amapJsKey());
        assertEquals("/api/public/_AMapService", result.amapServiceHost());
    }

    @Test
    void defaultRuntimeUsesTheControllersOwnAmapProxyPath() {
        PublicMapController controller = controllerWith(AppProperties.MapSettings.DEFAULT);
        HttpServletRequest request = mock(HttpServletRequest.class);

        var result = controller.runtime(request).data();

        assertEquals("/api/public/_AMapService", result.amapServiceHost());
        assertEquals("https://tile.openstreetmap.org/{z}/{x}/{y}.png", result.osmTileUrl());
    }

    @Test
    void jsonpProxyResponseUsesExecutableJavascriptMimeType() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getParameter("callback")).thenReturn("jsonp_998985_1786533593894");
        HttpHeaders upstream = new HttpHeaders();
        upstream.setContentType(MediaType.APPLICATION_OCTET_STREAM);

        MediaType result = PublicMapController.proxyContentType(request, upstream);

        assertEquals("application", result.getType());
        assertEquals("javascript", result.getSubtype());
        assertEquals(StandardCharsets.UTF_8, result.getCharset());
    }

    @Test
    void ordinaryProxyResponseKeepsUpstreamMimeType() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpHeaders upstream = new HttpHeaders();
        upstream.setContentType(MediaType.APPLICATION_JSON);

        MediaType result = PublicMapController.proxyContentType(request, upstream);

        assertEquals(MediaType.APPLICATION_JSON, result);
    }
}
