package com.thx.traveljournal.media.service;

import com.thx.traveljournal.config.AppProperties;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "app.minio", name = "verify-on-startup", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class MinioHealthVerifier implements ApplicationRunner {
    private final MinioClient client;
    private final AppProperties properties;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        String bucket = properties.minio().bucket();
        if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
            throw new IllegalStateException("MinIO Bucket 不存在或不可访问: " + bucket);
        }
    }
}
