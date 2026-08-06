package com.thx.traveljournal.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String baseUrl, Admin admin, Upload upload, Minio minio, MapSettings map) {
    @ConstructorBinding
    public AppProperties {}

    public AppProperties(String baseUrl, Admin admin, Upload upload, Minio minio) {
        this(baseUrl, admin, upload, minio, new MapSettings("amap", "", false));
    }
    public record Admin(String username, String password, String displayName) {}
    public record Upload(long maxFileSizeMb, int maxImagesPerJournal, long maxPixels) {}
    public record Minio(String endpoint, String accessKey, String secretKey, String bucket,
                        int presignedUrlTtlMinutes) {}
    public record MapSettings(String provider, String amapWebServiceKey, boolean searchEnabled) {}
}
