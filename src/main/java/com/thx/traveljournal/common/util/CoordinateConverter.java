package com.thx.traveljournal.common.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * WGS84（国际标准，OSM/GPS 使用）与 GCJ-02（国测局加密坐标，高德/腾讯地图使用）之间的转换。
 *
 * <p>数据库长期标准坐标统一是 WGS84（见 {@code TripStop}/{@code Moment}）；这个转换只在需要
 * 对接高德的地方用——把 WGS84 转成 GCJ-02 传给高德地图 JS API 或高德 Web 服务 API，
 * 或者反过来把高德返回的 GCJ-02 坐标转回 WGS84 再落库。中国境外的坐标两套系统重合，
 * 不需要转换，直接原样返回。</p>
 *
 * <p>算法是国测局加密坐标系公开的标准换算公式，被 eviltransform、coordtransform 等
 * 广泛使用的开源实现采用，属于业界通用做法，误差在米级以内，满足地图展示和选点精度。
 * GCJ-02 → WGS84 没有解析解，这里用「按 WGS84 → GCJ-02 的偏移量原样减回去」的通用近似法。</p>
 */
public final class CoordinateConverter {
    private static final double A = 6378245.0;
    private static final double EE = 0.00669342162296594323;

    private CoordinateConverter() {}

    /** 坐标是否落在中国大致范围之外；范围外两套坐标系重合，不需要转换。 */
    public static boolean outOfChina(double lat, double lng) {
        return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
    }

    /** @return {latitude, longitude}，GCJ-02 坐标 */
    public static double[] wgs84ToGcj02(double lat, double lng) {
        if (outOfChina(lat, lng)) return new double[]{lat, lng};
        double dLat = transformLat(lng - 105.0, lat - 35.0);
        double dLng = transformLng(lng - 105.0, lat - 35.0);
        double radLat = lat / 180.0 * Math.PI;
        double magic = Math.sin(radLat);
        magic = 1 - EE * magic * magic;
        double sqrtMagic = Math.sqrt(magic);
        dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * Math.PI);
        dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * Math.PI);
        return new double[]{lat + dLat, lng + dLng};
    }

    /** @return {latitude, longitude}，WGS84 坐标 */
    public static double[] gcj02ToWgs84(double lat, double lng) {
        if (outOfChina(lat, lng)) return new double[]{lat, lng};
        double[] shifted = wgs84ToGcj02(lat, lng);
        return new double[]{lat - (shifted[0] - lat), lng - (shifted[1] - lng)};
    }

    /**
     * 按记录自身的坐标系元数据安全转换为数据库/领域统一使用的 WGS84。
     * 未标记或已经是 WGS84 时原样返回，绝不根据地点位置猜测历史数据来源。
     */
    public static BigDecimal[] toWgs84(BigDecimal latitude, BigDecimal longitude, String coordinateSystem) {
        if (latitude == null || longitude == null || !"GCJ02".equalsIgnoreCase(coordinateSystem)) {
            return new BigDecimal[]{latitude, longitude};
        }
        double[] converted = gcj02ToWgs84(latitude.doubleValue(), longitude.doubleValue());
        return new BigDecimal[]{
                BigDecimal.valueOf(converted[0]).setScale(6, RoundingMode.HALF_UP),
                BigDecimal.valueOf(converted[1]).setScale(6, RoundingMode.HALF_UP)
        };
    }

    private static double transformLat(double x, double y) {
        double ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
        return ret;
    }

    private static double transformLng(double x, double y) {
        double ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
        return ret;
    }
}
