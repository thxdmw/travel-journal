package com.thx.traveljournal.media.service;

import com.thx.traveljournal.config.AppProperties;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 启动时检查对象存储桶是否可访问，不通过就直接让应用启动失败。
 *
 * <p>宁可起不来也不要带着坏掉的存储上线，否则问题要等到用户上传图片时才暴露。
 * 本地开发可以用 app.minio.verify-on-startup=false 关掉。</p>
 */
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
