package com.thx.traveljournal.media.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 图片文件本体，记录对象存储中三种规格的位置和图片元信息。
 *
 * <p>对应数据库表 {@code media_asset}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("media_asset")
public class MediaAsset extends BaseEntity {
    /** 所在的对象存储桶名 */
    private String bucketName;
    /** 原图对象键，已剥离 EXIF，仅管理员可访问 */
    private String originalObjectKey;
    /** 展示图对象键，最长边 1280 的 webp */
    private String displayObjectKey;
    /** 缩略图对象键，最长边 480 的 webp */
    private String thumbnailObjectKey;
    /** 768px 中等规格；存量图片为空，访问时回落到 display */
    private String mediumObjectKey;
    /** 上传时的原始文件名，仅作展示用 */
    private String originalFilename;
    /** 由 Tika 嗅探出的真实 MIME 类型，不取客户端声明值 */
    private String contentType;
    /** 原图字节数 */
    private Long fileSize;
    /** 按 EXIF 方向摆正后的像素宽度 */
    private Integer width;
    /** 按 EXIF 方向摆正后的像素高度 */
    private Integer height;
    /** 原图 SHA-256 校验和，用于排查重复和损坏 */
    private String checksumSha256;
    /** 拍摄时间，来自 EXIF DateTimeOriginal；没有 EXIF 的图为空 */
    private java.time.OffsetDateTime capturedAt;
    /** 拍摄纬度，来自 EXIF GPS */
    private java.math.BigDecimal gpsLatitude;
    /** 拍摄经度，来自 EXIF GPS */
    private java.math.BigDecimal gpsLongitude;
}
