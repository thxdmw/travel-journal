package com.thx.traveljournal.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "app")
/**
 * 应用自定义配置，前缀 {@code app}，具体取值见 .env.example 和 application-*.yml。
 *
 * @param baseUrl 站点对外地址，用于生成绝对链接
 */
public record AppProperties(String baseUrl, Admin admin, Upload upload, Minio minio, MapSettings map) {
    @ConstructorBinding
    public AppProperties {}

    public AppProperties(String baseUrl, Admin admin, Upload upload, Minio minio) {
        this(baseUrl, admin, upload, minio, new MapSettings("amap", "", false));
    }
    public record Admin(String username, String password, String displayName) {}
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
     * @param searchEnabled 关掉后后台只保留地图选点，不再调用第三方搜索接口
     */
    public record MapSettings(String provider, String amapWebServiceKey, boolean searchEnabled) {}
}
