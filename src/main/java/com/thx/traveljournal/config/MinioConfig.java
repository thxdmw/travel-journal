package com.thx.traveljournal.config;

import io.minio.MinioClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

/** 对象存储客户端配置，连接信息来自 {@link AppProperties.Minio}。 */
@Configuration
public class MinioConfig {
    @Bean
    MinioClient minioClient(AppProperties properties) {
        AppProperties.Minio minio = properties.minio();
        // 缺凭证时在这里就停住，而不是等到第一次上传才报一个看不懂的 403。
        // application.yml 里不再带默认凭证，所以本地开发也需要显式给这三个环境变量。
        requireConfigured(minio.endpoint(), "MINIO_ENDPOINT");
        requireConfigured(minio.accessKey(), "MINIO_ACCESS_KEY");
        requireConfigured(minio.secretKey(), "MINIO_SECRET_KEY");
        return MinioClient.builder().endpoint(minio.endpoint())
                .credentials(minio.accessKey(), minio.secretKey()).build();
    }

    private void requireConfigured(String value, String variable) {
        if (!StringUtils.hasText(value))
            throw new IllegalStateException("对象存储未配置：请设置环境变量 " + variable + "，参考 .env.example");
    }
}
