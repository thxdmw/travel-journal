package com.thx.traveljournal.common.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import java.math.BigDecimal;

/**
 * 不依赖外部「标准答案」坐标表，只验证这套换算公式该有的性质：
 * 中国境外原样直通、中国境内确实发生了合理量级的偏移、以及往返换算能近似复原。
 */
class CoordinateConverterTest {
    // 北京天安门，明确在中国境内
    private static final double BEIJING_LAT = 39.9087, BEIJING_LNG = 116.3975;
    // 东京，明确在中国境外
    private static final double TOKYO_LAT = 35.6762, TOKYO_LNG = 139.6503;

    @Test
    void doesNotShiftCoordinatesOutsideChina() {
        double[] gcj02 = CoordinateConverter.wgs84ToGcj02(TOKYO_LAT, TOKYO_LNG);
        assertEquals(TOKYO_LAT, gcj02[0], 1e-9);
        assertEquals(TOKYO_LNG, gcj02[1], 1e-9);

        double[] wgs84 = CoordinateConverter.gcj02ToWgs84(TOKYO_LAT, TOKYO_LNG);
        assertEquals(TOKYO_LAT, wgs84[0], 1e-9);
        assertEquals(TOKYO_LNG, wgs84[1], 1e-9);
    }

    @Test
    void shiftsCoordinatesInsideChinaByAPlausibleMagnitude() {
        double[] gcj02 = CoordinateConverter.wgs84ToGcj02(BEIJING_LAT, BEIJING_LNG);

        assertTrue(Math.abs(gcj02[0] - BEIJING_LAT) > 1e-6, "境内坐标应该确实发生偏移");
        assertTrue(Math.abs(gcj02[1] - BEIJING_LNG) > 1e-6, "境内坐标应该确实发生偏移");
        // GCJ-02 相对 WGS84 的偏移在中国境内通常是几十到几百米量级，0.01 度（约 1km）是足够宽松的上界
        assertTrue(Math.abs(gcj02[0] - BEIJING_LAT) < 0.01, "偏移量级应该在合理范围内");
        assertTrue(Math.abs(gcj02[1] - BEIJING_LNG) < 0.01, "偏移量级应该在合理范围内");
    }

    @Test
    void roundTripApproximatelyRestoresOriginalCoordinate() {
        double[] gcj02 = CoordinateConverter.wgs84ToGcj02(BEIJING_LAT, BEIJING_LNG);
        double[] restored = CoordinateConverter.gcj02ToWgs84(gcj02[0], gcj02[1]);

        // 反向没有解析解，用近似法；误差应该在米级以内，换算成经纬度约 1e-4 度
        assertEquals(BEIJING_LAT, restored[0], 1e-4);
        assertEquals(BEIJING_LNG, restored[1], 1e-4);
    }

    @Test
    void outOfChinaBoundaryIsSymmetric() {
        assertTrue(CoordinateConverter.outOfChina(TOKYO_LAT, TOKYO_LNG));
        assertTrue(!CoordinateConverter.outOfChina(BEIJING_LAT, BEIJING_LNG));
    }

    @Test
    void convertsOnlyWhenCoordinateMetadataExplicitlySaysGcj02() {
        BigDecimal latitude = BigDecimal.valueOf(BEIJING_LAT);
        BigDecimal longitude = BigDecimal.valueOf(BEIJING_LNG);
        BigDecimal[] converted = CoordinateConverter.toWgs84(latitude, longitude, "GCJ02");
        assertTrue(converted[0].compareTo(latitude) != 0);
        assertTrue(converted[1].compareTo(longitude) != 0);

        BigDecimal[] untouched = CoordinateConverter.toWgs84(latitude, longitude, "WGS84");
        assertEquals(latitude, untouched[0]);
        assertEquals(longitude, untouched[1]);
    }
}
