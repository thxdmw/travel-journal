package com.thx.traveljournal.moment.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 随手记与照片的关联。
 *
 * <p>整理成日记时照片会被同一份 {@code media_asset} 复用而不是重新上传，
 * 所以一张照片可能同时被一条随手记和一篇日记引用。</p>
 *
 * <p>对应数据库表 {@code moment_media}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("moment_media")
public class MomentMedia extends BaseEntity {
    /** 所属随手记，随手记删除时级联删除 */
    private Long momentId;
    /** 引用的图片 */
    private Long mediaAssetId;
    /** 同一条随手记内的照片顺序，从 0 开始 */
    private Integer sortOrder;
}
