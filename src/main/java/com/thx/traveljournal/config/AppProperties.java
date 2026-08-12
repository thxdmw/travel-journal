package com.thx.traveljournal.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "app")
/**
 * 应用自定义配置，前缀 {@code app}，具体取值见 .env.example 和 application-*.yml。
 *
 * @param baseUrl 站点对外地址，用于生成绝对链接
 */
public record AppProperties(String baseUrl, Admin admin, Upload upload, Minio minio, MapSettings map,
                            Site site, Ai ai) {
    @ConstructorBinding
    public AppProperties {}

    public AppProperties(String baseUrl, Admin admin, Upload upload, Minio minio) {
        this(baseUrl, admin, upload, minio, MapSettings.DEFAULT, Site.DEFAULT, Ai.DISABLED);
    }
    /**
     * AI 整理随手记。
     *
     * <p>整个功能是可选的：没有 apiKey 就不建客户端，整理照常走规则那条路，只是不润色文字。
     * 这条边界是刻意的——顺序、时间、照片归属这些必须百分之百可靠的东西永远由规则决定，
     * AI 只负责把碎片句子串成能读的段落。</p>
     *
     * @param model Claude 模型标识
     */
    public record Ai(String apiKey, String model) {
        public static final Ai DISABLED = new Ai("", "claude-opus-5");
        public boolean configured() { return apiKey != null && !apiKey.isBlank(); }
    }
    public record Admin(String username, String password, String displayName) {}
    /**
     * 站点自身的属性。
     *
     * @param timezone 站点所在时区，季节主题按它判断当前是春夏秋冬。
     *                 用站点时区而不是访客设备时区，是为了让所有人在同一天看到同一套视觉。
     */
    public record Site(String timezone) {
        public static final Site DEFAULT = new Site("Asia/Shanghai");
    }
    /**
     * 上传限制。
     *
     * @param maxPixels 像素总数上限，防止有人上传超大尺寸图片把服务端内存撑爆
     */
    public record Upload(long maxFileSizeMb, int maxImagesPerJournal, long maxPixels) {}
    /**
     * 对象存储配置。
     *
     * @param presignedUrlTtlMinutes 预签名地址的有效期，过短会让页面上的图片提前失效
     */
    public record Minio(String endpoint, String accessKey, String secretKey, String bucket,
                        int presignedUrlTtlMinutes) {}
    /**
     * 地图服务配置。
     *
     * <p>{@code provider}/{@code amapWebServiceKey}/{@code searchEnabled} 是后台地点搜索
     * （高德 Web 服务 API，服务端专用）的配置；{@code displayProvider} 起是前台地图展示的
     * 配置，两者是完全不同的两个维度——地点搜索永远走高德，展示可以是高德也可以是 OSM。</p>
     *
     * @param searchEnabled    关掉后后台只保留地图选点，不再调用第三方搜索接口
     * @param displayProvider  前台地图展示：AUTO（按访客网络地区判断）/ AMAP / OSM
     * @param displayFallback  AUTO 判断不出地区时的兜底 Provider
     * @param amapJsKey        高德「Web端(JS API)」Key，用于前台地图展示；和 amapWebServiceKey
     *                         不是同一个 key。Key 会出现在浏览器里，安全密钥只能保留在服务端
     * @param amapSecurityCode 高德 JS API 的安全密钥，仅供服务端代理追加 jscode，绝不下发浏览器
     * @param amapServiceHost  前端 {@code window._AMapSecurityConfig.serviceHost}，默认使用同源
     *                         {@code /api/public/_AMapService} 代理，也可由外层 Nginx 提供完整地址
     * @param osmTileUrl       Leaflet 的 OSM 兼容瓦片模板，默认是标准 OSM Provider
     * @param osmAttribution   OSM Provider 的署名文字
     * @param geoHeaderName    判断访客地区用的可信 header 名（例如反向代理注入的国家码），
     *                         留空表示不做地区判断，AUTO 直接落到 displayFallback
     */
    public record MapSettings(String provider, String amapWebServiceKey, boolean searchEnabled,
                              String displayProvider, String displayFallback,
                              String amapJsKey, String amapSecurityCode, String amapServiceHost,
                              String osmTileUrl, String osmAttribution, String geoHeaderName) {
        public static final MapSettings DEFAULT = new MapSettings("amap", "", false, "AUTO", "AMAP", "", "",
                "/api/public/_AMapService", "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                "© OpenStreetMap contributors", "");
    }
}
