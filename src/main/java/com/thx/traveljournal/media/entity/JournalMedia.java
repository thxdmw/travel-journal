package com.thx.traveljournal.media.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 日记与图片的关联关系，一条记录表示某篇日记引用了某张图片。
 *
 * <p>对应数据库表 {@code journal_media}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("journal_media")
public class JournalMedia extends BaseEntity {
    /** 所属日记，日记删除时级联删除 */
    private Long journalEntryId;
    /** 引用的图片；有关联存在时不允许直接删除图片记录 */
    private Long mediaAssetId;
    /** 图片说明 */
    private String caption;
    /** 同一日记内的图片排序号，从 0 开始 */
    private Integer sortOrder;
}
