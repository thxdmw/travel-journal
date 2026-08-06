package com.thx.traveljournal.config;

import io.minio.MinioClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 对象存储客户端配置，连接信息来自 {@link AppProperties.Minio}。 */
@Configuration
public class MinioConfig {
    @Bean
    MinioClient minioClient(AppProperties properties) {
        AppProperties.Minio minio = properties.minio();
        return MinioClient.builder().endpoint(minio.endpoint())
                .credentials(minio.accessKey(), minio.secretKey()).build();
    }
}
