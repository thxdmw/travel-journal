package com.thx.traveljournal.config;

import io.minio.MinioClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {
    @Bean
    MinioClient minioClient(AppProperties properties) {
        AppProperties.Minio minio = properties.minio();
        return MinioClient.builder().endpoint(minio.endpoint())
                .credentials(minio.accessKey(), minio.secretKey()).build();
    }
}
