package com.thx.traveljournal.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(String baseUrl, Admin admin, Upload upload, Minio minio) {
    public record Admin(String username, String password, String displayName) {}
    public record Upload(long maxFileSizeMb, int maxImagesPerJournal, long maxPixels) {}
    public record Minio(String endpoint, String accessKey, String secretKey, String bucket,
                        int presignedUrlTtlMinutes) {}
}
