package com.thx.traveljournal.common.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 所有实体的公共父类，统一提供主键和审计时间字段。
 *
 * <p>创建时间和更新时间由 {@link com.thx.traveljournal.config.MybatisMetaObjectHandler}
 * 在写库时自动填充，业务代码不需要也不应该手动赋值。</p>
 */
@Data
public abstract class BaseEntity {
    /** 主键，由数据库的自增序列生成 */
    @TableId(type = IdType.AUTO)
    private Long id;
    /** 创建时间，插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
    /** 最后更新时间，插入和更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
