package com.thx.traveljournal.auth.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.OffsetDateTime;

/**
 * 管理员账号，系统为单管理员设计，通常只有一行。
 *
 * <p>对应数据库表 {@code admin_user}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("admin_user")
public class AdminUser extends BaseEntity {
    /** 登录用户名，全局唯一 */
    private String username;
    /** BCrypt 密码哈希，不存明文 */
    private String passwordHash;
    /** 前台展示的昵称 */
    private String displayName;
    /** 头像在对象存储中的键，为空表示未上传头像 */
    private String avatarObjectKey;
    /** 当前选用的全站主题标识，对应 theme_preset.theme_key */
    private String themeKey;
    /** 账号是否启用，停用后无法登录 */
    private Boolean enabled;
    /** 最近一次登录成功时间 */
    private OffsetDateTime lastLoginAt;
}
