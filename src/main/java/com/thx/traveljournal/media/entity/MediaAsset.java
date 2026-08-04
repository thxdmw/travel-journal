package com.thx.traveljournal.media.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("media_asset")
public class MediaAsset extends BaseEntity {
    private String bucketName;
    private String originalObjectKey;
    private String displayObjectKey;
    private String thumbnailObjectKey;
    private String originalFilename;
    private String contentType;
    private Long fileSize;
    private Integer width;
    private Integer height;
    private String checksumSha256;
}
